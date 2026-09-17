import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { DEFAULT_TAX_RULES } from "@/lib/tax-data";
import { parseBrackets } from "@/lib/tax-utils";

// GET /api/tax - daftar semua aturan pajak
export async function GET() {
  const raw = await db.taxRule.findMany({ orderBy: { code: "asc" } });
  const rules = raw.map((r) => ({ ...r, brackets: parseBrackets(r.brackets) }));
  // Auto-seed default jika tabel masih kosong
  if (rules.length === 0) {
    await db.taxRule.createMany({
      data: DEFAULT_TAX_RULES.map((r) => ({
        ...r,
        brackets: r.brackets ? JSON.stringify(r.brackets) : null,
        isActive: true,
        isSystem: true,
      })),
    });
    const seededRaw = await db.taxRule.findMany({ orderBy: { code: "asc" } });
    const seeded = seededRaw.map((r) => ({ ...r, brackets: parseBrackets(r.brackets) }));
    return NextResponse.json({ rules: seeded });
  }
  return NextResponse.json({ rules });
}

// POST /api/tax - buat aturan pajak kustom (admin only)
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya admin yang dapat menambah aturan pajak" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { code, name, category, rate, appliesTo, accountCode, description, notes } = body;
    if (!code || !name) {
      return NextResponse.json({ error: "code dan name wajib diisi" }, { status: 400 });
    }
    const existing = await db.taxRule.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: `Kode pajak '${code}' sudah ada` }, { status: 400 });
    }
    const rule = await db.taxRule.create({
      data: {
        code: String(code).toUpperCase(),
        name,
        description: description || null,
        category: category || "OTHER",
        rate: Number(rate) || 0,
        brackets: null,
        appliesTo: appliesTo || "BOTH",
        accountCode: accountCode || "2-1200",
        isActive: true,
        isSystem: false,
        notes: notes || null,
      },
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menambah aturan pajak" },
      { status: 500 }
    );
  }
}

// PUT /api/tax/reset - kembalikan aturan pajak ke default sistem
export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya admin yang dapat melakukan reset pajak" }, { status: 403 });
  }
  try {
    // Hapus aturan kustom, lalu muat ulang semua default sistem
    await db.taxRule.deleteMany({ where: { isSystem: false } });
    const existing = await db.taxRule.count();
    if (existing > 0) {
      // Hapus semua agar kondisi benar-benar kembali ke default resmi
      await db.taxRule.deleteMany();
    }
    await db.taxRule.createMany({
      data: DEFAULT_TAX_RULES.map((r) => ({
        ...r,
        brackets: r.brackets ? JSON.stringify(r.brackets) : null,
        isActive: true,
        isSystem: true,
      })),
    });
    // Sinkronkan PPN default ke CompanySettings
    const ppn = DEFAULT_TAX_RULES.find((r) => r.code === "PPN");
    if (ppn) {
      await db.companySettings.upsert({
        where: { id: "default" },
        update: { defaultTaxRate: ppn.rate },
        create: { id: "default", defaultTaxRate: ppn.rate },
      });
    }
    const rulesRaw = await db.taxRule.findMany({ orderBy: { code: "asc" } });
    const rules = rulesRaw.map((r) => ({ ...r, brackets: parseBrackets(r.brackets) }));
    return NextResponse.json({ message: "Aturan pajak dikembalikan ke default", rules });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal reset aturan pajak" },
      { status: 500 }
    );
  }
}

// Helper agar module-level function dipakai untuk parsing bracket di file lain pun
export { parseBrackets };