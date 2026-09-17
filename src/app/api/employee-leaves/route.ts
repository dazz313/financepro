import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

// GET /api/employee-leaves - daftar cuti/izin/sakit
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const where: any = {};
  if (type && type !== "ALL") where.type = type;
  if (status && status !== "ALL") where.status = status;
  const leaves = await db.employeeLeave.findMany({
    where,
    orderBy: { startDate: "desc" },
    include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
  });
  return NextResponse.json({ leaves });
}

// POST /api/employee-leaves - buat catatan cuti/izin
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  try {
    const body = await req.json();
    const { employeeId, type, category, startDate, endDate, reason, notes, attachmentName, attachmentUrl } = body;
    if (!employeeId || !type || !startDate || !endDate) {
      return NextResponse.json({ error: "Pegawai, jenis, tanggal mulai, dan tanggal selesai wajib diisi" }, { status: 400 });
    }
    const emp = await db.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: "Pegawai tidak ditemukan" }, { status: 404 });

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 });
    }
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

    const leave = await db.employeeLeave.create({
      data: {
        employeeId,
        type,
        category: category || null,
        startDate: start,
        endDate: end,
        days,
        reason: reason || null,
        status: "PENDING",
        attachmentName: attachmentName || null,
        attachmentUrl: attachmentUrl || null,
        notes: notes || null,
      },
      include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
    });
    return NextResponse.json({ leave }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat cuti/izin" }, { status: 500 });
  }
}