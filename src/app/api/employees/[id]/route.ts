import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/employees/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    if ("joinDate" in body && body.joinDate) body.joinDate = new Date(body.joinDate);
    if ("code" in body) {
      const code = String(body.code ?? "").trim();
      if (!code) {
        return NextResponse.json({ error: "Kode pegawai tidak boleh kosong" }, { status: 400 });
      }
      if (code !== (await db.employee.findUnique({ where: { id }, select: { code: true } }))?.code) {
        const clash = await db.employee.findUnique({ where: { code } });
        if (clash) {
          return NextResponse.json({ error: `Kode ${code} sudah digunakan oleh pegawai lain` }, { status: 400 });
        }
      }
      body.code = code;
    }
    const emp = await db.employee.update({ where: { id }, data: body });
    return NextResponse.json({ employee: emp });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui pegawai" }, { status: 500 });
  }
}

// DELETE /api/employees/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.employee.delete({ where: { id } });
    return NextResponse.json({ message: "Pegawai dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus pegawai" }, { status: 500 });
  }
}
