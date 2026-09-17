import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { getUserFromRequest } from "@/lib/auth";
import { createBalancedJournal } from "@/lib/accounting-engine";

// GET /api/inventory/movements - semua pergerakan stok
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const movements = await db.inventoryMovement.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: { item: { select: { code: true, name: true, unit: true } } },
  });
  return NextResponse.json({ movements });
}

// POST /api/inventory/movements - catat pergerakan stok + auto-post journal
// type: IN (pembelian) | OUT (penjualan/pengeluaran) | ADJUST (penyesuaian)
// IN: Debit Persediaan, Kredit Kas/Bank
// OUT: Debit HPP, Kredit Persediaan
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  try {
    const body = await req.json();
    const { itemId, date, type, quantity, unitPrice, reference, description, bankAccountId } = body;
    if (!itemId || !date || !type || !quantity) {
      return NextResponse.json({ error: "itemId, date, type, quantity wajib diisi" }, { status: 400 });
    }
    const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 });
    }
    const qty = Number(quantity);
    const price = Number(unitPrice) || (type === "IN" ? item.purchasePrice : item.purchasePrice);
    const totalValue = qty * price;

    // Cari akun
    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const invAcc = codeMap.get(item.inventoryAccountCode ?? "1-1400");
    const cogsAcc = codeMap.get(item.cogsAccountCode ?? "5-2000");
    // Akun kas/bank lawan (Manager.io: pembelian stok → Payments, bank account wajib)
    let cashAccId: string | undefined;
    let bankAccount: { name: string; accountCode: string } | null = null;
    if (type === "IN") {
      if (!bankAccountId) {
        return NextResponse.json({ error: "Pilih akun kas/bank untuk pembelian stok (uang keluar harus tampil di Pembayaran)" }, { status: 400 });
      }
      bankAccount = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { name: true, accountCode: true } });
      if (!bankAccount) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
      cashAccId = codeMap.get(bankAccount.accountCode);
      if (!cashAccId) return NextResponse.json({ error: "Akun kas/bank tidak ditemukan di CoA" }, { status: 400 });
    }

    if (!invAcc || (type === "IN" && !cashAccId)) {
      return NextResponse.json({ error: "Akun default inventory belum dikonfigurasi" }, { status: 400 });
    }

    const entryNumber = await nextCode(db, "journal", { date });
    const paymentNumber = type === "IN" ? await nextCode(db, "payment", { date }) : undefined;

    const result = await db.$transaction(async (tx) => {
      // Journal lines berdasarkan tipe
      let journalLines: any[] = [];
      let newQty = item.quantityOnHand;
      if (type === "IN") {
        // Debit Persediaan, Kredit Kas/Bank
        journalLines = [
          { accountId: invAcc, debit: totalValue, credit: 0, description: `Pembelian ${item.name}` },
          { accountId: cashAccId!, debit: 0, credit: totalValue, bankAccountId, description: `Pembelian ${item.name} dari ${bankAccount?.name}` },
        ];
        newQty = item.quantityOnHand + qty;
      } else if (type === "OUT") {
        // Debit HPP, Kredit Persediaan
        if (!cogsAcc) throw new Error("Akun HPP belum dikonfigurasi");
        journalLines = [
          { accountId: cogsAcc, debit: totalValue, credit: 0, description: `Pengeluaran ${item.name}` },
          { accountId: invAcc, debit: 0, credit: totalValue, description: `Pengeluaran ${item.name}` },
        ];
        newQty = item.quantityOnHand - qty;
        if (newQty < 0) throw new Error(`Stok ${item.name} tidak cukup (tersedia ${item.quantityOnHand} ${item.unit})`);
      } else {
        // ADJUST: penyesuaian stok —gunakan HPP (COGS) sebagai akun lawan, bukan ekuitas
        // IAS 2: penyesuaian persediaan dikenakan ke beban, bukan laba ditahan
        if (!cogsAcc) throw new Error("Akun HPP belum dikonfigurasi");
        if (totalValue >= 0) {
          // Stok naik: Dr Persediaan, Cr HPP (mengurangi beban)
          journalLines = [
            { accountId: invAcc, debit: totalValue, credit: 0, description: `Penyesuaian ${item.name}` },
            { accountId: cogsAcc, debit: 0, credit: totalValue, description: `Penyesuaian ${item.name}` },
          ];
        } else {
          // Stok turun: Dr HPP, Cr Persediaan (menambah beban)
          const absValue = Math.abs(totalValue);
          journalLines = [
            { accountId: cogsAcc, debit: absValue, credit: 0, description: `Penyesuaian ${item.name}` },
            { accountId: invAcc, debit: 0, credit: absValue, description: `Penyesuaian ${item.name}` },
          ];
        }
        newQty = item.quantityOnHand + qty;
      }

      const entry = await createBalancedJournal(tx, {
          entryNumber,
          date: new Date(date),
          description: `${type === "IN" ? "Penerimaan" : type === "OUT" ? "Pengeluaran" : "Penyesuaian"} stok ${item.name} (${qty} ${item.unit})`,
          reference: reference || `${type}-${item.code}`,
          source: "MANUAL",
          userId: user?.id,
          lines: [...journalLines],
        });

      // Update stok item
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { quantityOnHand: newQty },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          itemId,
          date: new Date(date),
          type,
          quantity: qty,
          unitPrice: price,
          totalValue,
          reference: reference || null,
          description: description || null,
          journalEntryId: entry.id,
        },
        include: { item: true },
      });

      // Manager.io: pembelian stok tampil di view Pembayaran
      if (type === "IN") {
        await tx.payment.create({
          data: {
            number: paymentNumber!,
            date: new Date(date),
            amount: totalValue,
            toContactId: null,
            bankAccountId,
            accountCode: item.inventoryAccountCode || "1-1400",
            description: `Pembelian ${item.name} (${qty} ${item.unit})`,
            reference: reference || `${type}-${item.code}`,
            journalEntryId: entry.id,
            source: "INVENTORY",
          },
        });
      }

      return { movement, entry, newQuantity: newQty };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Movement create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mencatat pergerakan stok" }, { status: 500 });
  }
}
