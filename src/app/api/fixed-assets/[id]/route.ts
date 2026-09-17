import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/fixed-assets/[id] - detail aset + riwayat penyusutan
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const asset = await db.fixedAsset.findUnique({
    where: { id },
    include: {
      depreciations: { orderBy: { period: "asc" } },
    },
  });
  if (!asset) {
    return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
  }
  const accumulated = asset.depreciations.reduce((s, d) => s + d.expense, 0);
  return NextResponse.json({
    asset,
    accumulatedDepreciation: accumulated,
    bookValue: Math.max(0, asset.purchasePrice - accumulated),
  });
}

// PATCH /api/fixed-assets/[id] - update data non-akuntansi (nama, deskripsi, kategori, dll.)
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const asset = await db.fixedAsset.findUnique({ where: { id } });
    if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });

    const allowed = [
      "name", "description", "category", "purchaseDate", "purchasePrice",
      "residualValue", "usefulLifeMonths", "assetAccountCode",
      "accumulatedAccountCode", "expenseAccountCode", "notes",
    ];
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    // Hapus riwayat penyusutan jika nilai aset diubah (agar dihitung ulang)
    if ("purchasePrice" in data || "residualValue" in data || "usefulLifeMonths" in data) {
      const depIds = await db.fixedAssetDepreciation.findMany({ where: { assetId: id }, select: { id: true } });
      for (const d of depIds) {
        await db.fixedAssetDepreciation.delete({ where: { id: d.id } });
      }
    }
    const updated = await db.fixedAsset.update({ where: { id }, data });
    return NextResponse.json({ asset: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui aset" }, { status: 500 });
  }
}

// DELETE /api/fixed-assets/[id] - hapus aset (riwayat penyusutan ikut terhapus via cascade)
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(_req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const { id } = await ctx.params;
    const asset = await db.fixedAsset.findUnique({ where: { id } });
    if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
    await db.fixedAssetDepreciation.deleteMany({ where: { assetId: id } });
    await db.fixedAsset.delete({ where: { id } });
    return NextResponse.json({ message: "Aset dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus aset" }, { status: 500 });
  }
}