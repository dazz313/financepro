import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { monthlyDepreciation, monthsBetween, toPeriod } from "@/lib/depreciation";
import { nextCode } from "@/lib/code-gen";

// POST /api/fixed-assets/depreciate - jalankan penyusutan untuk satu periode
// body: { period: "YYYY-MM", date?: "YYYY-MM-DD" }
// Untuk setiap aset aktif (belum disposisi) dengan umur ekonomis sudah berjalan,
// hitung beban penyusutan bulan berjalan dan auto-post jurnal:
//   Debit Beban Penyusutan (5-3000), Kredit Akumulasi Penyusutan (1-2900)
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });

  try {
    const body = await req.json();
    const period = typeof body.period === "string" ? body.period : null;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: "Periode wajib diisi (format YYYY-MM)" }, { status: 400 });
    }
    const [y, m] = period.split("-").map(Number);
    // Akhir periode = hari terakhir bulan (agar bulan berjalan terhitung penuh)
    const periodEnd = new Date(y, m, 0);
    const date = body.date ? new Date(body.date) : periodEnd;

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));

    // Ambil semua aset aktif
    const assets = await db.fixedAsset.findMany({
      where: { isDisposed: false },
      include: {
        depreciations: {
          where: { period },
          select: { id: true },
        },
      },
    });

    // Saring aset yang sudah pernah disusutkan di periode ini
    const pending = assets.filter((a) => a.depreciations.length === 0);
    if (pending.length === 0) {
      return NextResponse.json({
        message: "Tidak ada aset yang perlu disusutkan pada periode ini",
        entries: [],
        totalExpense: 0,
      });
    }

    const results: any[] = [];
    let totalExpense = 0;

    for (const asset of pending) {
      const monthly = monthlyDepreciation(asset.purchasePrice, asset.residualValue, asset.usefulLifeMonths);
      if (monthly <= 0) continue;

      // Bulan sudah berjalan sejak perolehan (sampai akhir periode ini)
      const months = monthsBetween(asset.purchaseDate, periodEnd);
      if (months <= 0) continue;

      const expenseAccId = codeMap.get(asset.expenseAccountCode);
      const accumAccId = codeMap.get(asset.accumulatedAccountCode);
      if (!expenseAccId || !accumAccId) {
        results.push({ assetId: asset.id, code: asset.code, status: "SKIP", reason: "Akun CoA tidak ditemukan" });
        continue;
      }

      // Akumulasi penyusutan yang sudah dicatat
      const prevDeps = await db.fixedAssetDepreciation.aggregate({
        where: { assetId: asset.id },
        _sum: { expense: true },
      });
      const alreadyRecorded = prevDeps._sum.expense ?? 0;

      // Maksimal penyusutan = harga perolehan - nilai residual
      const maxDep = Math.max(0, asset.purchasePrice - asset.residualValue);
      const shouldHave = Math.min(maxDep, monthly * months);
      const expense = Math.max(0, shouldHave - alreadyRecorded);
      if (expense <= 0.01) {
        results.push({ assetId: asset.id, code: asset.code, status: "SKIP", reason: "Sudah tersusutkan penuh atau periodenya belum jatuh tempo" });
        continue;
      }

      const newAccum = alreadyRecorded + expense;

      const entryNumber = await nextCode(db, "journal", { date: periodEnd });
      const entry = await db.journalEntry.create({
        data: {
          entryNumber,
          date: periodEnd,
          description: `Penyusutan aset ${asset.code} - ${asset.name} (${period})`,
          reference: `DEP-${asset.code}-${period}`,
          source: "FIXED_ASSET",
          lines: {
            create: [
              { accountId: expenseAccId, debit: expense, credit: 0, description: `Penyusutan ${asset.name} ${period}` },
              { accountId: accumAccId, debit: 0, credit: expense, description: `Akumulasi penyusutan ${asset.name} ${period}` },
            ],
          },
        },
      });

      await db.fixedAssetDepreciation.create({
        data: {
          assetId: asset.id,
          period,
          date: periodEnd,
          expense,
          accumulated: newAccum,
          journalEntryId: entry.id,
        },
      });

      totalExpense += expense;
      results.push({ assetId: asset.id, code: asset.code, name: asset.name, expense, accumulated: newAccum, journalEntryId: entry.id, entryNumber });
    }

    return NextResponse.json({
      message: `Penyusutan periode ${period} selesai`,
      entries: results,
      totalExpense,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menjalankan penyusutan" }, { status: 500 });
  }
}

export { toPeriod };