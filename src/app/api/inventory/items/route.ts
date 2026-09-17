import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode, generateOrUseCode, CodeConflictError } from "@/lib/code-gen";

// GET /api/inventory/items
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const where: any = {};
  if (category && category !== "ALL") where.category = category;
  const items = await db.inventoryItem.findMany({
    where,
    orderBy: { code: "asc" },
    include: { _count: { select: { movements: true } } },
  });
  // Hitung nilai stok
  const result = items.map((i) => ({
    ...i,
    stockValue: i.quantityOnHand * i.purchasePrice,
    lowStock: i.quantityOnHand <= i.reorderLevel && i.reorderLevel > 0,
  }));
  return NextResponse.json({ items: result });
}

// POST /api/inventory/items
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, category, unit, purchasePrice, salePrice, quantityOnHand, reorderLevel, inventoryAccountCode, salesAccountCode, cogsAccountCode, division, hideNameOnDocuments } = body;
    if (!name) {
      return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
    }
    const code = await generateOrUseCode(
      db,
      "inventoryItem",
      body.code,
      async (c) => !!(await db.inventoryItem.findUnique({ where: { code: c } })),
      {}
    );
    const item = await db.inventoryItem.create({
      data: {
        code, name, description: description || null, category: category || null,
        unit: unit || "pcs",
        purchasePrice: Number(purchasePrice) || 0,
        salePrice: Number(salePrice) || 0,
        quantityOnHand: Number(quantityOnHand) || 0,
        reorderLevel: Number(reorderLevel) || 0,
        inventoryAccountCode: inventoryAccountCode || "1-1400",
        salesAccountCode: salesAccountCode || "4-1000",
        cogsAccountCode: cogsAccountCode || "5-2000",
        division: division || null,
        hideNameOnDocuments: hideNameOnDocuments === true,
      },
    });
    // Jika ada stok awal, buat movement IN + jurnal opening
    if ((Number(quantityOnHand) || 0) > 0) {
      const accounts = await db.account.findMany();
      const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
      const invAcc = codeMap.get(item.inventoryAccountCode ?? "1-1400");
      const equityAcc = codeMap.get("3-1000");
      if (invAcc && equityAcc) {
        const entryNumber = await nextCode(db, "journal", { date: new Date() });
        const totalValue = (Number(quantityOnHand) || 0) * (Number(purchasePrice) || 0);
        const entry = await db.journalEntry.create({
          data: {
            entryNumber,
            date: new Date(),
            description: `Stok awal ${item.name}`,
            reference: `OPEN-${item.code}`,
            source: "OPENING",
            lines: {
              create: [
                { accountId: invAcc, debit: totalValue, credit: 0 },
                { accountId: equityAcc, debit: 0, credit: totalValue },
              ],
            },
          },
        });
        await db.inventoryMovement.create({
          data: {
            itemId: item.id,
            date: new Date(),
            type: "IN",
            quantity: Number(quantityOnHand),
            unitPrice: Number(purchasePrice) || 0,
            totalValue,
            reference: `OPEN-${item.code}`,
            description: "Stok awal",
            journalEntryId: entry.id,
          },
        });
      }
    }
    return NextResponse.json({ item });
  } catch (error) {
    const status = error instanceof CodeConflictError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat item" }, { status });
  }
}
