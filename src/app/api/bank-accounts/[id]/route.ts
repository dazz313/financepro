import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";

// PATCH /api/bank-accounts/[id] - edit data akun bank/kas
// Saldo awal dapat diubah: jurnal OPENING dibuat/ubah/hapus sesuai nilai baru,
// selama rekening belum punya transaksi lain selain jurnal opening-nya.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.bankAccount.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 404 });
  }
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.type !== undefined) data.type = body.type;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.bankName !== undefined) data.bankName = body.bankName || null;
  if (body.accountNumber !== undefined) data.accountNumber = body.accountNumber || null;
  if (body.accountHolder !== undefined) data.accountHolder = body.accountHolder || null;
  if (body.branch !== undefined) data.branch = body.branch || null;
  if (body.accountCode !== undefined) {
    const acc = await db.account.findUnique({ where: { code: body.accountCode } });
    if (!acc) {
      return NextResponse.json({ error: `Akun CoA ${body.accountCode} tidak ditemukan` }, { status: 400 });
    }
    data.accountCode = body.accountCode;
  }

  // Saldo awal diubah → sinkronkan jurnal opening balance
  let newOpening: number | null = null;
  if (body.openingBalance !== undefined) {
    newOpening = Number(body.openingBalance) || 0;
    data.openingBalance = newOpening;

    const openingEntry = await db.journalEntry.findFirst({
      where: { source: "OPENING", reference: `OPEN-${existing.code}` },
      select: { id: true },
    });
    const otherLines = await db.journalLine.count({
      where: { bankAccountId: id, entryId: openingEntry ? { not: openingEntry.id } : undefined },
    });
    // Jika rekening sudah punya transaksi lain selain jurnal opening, mengubah
    // saldo awal akan merusak keseimbangan buku besar → tolak.
    if (otherLines > 0) {
      return NextResponse.json(
        { error: "Tidak bisa mengubah saldo awal karena rekening ini sudah memiliki transaksi lain. Buat transfer/penyesuaian jurnal secara manual." },
        { status: 400 },
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const bank = await tx.bankAccount.update({ where: { id }, data });

    if (newOpening !== null) {
      const acc = await tx.account.findUnique({ where: { code: bank.accountCode } });
      if (!acc) {
        throw new Error(`Akun CoA ${bank.accountCode} tidak ditemukan`);
      }
      const equity = await tx.account.findFirst({ where: { code: "3-1000" } });
      if (!equity) {
        throw new Error("Akun ekuitas 3-1000 tidak ditemukan untuk jurnal saldo awal");
      }
      const openingEntry = await tx.journalEntry.findFirst({
        where: { source: "OPENING", reference: `OPEN-${bank.code}` },
        include: { lines: true },
      });

      if (newOpening > 0) {
        if (openingEntry) {
          // Perbarui jumlah pada baris jurnal opening yang sudah ada
          for (const l of openingEntry.lines) {
            if (l.accountId === acc.id) {
              await tx.journalLine.update({
                where: { id: l.id },
                data: { debit: newOpening, credit: 0 },
              });
            } else {
              await tx.journalLine.update({
                where: { id: l.id },
                data: { debit: 0, credit: newOpening },
              });
            }
          }
        } else {
          // Belum ada jurnal opening → buat baru
          const entryNumber = await nextCode(tx, "journal", { date: new Date() });
          await tx.journalEntry.create({
            data: {
              entryNumber,
              date: new Date(),
              description: `Saldo awal ${bank.name}`,
              reference: `OPEN-${bank.code}`,
              source: "OPENING",
              lines: {
                create: [
                  { accountId: acc.id, debit: newOpening, credit: 0, bankAccountId: bank.id },
                  { accountId: equity.id, debit: 0, credit: newOpening },
                ],
              },
            },
          });
        }
      } else {
        // newOpening === 0 → hapus jurnal opening (cascade menghapus barisnya)
        if (openingEntry) {
          await tx.journalEntry.delete({ where: { id: openingEntry.id } });
        }
      }
    }

    return bank;
  });

  return NextResponse.json({ bankAccount: updated });
}

// DELETE /api/bank-accounts/[id] - hapus akun bank/kas
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.bankAccount.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 404 });
  }
  // Tolak hapus jika ada transaksi (journal lines) yang ditautkan ke rekening ini
  const lineCount = await db.journalLine.count({ where: { bankAccountId: id } });
  if (lineCount > 0) {
    return NextResponse.json(
      { error: `Tidak bisa menghapus "${existing.name}" karena masih ada ${lineCount} transaksi yang tercatat. Hapus atau pindahkan transaksi terlebih dahulu.` },
      { status: 400 },
    );
  }
  await db.bankAccount.delete({ where: { id } });
  return NextResponse.json({ message: "Akun bank berhasil dihapus" });
}