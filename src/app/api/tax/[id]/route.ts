import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { parseBrackets, bracketsToJson } from "@/lib/tax-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tax/[id] - detail aturan pajak
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const rule = await db.taxRule.findUnique({ where: { id } });
  if (!rule) {
    return NextResponse.json({ error: "Aturan pajak tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ rule: { ...rule, brackets: parseBrackets(rule.brackets) } });
}

// PUT /api/tax/[id] - update aturan pajak (admin only)
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya admin yang dapat mengubah aturan pajak" }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const rule = await db.taxRule.findUnique({ where: { id } });
    if (!rule) {
      return NextResponse.json({ error: "Aturan pajak tidak ditemukan" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.rate !== undefined) data.rate = Number(body.rate) || 0;
    if (body.appliesTo !== undefined) data.appliesTo = body.appliesTo;
    if (body.accountCode !== undefined) data.accountCode = body.accountCode;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.notes !== undefined) data.notes = body.notes;
    // Bracket progresif diterima sebagai array JSON
    if (body.brackets !== undefined) {
      data.brackets = bracketsToJson(parseBrackets(JSON.stringify(body.brackets)));
    }

    const updated = await db.taxRule.update({ where: { id }, data });

    // Jika PPN diubah, sinkronkan defaultTaxRate CompanySettings
    // agar halaman invoice langsung ikut memakai tarif baru.
    if (updated.code === "PPN" && body.rate !== undefined) {
      await db.companySettings.upsert({
        where: { id: "default" },
        update: { defaultTaxRate: updated.rate },
        create: { id: "default", defaultTaxRate: updated.rate },
      });
    }

    return NextResponse.json({ rule: { ...updated, brackets: parseBrackets(updated.brackets) } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memperbarui aturan pajak" },
      { status: 500 }
    );
  }
}

// DELETE /api/tax/[id] - hapus aturan pajak (hanya kustom, bukan isSystem)
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(_req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya admin yang dapat menghapus aturan pajak" }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const rule = await db.taxRule.findUnique({ where: { id } });
    if (!rule) {
      return NextResponse.json({ error: "Aturan pajak tidak ditemukan" }, { status: 404 });
    }
    if (rule.isSystem) {
      return NextResponse.json(
        { error: "Aturan pajak bawaan sistem tidak dapat dihapus. Nonaktifkan saja." },
        { status: 400 }
      );
    }
    await db.taxRule.delete({ where: { id } });
    return NextResponse.json({ message: "Aturan pajak dihapus" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menghapus aturan pajak" },
      { status: 500 }
    );
  }
}