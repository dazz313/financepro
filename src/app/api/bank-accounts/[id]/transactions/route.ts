import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeBankBalances } from "@/lib/bank-balance";

// GET /api/bank-accounts/[id]/transactions - transaksi untuk akun bank tertentu
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bank = await db.bankAccount.findUnique({ where: { id } });
  if (!bank) {
    return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 404 });
  }
  const lines = await db.journalLine.findMany({
    where: { bankAccountId: bank.id },
    include: { entry: { select: { entryNumber: true, date: true, description: true, reference: true, source: true } } },
    orderBy: { entry: { date: "asc" } },
    take: 200,
  });
  // Basis saldo = saldo konsisten dengan akun CoA (orphan akun dialihkan ke
  // rekening utama), dikurangi jumlah baris tertaut yang sudah tampil di bawah.
  const { byId } = await computeBankBalances();
  const totalLinked = lines.reduce((s, l) => s + (l.debit - l.credit), 0);
  const base = (byId.get(bank.id) ?? 0) - totalLinked;
  // Hitung running balance kronologis (aset normal debit)
  let running = base;
  const txs = lines.map((l) => {
    running += (l.debit - l.credit);
    return {
      id: l.id,
      entryNumber: l.entry.entryNumber,
      date: l.entry.date,
      description: l.entry.description,
      reference: l.entry.reference,
      source: l.entry.source,
      debit: l.debit,
      credit: l.credit,
      balance: running,
    };
  });
  txs.reverse();
  return NextResponse.json({ bankAccount: bank, transactions: txs, balance: running, openingBalanceBase: base });
}