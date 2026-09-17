import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/employee-leaves/[id] - update status (approve/reject) atau data
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const leave = await db.employeeLeave.findUnique({ where: { id } });
    if (!leave) return NextResponse.json({ error: "Cuti/izin tidak ditemukan" }, { status: 404 });

    const data: Record<string, unknown> = {};
    for (const k of ["type", "category", "startDate", "endDate", "reason", "status", "notes", "attachmentName", "attachmentUrl"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.status && !["PENDING", "APPROVED", "REJECTED"].includes(body.status)) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    }
    // Hitung ulang jumlah hari jika tanggal diubah
    if (body.startDate && body.endDate) {
      const s = new Date(body.startDate);
      const e = new Date(body.endDate);
      data.days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    }
    const updated = await db.employeeLeave.update({ where: { id }, data });
    return NextResponse.json({ leave: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui cuti/izin" }, { status: 500 });
  }
}

// DELETE /api/employee-leaves/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(_req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const leave = await db.employeeLeave.findUnique({ where: { id } });
    if (!leave) return NextResponse.json({ error: "Cuti/izin tidak ditemukan" }, { status: 404 });
    await db.employeeLeave.delete({ where: { id } });
    return NextResponse.json({ message: "Cuti/izin dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus cuti/izin" }, { status: 500 });
  }
}