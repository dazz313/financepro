import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { getUserFromRequest } from "@/lib/auth";
import { createBalancedJournal } from "@/lib/accounting-engine";

// POST /api/invoices/[id]/refund — refund dari supplier (pembelian)
// Jurnal: Dr Kas/Bank, Cr Hutang Usaha (atau Dr Hutang, Cr Kas jika refund dari kita)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req);
    const { id } = await params;
    const { reason, refundDate, bankAccountId, amount } = await req.json();

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    if (invoice.type !== "PURCHASE") return NextResponse.json({ error: "Refund hanya untuk faktur pembelian" }, { status: 400 });

    const refundAmount = amount || (invoice.subtotal - invoice.discount + invoice.taxAmount);
    if (refundAmount <= 0) {
      return NextResponse.json({ error: "Jumlah refund harus > 0" }, { status: 400 });
    }

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));

    if (!bankAccountId) {
      return NextResponse.json({ error: "Akun bank wajib diisi untuk refund" }, { status: 400 });
    }
    const bank = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { accountCode: true, name: true } });
    if (!bank) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });

    const bankAccId = codeMap.get(bank.accountCode);
    const apAccId = codeMap.get("2-1100"); // Hutang Usaha
    if (!bankAccId) return NextResponse.json({ error: `Akun bank ${bank.accountCode} tidak valid` }, { status: 400 });
    if (!apAccId) return NextResponse.json({ error: "Akun Hutang Usaha tidak ditemukan" }, { status: 400 });

    const today = refundDate ? new Date(refundDate) : new Date();
    const entryNumber = await nextCode(db, "journal", { date: today });

    // Refund dari supplier: Dr Kas/Bank, Cr Hutang Usaha
    // (Supplier mengembalikan uang → kas naik, hutang naik kembali)
    const result = await db.$transaction(async (tx) => {
      const entry = await createBalancedJournal(tx, {
        entryNumber,
        date: today,
        description: `Refund dari supplier — ${invoice.number}${reason ? ` — ${reason}` : ""}`,
        reference: invoice.number,
        source: "REFUND",
        sourceId: invoice.id,
        userId: user?.id,
        lines: [
          { accountId: bankAccId, debit: refundAmount, credit: 0, bankAccountId, description: `Refund ke ${bank.name}` },
          { accountId: apAccId, debit: 0, credit: refundAmount, description: `Refund ${invoice.number}` },
        ],
      });

      // Kurangi paidAmount (karena uang masuk kembali)
      const newPaid = Math.max(0, invoice.paidAmount - refundAmount);
      await tx.invoice.update({
        where: { id },
        data: { paidAmount: newPaid },
      });

      return entry;
    });

    return NextResponse.json({
      journal: result,
      message: `Refund Rp ${refundAmount.toLocaleString("id-ID")} tercatat (Dr Kas, Cr Hutang)`,
    });
  } catch (error) {
    console.error("Refund error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mencatat refund" }, { status: 500 });
  }
}
