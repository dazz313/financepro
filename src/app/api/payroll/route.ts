import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { ensureSystemAccounts } from "@/lib/ensure-system-accounts";
import { getUserFromRequest } from "@/lib/auth";
import { createBalancedJournal } from "@/lib/accounting-engine";

// GET /api/payroll - daftar payroll entries
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const entries = await db.payrollEntry.findMany({
    orderBy: { payDate: "desc" },
    take: limit,
    include: { employee: true },
  });
  return NextResponse.json({ payroll: entries });
}

// POST /api/payroll - buat payroll + auto-post journal entry
// Jurnal: Debit Beban Gaji (5-1100) = gross + iuran BPJS pemberi kerja
//         Kredit Kas/Bank (1-1200/1-1100) = net
//         Kredit Hutang Pajak (2-1200) = PPh 21
//         Kredit Hutang BPJS (2-1500) = potongan BPJS pegawai + iuran pemberi kerja
export async function POST(req: NextRequest) {
  const authUser = await getUserFromRequest(req);
  if (!authUser) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (authUser.role !== "ADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const body = await req.json();
    const { employeeId, payPeriod, payDate } = body;
    if (!employeeId || !payPeriod || !payDate) {
      return NextResponse.json({ error: "employeeId, payPeriod, payDate wajib diisi" }, { status: 400 });
    }
    const emp = await db.employee.findUnique({ where: { id: employeeId } });
    if (!emp) {
      return NextResponse.json({ error: "Pegawai tidak ditemukan" }, { status: 404 });
    }
    const basicSalary = emp.basicSalary;
    const allowance = emp.allowance;
    const grossPay = basicSalary + allowance;
    const taxDeduction = grossPay * (emp.taxRate / 100);
    const bpjsDeduction = grossPay * (emp.bpjsRate / 100);
    const otherDeduction = Number(body.otherDeduction) || 0;
    const totalDeduction = taxDeduction + bpjsDeduction + otherDeduction;
    const netPay = grossPay - totalDeduction;

    // Iuran BPJS pemberi kerja (persen dari gross, disetorkan bersama potongan pegawai)
    const settings = await db.companySettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    const bpjsEmployerRate = Number(settings.bpjsEmployerRate ?? 0) || 0;
    const bpjsEmployer = grossPay * (bpjsEmployerRate / 100);

    // Pastikan akun sistem (Hutang BPJS) tersedia di CoA
    await ensureSystemAccounts();

    // Akun kas/bank untuk transfer gaji (Manager.io: uang keluar lewat Payments)
    const bankAccountId = body.bankAccountId || emp.bankAccountId || null;
    let bankAccount: { name: string; accountCode: string } | null = null;
    if (netPay > 0) {
      if (!bankAccountId) {
        return NextResponse.json({ error: "Pilih akun kas/bank untuk transfer gaji (uang keluar harus tampil di Pembayaran)" }, { status: 400 });
      }
      bankAccount = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { name: true, accountCode: true } });
      if (!bankAccount) {
        return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
      }
    }

    // Generate payroll number
    const number = await nextCode(db, "payroll", { date: payDate });

    // Cari akun untuk jurnal
    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const salaryAcc = codeMap.get("5-1100"); // Beban Gaji
    const bankAcc = bankAccount ? codeMap.get(bankAccount.accountCode) : codeMap.get("1-1100");
    const taxAcc = codeMap.get("2-1200"); // Hutang Pajak (PPh 21)
    const bpjsAcc = codeMap.get("2-1500") ?? taxAcc; // Hutang BPJS (fallback jaga-jaga)

    if (!salaryAcc || !bankAcc) {
      return NextResponse.json({ error: "Akun default payroll belum dikonfigurasi" }, { status: 400 });
    }

    // Generate journal entry number
    const entryNumber = await nextCode(db, "journal", { date: payDate });
    const paymentNumber = await nextCode(db, "payment", { date: payDate });

    // Buat payroll + journal dalam transaksi
    const result = await db.$transaction(async (tx) => {
      const journalLines: any[] = [
        { accountId: salaryAcc, debit: grossPay + bpjsEmployer, credit: 0, description: `Gaji ${emp.name} - ${number}` },
        { accountId: bankAcc, debit: 0, credit: netPay, bankAccountId: bankAccountId || undefined, description: `Pembayaran gaji ${emp.name} dari ${bankAccount?.name ?? "Kas"}` },
      ];
      if (taxDeduction > 0 && taxAcc) {
        journalLines.push({ accountId: taxAcc, debit: 0, credit: taxDeduction, description: `PPh 21 ${emp.name}` });
      }
      const bpjsTotal = bpjsDeduction + bpjsEmployer;
      if (bpjsTotal > 0 && bpjsAcc) {
        journalLines.push({ accountId: bpjsAcc, debit: 0, credit: bpjsTotal, description: `BPJS (pegawai ${bpjsDeduction} + pemberi kerja ${bpjsEmployer}) ${emp.name}` });
      }

      const entry = await createBalancedJournal(tx, {
          entryNumber,
          date: new Date(payDate),
          description: `Penggajian ${emp.name} - ${number} (${new Date(payPeriod).toLocaleDateString("id-ID", { month: "long", year: "numeric" })})`,
          reference: number,
          source: "MANUAL",
          userId: authUser?.id,
          lines: [...journalLines],
        });

      const payroll = await tx.payrollEntry.create({
        data: {
          number,
          employeeId,
          payPeriod: new Date(payPeriod),
          payDate: new Date(payDate),
          basicSalary,
          allowance,
          grossPay,
          taxDeduction,
          bpjsDeduction,
          otherDeduction,
          totalDeduction,
          bpjsEmployer,
          netPay,
          status: "PAID",
          journalEntryId: entry.id,
        },
        include: { employee: true },
      });

      // Manager.io: pembayaran gaji tampil di view Pembayaran
      if (netPay > 0) {
        await tx.payment.create({
          data: {
            number: paymentNumber,
            date: new Date(payDate),
            amount: netPay,
            toContactId: null,
            bankAccountId: bankAccountId!,
            accountCode: "5-1100",
            description: `Gaji ${emp.name} - ${number}`,
            reference: number,
            journalEntryId: entry.id,
            source: "PAYROLL",
          },
        });
      }

      return { payroll, entry };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Payroll create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat payroll" }, { status: 500 });
  }
}