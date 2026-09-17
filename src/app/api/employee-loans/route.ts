import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { nextCode } from "@/lib/code-gen";
import { ensureSystemAccounts } from "@/lib/ensure-system-accounts";

// GET /api/employee-loans - daftar hutang/kasbon karyawan
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where: any = {};
  if (status && status !== "ALL") where.status = status;
  const loans = await db.employeeLoan.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      employee: { select: { id: true, code: true, name: true, position: true, department: true } },
    },
  });
  // Tambahkan sisa saldo
  const result = loans.map((l) => ({
    ...l,
    remainingAmount: Math.max(0, l.amount - l.paidAmount),
  }));
  return NextResponse.json({ loans: result });
}

// POST /api/employee-loans - berikan pinjaman/kasbon + auto-post jurnal
// Jurnal: Debit Piutang Karyawan (1-1700), Kredit Kas/Bank (bankAccountId->accountCode)
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const body = await req.json();
    const { employeeId, date, amount, accountCode, bankAccountId, description, installmentAmount, interestRate, notes } = body;
    if (!employeeId || !date || !amount) {
      return NextResponse.json({ error: "Pegawai, tanggal, dan jumlah wajib diisi" }, { status: 400 });
    }
    const amt = Number(amount) || 0;
    if (amt <= 0) return NextResponse.json({ error: "Jumlah harus > 0" }, { status: 400 });
    const emp = await db.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: "Pegawai tidak ditemukan" }, { status: 404 });

    // Akun piutang karyawan & kas/bank (Manager.io: uang keluar → Payments, wajib kas/bank)
    await ensureSystemAccounts();
    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const receivableAcc = codeMap.get(accountCode || "1-1700");
    if (!receivableAcc) {
      return NextResponse.json({ error: `Akun piutang '${accountCode || "1-1700"}' tidak ditemukan di CoA` }, { status: 400 });
    }
    if (!bankAccountId) {
      return NextResponse.json({ error: "Pilih akun kas/bank sumber dana (uang keluar harus tampil di Pembayaran)" }, { status: 400 });
    }
    const bank = await db.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!bank) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
    const bankAccId = codeMap.get(bank.accountCode);
    if (!bankAccId) return NextResponse.json({ error: "Akun kas/bank tidak ditemukan di CoA" }, { status: 400 });

    const number = await nextCode(db, "loan", { date });
    const paymentNumber = await nextCode(db, "payment", { date });

    const result = await db.$transaction(async (tx) => {
      const entryNumber = await nextCode(tx, "journal", { date });
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: new Date(date),
          description: `Pinjaman/kasbon ${number} - ${emp.name}`,
          reference: number,
          source: "EMPLOYEE_LOAN",
          lines: {
            create: [
              { accountId: receivableAcc, debit: amt, credit: 0, description: `Pinjaman ${number}` },
              { accountId: bankAccId, debit: 0, credit: amt, bankAccountId, description: `Cairkan pinjaman ${number} dari ${bank.name}` },
            ],
          },
        },
      });

      // Manager.io: pencairan pinjaman tampil di view Pembayaran
      await tx.payment.create({
        data: {
          number: paymentNumber,
          date: new Date(date),
          amount: amt,
          toContactId: null,
          bankAccountId,
          accountCode: accountCode || "1-1700",
          description: `Pinjaman/kasbon ${number} - ${emp.name}`,
          reference: number,
          journalEntryId: entry.id,
          source: "EMPLOYEE_LOAN",
        },
      });

      const loan = await tx.employeeLoan.create({
        data: {
          number,
          employeeId,
          date: new Date(date),
          amount: amt,
          paidAmount: 0,
          installmentAmount: Number(installmentAmount) || 0,
          accountCode: accountCode || "1-1700",
          bankAccountId: bankAccountId || null,
          description: description || null,
          interestRate: Number(interestRate) || 0,
          status: "ACTIVE",
          journalEntryId: entry.id,
          notes: notes || null,
        },
        include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
      });
      return { loan, entry };
    });

    return NextResponse.json({ ...result.entry, loan: result.loan }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat pinjaman" }, { status: 500 });
  }
}