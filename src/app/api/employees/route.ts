import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateOrUseCode, CodeConflictError } from "@/lib/code-gen";

// GET /api/employees
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const department = searchParams.get("department");
  const where: any = {};
  if (status && status !== "ALL") where.status = status;
  if (department && department !== "ALL") where.department = department;

  const employees = await db.employee.findMany({
    where,
    orderBy: { code: "asc" },
    include: { _count: { select: { payroll: true } } },
  });
  return NextResponse.json({ employees });
}

// POST /api/employees
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, position, department, email, phone, address, taxId, joinDate, status, basicSalary, allowance, bpjsRate, taxRate, bankAccountId, notes } = body;
    if (!name) {
      return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
    }
    const code = await generateOrUseCode(
      db,
      "employee",
      body.code,
      async (c) => !!(await db.employee.findUnique({ where: { code: c } })),
      { date: joinDate }
    );
    const emp = await db.employee.create({
      data: {
        code, name, position: position || null, department: department || null,
        email: email || null, phone: phone || null, address: address || null,
        taxId: taxId || null, joinDate: joinDate ? new Date(joinDate) : null,
        status: status || "ACTIVE",
        basicSalary: Number(basicSalary) || 0,
        allowance: Number(allowance) || 0,
        bpjsRate: Number(bpjsRate) || 0,
        taxRate: Number(taxRate) || 0,
        bankAccountId: bankAccountId || null,
        notes: notes || null,
      },
    });
    return NextResponse.json({ employee: emp });
  } catch (error) {
    const status = error instanceof CodeConflictError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat pegawai" }, { status });
  }
}
