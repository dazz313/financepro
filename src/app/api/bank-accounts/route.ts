import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode, generateOrUseCode, CodeConflictError } from "@/lib/code-gen";
import { computeBankBalances } from "@/lib/bank-balance";

// GET /api/bank-accounts - daftar akun bank/kas + saldo
export async function GET() {
  const accounts = await db.bankAccount.findMany({
    orderBy: { code: "asc" },
  });
  // Hitung saldo tiap rekening = saldo tertaut rekening + saldo akun CoA yang
  // belum tertaut (dialihkan ke rekening utama). Konsisten dengan dashboard.
  const { byId } = await computeBankBalances();
  const result = accounts.map((a) => ({
    ...a,
    balance: byId.get(a.id) ?? 0,
  }));
  return NextResponse.json({ bankAccounts: result });
}

// POST /api/bank-accounts - buat akun bank/kas baru
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, bankName, accountNumber, accountHolder, branch, type, currency, accountCode, openingBalance, description } = body;
    if (!name || !accountCode) {
      return NextResponse.json({ error: "Name dan accountCode wajib diisi" }, { status: 400 });
    }
    const code = await generateOrUseCode(
      db,
      "bankAccount",
      body.code,
      async (c) => !!(await db.bankAccount.findUnique({ where: { code: c } })),
      {}
    );
    // Validasi accountCode ada di chart of accounts
    const acc = await db.account.findUnique({ where: { code: accountCode } });
    if (!acc) {
      return NextResponse.json({ error: `Akun ${accountCode} tidak ditemukan di Chart of Accounts` }, { status: 400 });
    }
    const bank = await db.bankAccount.create({
      data: {
        code, name, bankName: bankName || null, accountNumber: accountNumber || null,
        accountHolder: accountHolder || null, branch: branch || null,
        type: type || "BANK", currency: currency || "IDR", accountCode,
        openingBalance: Number(openingBalance) || 0, description: description || null,
      },
    });
    // Jika ada openingBalance, buat jurnal opening balance
    if ((Number(openingBalance) || 0) > 0) {
      const entryNumber = await nextCode(db, "journal", { date: new Date() });
      const cashAccount = await db.account.findFirst({ where: { OR: [{ subtype: "Cash" }, { subtype: "Bank" }] }, take: 1 });
      await db.journalEntry.create({
        data: {
          entryNumber,
          date: new Date(),
          description: `Saldo awal ${name}`,
          reference: `OPEN-${code}`,
          source: "OPENING",
          lines: {
            create: [
              { accountId: acc.id, debit: Number(openingBalance), credit: 0, bankAccountId: bank.id },
              { accountId: (await db.account.findFirst({ where: { code: "3-1000" } }))!.id, debit: 0, credit: Number(openingBalance) },
            ],
          },
        },
      });
    }
    return NextResponse.json({ bankAccount: bank });
  } catch (error) {
    const status = error instanceof CodeConflictError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat akun bank" }, { status });
  }
}
