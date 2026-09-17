import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { nextCode } from "@/lib/code-gen";

// GET /api/reimbursements - daftar klaim reimburse
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where: any = {};
  if (status && status !== "ALL") where.status = status;
  const reimbursements = await db.employeeReimbursement.findMany({
    where,
    orderBy: { date: "desc" },
    include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
  });
  return NextResponse.json({ reimbursements });
}

// POST /api/reimbursements - buat klaim reimburse (status PENDING)
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  try {
    const body = await req.json();
    const { employeeId, date, category, description, amount, accountCode, bankAccountId, reference, notes, attachmentName, attachmentUrl } = body;

    if (!employeeId || !date || !amount) {
      return NextResponse.json({ error: "Pegawai, tanggal, dan jumlah wajib diisi" }, { status: 400 });
    }
    const amt = Number(amount) || 0;
    if (amt <= 0) return NextResponse.json({ error: "Jumlah harus > 0" }, { status: 400 });

    const emp = await db.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: "Pegawai tidak ditemukan" }, { status: 404 });

    const number = await nextCode(db, "reimbursement", { date });

    const reimbursement = await db.employeeReimbursement.create({
      data: {
        number,
        employeeId,
        date: new Date(date),
        category: category || null,
        description: description || null,
        amount: amt,
        accountCode: accountCode || "5-1700",
        bankAccountId: bankAccountId || null,
        status: "PENDING",
        reference: reference || null,
        attachmentName: attachmentName || null,
        attachmentUrl: attachmentUrl || null,
        notes: notes || null,
      },
      include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
    });
    return NextResponse.json({ reimbursement }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat reimburse" }, { status: 500 });
  }
}