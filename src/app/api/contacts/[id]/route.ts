import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/contacts/[id] – detail kontak
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await db.contact.findUnique({
    where: { id },
    include: { _count: { select: { invoices: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ contact });
}

// PATCH /api/contacts/[id] – sunting data kontak
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 });

    const data: Record<string, unknown> = {};
    for (const k of ["name", "type", "email", "phone", "address", "taxId", "paymentTermsDays"]) {
      if (body[k] !== undefined) {
        data[k] = k === "paymentTermsDays" ? (Number(body[k]) || null) : (body[k] || null);
      }
    }
    const updated = await db.contact.update({ where: { id }, data });
    return NextResponse.json({ contact: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui kontak" }, { status: 500 });
  }
}

// DELETE /api/contacts/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 });

    // Cegah hapus jika sudah punya invoice
    const count = await db.invoice.count({ where: { contactId: id } });
    if (count > 0) return NextResponse.json({ error: "Kontak masih punya faktur, tidak bisa dihapus" }, { status: 400 });

    await db.contact.delete({ where: { id } });
    return NextResponse.json({ message: "Kontak dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus kontak" }, { status: 500 });
  }
}
