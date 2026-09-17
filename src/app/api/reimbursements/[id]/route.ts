import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { nextCode } from "@/lib/code-gen";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/reimbursements/[id]
// - Update data biasa (description, category, dst.)
// - Ubah status → PAID: auto-post jurnal Debit Beban / Kredit Kas-Bank (balanced)
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });

  // Approval hanya untuk SUPERADMIN
  const body = await req.json();
  if (body.status && ["APPROVED", "REJECTED"].includes(body.status) && user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya Super Admin yang dapat menyetujui/menolak" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const rm = await db.employeeReimbursement.findUnique({ where: { id } });
    if (!rm) return NextResponse.json({ error: "Reimburse tidak ditemukan" }, { status: 404 });

    // Transit ke PAID → buat jurnal + payment (Manager.io: uang keluar → Payments)
    if (body.status === "PAID" && rm.status !== "PAID" && !rm.journalEntryId) {
      if (!rm.bankAccountId) {
        return NextResponse.json({ error: "Tentukan akun kas/bank pembayaran reimburse (set bankAccountId dulu)" }, { status: 400 });
      }
      const accounts = await db.account.findMany();
      const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
      const expenseAcc = codeMap.get(rm.accountCode);
      const bank = await db.bankAccount.findUnique({ where: { id: rm.bankAccountId } });
      if (!bank) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
      const bankAccId = codeMap.get(bank.accountCode);
      if (!expenseAcc || !bankAccId) {
        return NextResponse.json({ error: "Akun beban atau kas/bank tidak ditemukan di CoA" }, { status: 400 });
      }

      const entryNumber = await nextCode(db, "journal", { date: rm.date });
      const paymentNumber = await nextCode(db, "payment", { date: rm.date });
      const entry = await db.journalEntry.create({
        data: {
          entryNumber,
          date: rm.date,
          description: `Reimburse ${rm.number} - ${rm.description || "Penggantian biaya"}`,
          reference: rm.number,
          source: "REIMBURSEMENT",
          lines: {
            create: [
              { accountId: expenseAcc, debit: rm.amount, credit: 0, description: `Reimburse ${rm.number}` },
              { accountId: bankAccId, debit: 0, credit: rm.amount, bankAccountId: rm.bankAccountId, description: `Bayar reimburse ${rm.number} dari ${bank.name}` },
            ],
          },
        },
      });

      await db.payment.create({
        data: {
          number: paymentNumber,
          date: rm.date,
          amount: rm.amount,
          toContactId: null,
          bankAccountId: rm.bankAccountId,
          accountCode: rm.accountCode,
          description: `Reimburse ${rm.number}${rm.description ? ` - ${rm.description}` : ""}`,
          reference: rm.number,
          journalEntryId: entry.id,
          source: "REIMBURSEMENT",
        },
      });

      const updated = await db.employeeReimbursement.update({
        where: { id },
        data: { status: "PAID", journalEntryId: entry.id, ...(body.notes !== undefined ? { notes: body.notes } : {}) },
        include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
      });
      return NextResponse.json({ reimbursement: updated, journalEntryId: entry.id });
    }

    // Update data biasa / status lain
    const data: Record<string, unknown> = {};
    for (const k of ["description", "category", "amount", "accountCode", "bankAccountId", "reference", "notes", "attachmentName", "attachmentUrl"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.status && ["PENDING", "APPROVED", "REJECTED"].includes(body.status)) data.status = body.status;
    const updated = await db.employeeReimbursement.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, code: true, name: true, position: true, department: true } } },
    });
    return NextResponse.json({ reimbursement: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui reimburse" }, { status: 500 });
  }
}

// DELETE /api/reimbursements/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(_req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const rm = await db.employeeReimbursement.findUnique({ where: { id } });
    if (!rm) return NextResponse.json({ error: "Reimburse tidak ditemukan" }, { status: 404 });
    if (rm.journalEntryId) {
      const entry = await db.journalEntry.findUnique({ where: { id: rm.journalEntryId } });
      if (entry) {
        await db.journalLine.deleteMany({ where: { entryId: entry.id } });
        await db.journalEntry.delete({ where: { id: entry.id } });
      }
    }
    await db.employeeReimbursement.delete({ where: { id } });
    return NextResponse.json({ message: "Reimburse dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus reimburse" }, { status: 500 });
  }
}