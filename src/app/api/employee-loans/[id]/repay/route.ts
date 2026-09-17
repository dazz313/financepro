import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { nextCode } from "@/lib/code-gen";
import { ensureSystemAccounts } from "@/lib/ensure-system-accounts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/employee-loans/[id]/repay - catat pembayaran cicilan pinjaman karyawan
// body: { date, amount, interest?, bankAccountId?, reference?, notes? }
// Jurnal: Debit Kas/Bank = amount (pokok + bunga)
//         Kredit Piutang Karyawan (accountCode pinjaman) = pokok
//         Kredit Pendapatan Bunga (4-2200) = bunga (bila ada)
export async function POST(req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const loan = await db.employeeLoan.findUnique({ where: { id }, include: { employee: true } });
    if (!loan) return NextResponse.json({ error: "Pinjaman tidak ditemukan" }, { status: 404 });
    if (loan.status === "PAID") return NextResponse.json({ error: "Pinjaman sudah lunas" }, { status: 400 });
    if (loan.status === "CANCELLED") return NextResponse.json({ error: "Pinjaman dibatalkan" }, { status: 400 });

    const date = body.date ? new Date(body.date) : new Date();
    const amount = Number(body.amount) || 0;
    if (amount <= 0) return NextResponse.json({ error: "Jumlah cicilan harus > 0" }, { status: 400 });
    const interest = Math.max(0, Number(body.interest) || 0);
    const principal = Math.max(0, amount - interest);
    if (principal <= 0) return NextResponse.json({ error: "Pokok cicilan harus > 0 (jumlah harus lebih besar dari bunga)" }, { status: 400 });

    const remaining = Math.max(0, loan.amount - loan.paidAmount);
    if (remaining + 0.01 < principal && loan.status !== "CANCELLED") {
      return NextResponse.json({ error: `Pokok cicilan melebihi sisa pinjaman (sisa: ${remaining.toLocaleString("id-ID")})` }, { status: 400 });
    }

    // Pastikan akun sistem (Pendapatan Bunga) tersedia sebelum membangun codeMap
    await ensureSystemAccounts();

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const receivableAcc = codeMap.get(loan.accountCode);
    if (!receivableAcc) return NextResponse.json({ error: `Akun piutang '${loan.accountCode}' tidak ditemukan di CoA` }, { status: 400 });
    const interestAccId = interest > 0 ? codeMap.get("4-2200") : undefined;
    if (interest > 0 && !interestAccId) {
      return NextResponse.json({ error: "Akun 4-2200 Pendapatan Bunga tidak ditemukan di CoA" }, { status: 400 });
    }

    // Akun kas/bank penerima cicilan (Manager.io: uang masuk → Receipts, wajib kas/bank)
    if (!body.bankAccountId) {
      return NextResponse.json({ error: "Pilih akun kas/bank penerima cicilan (uang masuk harus tampil di Penerimaan)" }, { status: 400 });
    }
    const bank = await db.bankAccount.findUnique({ where: { id: body.bankAccountId } });
    if (!bank) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
    const cashAccId = codeMap.get(bank.accountCode);
    if (!cashAccId) return NextResponse.json({ error: "Akun kas/bank tidak ditemukan di CoA" }, { status: 400 });

    const newPaid = loan.paidAmount + principal;
    const newStatus = newPaid + 0.01 >= loan.amount ? "PAID" : "ACTIVE";

    const result = await db.$transaction(async (tx) => {
      const entryNumber = await nextCode(tx, "journal", { date });
      const lines: any[] = [
        { accountId: cashAccId, debit: amount, credit: 0, bankAccountId: body.bankAccountId, description: `Terima cicilan ${loan.number} ke ${bank.name}` },
        { accountId: receivableAcc, debit: 0, credit: principal, description: `Kurangi piutang ${loan.number}` },
      ];
      if (interest > 0 && interestAccId) {
        lines.push({ accountId: interestAccId, debit: 0, credit: interest, description: `Bunga cicilan ${loan.number}` });
      }
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date,
          description: `Cicilan pinjaman ${loan.number} - ${loan.employee.name}${interest > 0 ? ` (bunga ${interest.toLocaleString("id-ID")})` : ""}`,
          reference: body.reference || loan.number,
          source: "EMPLOYEE_LOAN_REPAY",
          lines: { create: lines },
        },
      });

      // Manager.io: penerimaan cicilan tampil di view Penerimaan
      const receiptNumber = await nextCode(tx, "receipt", { date });
      await tx.receipt.create({
        data: {
          number: receiptNumber,
          date,
          amount,
          fromContactId: null,
          bankAccountId: body.bankAccountId,
          accountCode: loan.accountCode,
          description: `Cicilan pinjaman ${loan.number} - ${loan.employee.name}${interest > 0 ? ` (bunga ${interest.toLocaleString("id-ID")})` : ""}`,
          reference: body.reference || loan.number,
          journalEntryId: entry.id,
          source: "EMPLOYEE_LOAN_REPAY",
        },
      });

      const updated = await tx.employeeLoan.update({
        where: { id: loan.id },
        data: { paidAmount: newPaid, status: newStatus, notes: body.notes !== undefined ? body.notes : loan.notes },
        include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
      });
      return { entry, loan: updated };
    });

    return NextResponse.json({
      message: "Cicilan dicatat",
      loan: { ...result.loan, remainingAmount: Math.max(0, result.loan.amount - result.loan.paidAmount) },
      journalEntryId: result.entry.id,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mencatat cicilan" }, { status: 500 });
  }
}