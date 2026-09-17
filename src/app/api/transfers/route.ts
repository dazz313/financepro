import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";

// GET /api/transfers - daftar transfer antar akun
export async function GET() {
  const transfers = await db.transfer.findMany({
    orderBy: { number: "asc" },
    include: {
      fromBankAccount: { select: { id: true, code: true, name: true, accountCode: true } },
      toBankAccount: { select: { id: true, code: true, name: true, accountCode: true } },
    },
  });
  return NextResponse.json({ transfers });
}

// POST /api/transfers - catat transfer + auto-post journal
// Jurnal: Debit akun bank TUJUAN, Kredit akun bank SUMBER
// (kas masuk di tujuan, kas keluar dari sumber)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, amount, fromBankAccountId, toBankAccountId, description, reference } = body;

    if (!date || !amount || !fromBankAccountId || !toBankAccountId) {
      return NextResponse.json({ error: "Tanggal, jumlah, akun sumber & tujuan wajib diisi" }, { status: 400 });
    }
    if (fromBankAccountId === toBankAccountId) {
      return NextResponse.json({ error: "Akun sumber dan tujuan tidak boleh sama" }, { status: 400 });
    }
    const amt = Number(amount);
    if (amt <= 0) {
      return NextResponse.json({ error: "Jumlah harus > 0" }, { status: 400 });
    }

    const fromBank = await db.bankAccount.findUnique({ where: { id: fromBankAccountId } });
    const toBank = await db.bankAccount.findUnique({ where: { id: toBankAccountId } });
    if (!fromBank || !toBank) {
      return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
    }

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const fromAccId = codeMap.get(fromBank.accountCode);
    const toAccId = codeMap.get(toBank.accountCode);
    if (!fromAccId || !toAccId) {
      return NextResponse.json({ error: "Akun CoA untuk bank tidak valid" }, { status: 400 });
    }

    const number = await nextCode(db, "transfer", { date });
    const entryNumber = await nextCode(db, "journal", { date });

    const result = await db.$transaction(async (tx) => {
      // Journal: Debit akun tujuan (kas masuk), Kredit akun sumber (kas keluar)
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: new Date(date),
          description: description || `Transfer ${number}: ${fromBank.name} → ${toBank.name}`,
          reference: reference || number,
          source: "TRANSFER",
          lines: {
            create: [
              { accountId: toAccId, debit: amt, credit: 0, bankAccountId: toBankAccountId, description: `Transfer masuk dari ${fromBank.name}` },
              { accountId: fromAccId, debit: 0, credit: amt, bankAccountId: fromBankAccountId, description: `Transfer keluar ke ${toBank.name}` },
            ],
          },
        },
      });

      const transfer = await tx.transfer.create({
        data: {
          number,
          date: new Date(date),
          amount: amt,
          fromBankAccountId,
          toBankAccountId,
          description: description || null,
          reference: reference || null,
          journalEntryId: entry.id,
        },
        include: {
          fromBankAccount: { select: { code: true, name: true } },
          toBankAccount: { select: { code: true, name: true } },
        },
      });

      return { transfer, entry };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Transfer create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat transfer" }, { status: 500 });
  }
}
