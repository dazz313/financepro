import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateOrUseCode, CodeConflictError } from "@/lib/code-gen";

// GET /api/contacts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const where = type && type !== "ALL" ? { type: { in: [type, "BOTH"] } } : {};
  const contacts = await db.contact.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { invoices: true } },
    },
  });
  return NextResponse.json({ contacts });
}

// POST /api/contacts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, email, phone, address, taxId, paymentTermsDays } = body;
    if (!name || !type) {
      return NextResponse.json({ error: "Nama dan type wajib diisi" }, { status: 400 });
    }
    const code = await generateOrUseCode(
      db,
      "contact",
      body.code,
      async (c) => !!(await db.contact.findUnique({ where: { code: c } })),
      {}
    );
    const contact = await db.contact.create({
      data: {
        code, name, type,
        email: email || null,
        phone: phone || null,
        address: address || null,
        taxId: taxId || null,
        paymentTermsDays: Number(paymentTermsDays) || null,
      },
    });
    return NextResponse.json({ contact });
  } catch (error) {
    const status = error instanceof CodeConflictError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat kontak" }, { status });
  }
}
