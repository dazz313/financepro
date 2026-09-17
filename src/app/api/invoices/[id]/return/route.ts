import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { getUserFromRequest } from "@/lib/auth";
import { createBalancedJournal } from "@/lib/accounting-engine";

// POST /api/invoices/[id]/return — retur penjualan
// Jurnal pembalik: Dr Pendapatan, Cr Piutang/Kas
// Stok dikembalikan jika ada item inventory.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req);
    const { id } = await params;
    const { reason, returnDate, bankAccountId, items } = await req.json();
    // items: [{ invoiceLineId: string, quantity: number, unitPrice: number }]

    const invoice = await db.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    if (invoice.type !== "SALES") return NextResponse.json({ error: "Retur hanya untuk faktur penjualan" }, { status: 400 });

    const today = returnDate ? new Date(returnDate) : new Date();
    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));

    // Hitung total retur
    let totalReturn = 0;
    const returnItems: { lineId: string; qty: number; price: number; amount: number }[] = [];

    if (items && items.length > 0) {
      for (const ri of items) {
        const line = invoice.lines.find((l) => l.id === ri.invoiceLineId);
        if (!line) return NextResponse.json({ error: `Baris invoice ${ri.invoiceLineId} tidak ditemukan` }, { status: 400 });
        if (ri.quantity > line.quantity) {
          return NextResponse.json({ error: `Jumlah retur melebihi jumlah jual (${line.quantity})` }, { status: 400 });
        }
        const amount = ri.quantity * (ri.unitPrice ?? line.unitPrice);
        totalReturn += amount;
        returnItems.push({ lineId: line.id, qty: ri.quantity, price: ri.unitPrice ?? line.unitPrice, amount });
      }
    } else {
      // Retur penuh
      totalReturn = invoice.subtotal - invoice.discount + invoice.taxAmount;
      for (const line of invoice.lines) {
        returnItems.push({ lineId: line.id, qty: line.quantity, price: line.unitPrice, amount: line.quantity * line.unitPrice });
      }
    }

    if (totalReturn <= 0) {
      return NextResponse.json({ error: "Total retur harus > 0" }, { status: 400 });
    }

    // Susun jurnal retur: Dr Pendapatan, Cr Piutang
    const revAccId = codeMap.get("4-1100") ?? codeMap.get("4-1000");
    const arAccId = codeMap.get("1-1300");
    if (!revAccId) return NextResponse.json({ error: "Akun pendapatan tidak ditemukan" }, { status: 400 });
    if (!arAccId) return NextResponse.json({ error: "Akun piutang tidak ditemukan" }, { status: 400 });

    const lines: { accountId: string; debit: number; credit: number; description?: string }[] = [
      { accountId: revAccId, debit: totalReturn, credit: 0, description: `Retur ${invoice.number} — ${reason || "tanpa keterangan"}` },
      { accountId: arAccId, debit: 0, credit: totalReturn, description: `Retur ${invoice.number}` },
    ];

    // Jika refund langsung (kas keluar), ganti piutang dengan bank
    if (bankAccountId) {
      const bank = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { accountCode: true, name: true } });
      if (bank) {
        const bankAccId = codeMap.get(bank.accountCode);
        if (bankAccId) {
          lines[1] = { accountId: bankAccId, debit: 0, credit: totalReturn, bankAccountId, description: `Refund ${invoice.number} ke ${bank.name}` };
        }
      }
    }

    const entryNumber = await nextCode(db, "journal", { date: today });

    const result = await db.$transaction(async (tx) => {
      const entry = await createBalancedJournal(tx, {
        entryNumber,
        date: today,
        description: `Retur ${invoice.number}${reason ? ` — ${reason}` : ""}`,
        reference: invoice.number,
        source: "RETURN",
        sourceId: invoice.id,
        userId: user?.id,
        lines,
      });

      // Kembalikan stok jika ada item
      for (const ri of returnItems) {
        const line = invoice.lines.find((l) => l.id === ri.lineId);
        if (line?.itemId) {
          await tx.inventoryItem.update({
            where: { id: line.itemId },
            data: { quantityOnHand: { increment: ri.qty } },
          });
        }
      }

      // Kurangi paidAmount
      const newPaid = Math.max(0, invoice.paidAmount - totalReturn);
      await tx.invoice.update({
        where: { id },
        data: { paidAmount: newPaid },
      });

      return entry;
    });

    return NextResponse.json({
      journal: result,
      message: `Retur Rp ${totalReturn.toLocaleString("id-ID")} tercatat (Dr Pendapatan, Cr ${bankAccountId ? "Bank" : "Piutang"})`,
    });
  } catch (error) {
    console.error("Return error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mencatat retur" }, { status: 500 });
  }
}
