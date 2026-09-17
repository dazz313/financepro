import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/employee-loans/[id] - detail pinjaman
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const loan = await db.employeeLoan.findUnique({
    where: { id },
    include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
  });
  if (!loan) return NextResponse.json({ error: "Pinjaman tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ loan: { ...loan, remainingAmount: Math.max(0, loan.amount - loan.paidAmount) } });
}

// PATCH /api/employee-loans/[id] - update data / status pinjaman
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const loan = await db.employeeLoan.findUnique({ where: { id } });
    if (!loan) return NextResponse.json({ error: "Pinjaman tidak ditemukan" }, { status: 404 });

    const data: Record<string, unknown> = {};
    for (const k of ["description", "accountCode", "bankAccountId", "installmentAmount", "interestRate", "notes"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    // Manual mark lunas
    if (body.status === "PAID") {
      data.status = "PAID";
      data.paidAmount = loan.amount;
    }
    if (body.status === "CANCELLED") data.status = "CANCELLED";
    const updated = await db.employeeLoan.update({ where: { id }, data });
    return NextResponse.json({ loan: { ...updated, remainingAmount: Math.max(0, updated.amount - updated.paidAmount) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui pinjaman" }, { status: 500 });
  }
}

// DELETE /api/employee-loans/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(_req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const loan = await db.employeeLoan.findUnique({ where: { id } });
    if (!loan) return NextResponse.json({ error: "Pinjaman tidak ditemukan" }, { status: 404 });
    await db.employeeLoan.delete({ where: { id } });
    return NextResponse.json({ message: "Pinjaman dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus pinjaman" }, { status: 500 });
  }
}