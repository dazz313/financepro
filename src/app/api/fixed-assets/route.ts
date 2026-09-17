import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { monthlyDepreciation, bookValue, toPeriod } from "@/lib/depreciation";
import { nextCode, generateOrUseCode, CodeConflictError } from "@/lib/code-gen";
import { createBalancedJournal } from "@/lib/accounting-engine";

// GET /api/fixed-assets - daftar aset tetap dengan nilai kalkulasi
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const where: any = {};
  if (category && category !== "ALL") where.category = category;

  const assets = await db.fixedAsset.findMany({
    where,
    orderBy: { code: "asc" },
    include: {
      depreciations: { orderBy: { period: "asc" }, select: { id: true, period: true, date: true, expense: true, accumulated: true } },
    },
  });

  const result = assets.map((a) => {
    const accumulated = a.depreciations.reduce((s, d) => s + d.expense, 0);
    const monthly = monthlyDepreciation(a.purchasePrice, a.residualValue, a.usefulLifeMonths);
    return {
      ...a,
      monthlyDepreciation: monthly,
      accumulatedDepreciation: accumulated,
      bookValue: bookValue(a.purchasePrice, accumulated),
      depreciatedToPeriod: a.depreciations.length > 0 ? a.depreciations[a.depreciations.length - 1].period : null,
      latestPeriod: toPeriod(new Date()),
      depreciationCount: a.depreciations.length,
    };
  });

  return NextResponse.json({ assets: result });
}

// POST /api/fixed-assets - perolehan aset tetap + auto-post jurnal pembelian
// Jurnal: Debit akun aset (assetAccountCode), Kredit Kas/Bank (bankAccountId->accountCode)
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const {
      name, description, category,
      purchaseDate, purchasePrice, residualValue, usefulLifeMonths,
      assetAccountCode, accumulatedAccountCode, expenseAccountCode,
      bankAccountId, notes,
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Nama aset wajib diisi" }, { status: 400 });
    }
    if (!purchaseDate) {
      return NextResponse.json({ error: "Tanggal perolehan wajib diisi" }, { status: 400 });
    }
    const price = Number(purchasePrice) || 0;
    const months = Number(usefulLifeMonths) || 0;
    if (months <= 0) {
      return NextResponse.json({ error: "Umur ekonomis (bulan) wajib > 0" }, { status: 400 });
    }

    // Kode aset: auto-generate (EMP... FA) bila tidak diisi manual
    const code = await generateOrUseCode(
      db,
      "fixedAsset",
      body.code,
      async (c) => !!(await db.fixedAsset.findUnique({ where: { code: c } })),
      { date: purchaseDate }
    );

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const assetAccId = codeMap.get(assetAccountCode ?? "1-2100");
    if (!assetAccId) {
      return NextResponse.json({ error: `Akun aset '${assetAccountCode}' tidak ditemukan di CoA` }, { status: 400 });
    }

    // Manager.io-style: uang keluar selalu lewat akun kas/bank → wajib dipilih
    // agar pembelian tercatat di view Pembayaran (Payment record dibuat juga).
    if (price > 0 && !bankAccountId) {
      return NextResponse.json({ error: "Pilih akun kas/bank untuk pembayaran pembelian aset" }, { status: 400 });
    }
    let creditAccId: string | undefined;
    let bankAccount: { name: string; accountCode: string } | null = null;
    if (bankAccountId) {
      bankAccount = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { name: true, accountCode: true } });
      if (!bankAccount) {
        return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
      }
      creditAccId = codeMap.get(bankAccount.accountCode);
      if (!creditAccId) {
        return NextResponse.json({ error: `Akun kas/bank '${bankAccount.accountCode}' tidak ditemukan di CoA` }, { status: 400 });
      }
    }

    let paymentNumber: string | undefined;
    const result = await db.$transaction(async (tx) => {
      // 1. Jurnal pembelian (balanced)
      let journalEntryId: string | undefined;
      if (price > 0) {
        const entryNumber = await nextCode(tx, "journal", { date: purchaseDate });
        const entry = await createBalancedJournal(tx, {
            entryNumber,
            date: new Date(purchaseDate),
            description: `Pembelian aset ${name}`,
            reference: code,
            source: "FIXED_ASSET",
            userId: user?.id,
            lines: [
              { accountId: assetAccId, debit: price, credit: 0, description: `Perolehan aset ${code}` },
              ...(creditAccId ? [{ accountId: creditAccId, debit: 0, credit: price, bankAccountId, description: `Bayar aset ${code} dari ${bankAccount?.name}` }] : []),
            ],
          });
        journalEntryId = entry.id;

        // 1b. Catat pembayaran (Manager.io: uang keluar tampil di view Pembayaran)
        paymentNumber = await nextCode(tx, "payment", { date: purchaseDate });
        await tx.payment.create({
          data: {
            number: paymentNumber,
            date: new Date(purchaseDate),
            amount: price,
            bankAccountId,
            accountCode: assetAccountCode || "1-2100",
            description: `Pembelian aset ${name} (${code})`,
            reference: code,
            journalEntryId: entry.id,
            source: "FIXED_ASSET",
          },
        });
      }

      // 2. Catat aset
      const asset = await tx.fixedAsset.create({
        data: {
          code,
          name,
          description: description || null,
          category: category || null,
          assetAccountCode: assetAccountCode || "1-2100",
          accumulatedAccountCode: accumulatedAccountCode || "1-2900",
          expenseAccountCode: expenseAccountCode || "5-3000",
          purchaseDate: new Date(purchaseDate),
          purchasePrice: price,
          residualValue: Number(residualValue) || 0,
          usefulLifeMonths: months,
          depreciationMethod: "STRAIGHT_LINE",
          bankAccountId: bankAccountId || null,
          journalEntryId,
          notes: notes || null,
        },
      });

      return asset;
    });

    return NextResponse.json({ asset: result, paymentNumber });
  } catch (error) {
    const status = error instanceof CodeConflictError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat aset tetap" }, { status });
  }
}

// DELETE /api/fixed-assets - hapus semua (helper, opsional: hanya untuk reset)
// Hapus satu → pakai /api/fixed-assets/[id]
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  try {
    await db.fixedAssetDepreciation.deleteMany();
    await db.fixedAsset.deleteMany();
    return NextResponse.json({ message: "Semua aset tetap dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus aset tetap" }, { status: 500 });
  }
}