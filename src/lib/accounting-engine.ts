// Accounting Engine — centralisasi pembuatan & validasi jurnal.
// Setiap transaksi melewati engine ini untuk menjamin:
//   1. Total Debit = Total Kredit (double-entry integrity)
//   2. Setiap baris punya accountId valid
//   3. Tidak ada baris debit=0 DAN credit=0
//   4. Audit trail (userId, timestamp)

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Cek apakah tanggal jurnal masih diizinkan (belum ditutup).
 */
export async function validatePeriod(date: Date): Promise<void> {
  const settings = await db.companySettings.findUnique({ where: { id: "default" } });
  if (settings?.periodLockedUntil && date < settings.periodLockedUntil) {
    const locked = settings.periodLockedUntil.toLocaleDateString("id-ID");
    throw new Error(
      `Periode sudah ditutup per ${locked}. Jurnal tidak boleh tanggal sebelum ${locked}.`
    );
  }
}

export type JournalLineInput = {
  accountId: string;
  debit: number;
  credit: number;
  bankAccountId?: string;
  description?: string;
};

export type CreateJournalInput = {
  entryNumber: string;
  date: Date;
  description: string;
  reference?: string;
  source: string;
  sourceId?: string;
  userId?: string;
  lines: JournalLineInput[];
};

/**
 * Validasi & buat jurnal — guaranteed balanced.
 * Throws jika:
//   - lines kosong
//   - ada baris debit=0 DAN credit=0
//   - total debit ≠ total credit (toleransi 0.01)
//   - ada accountId yang tidak valid
 */
export async function createBalancedJournal(
  tx: Prisma.TransactionClient,
  input: CreateJournalInput
) {
  // 1. Validate period not locked
  await validatePeriod(input.date);

  // 2. Validate lines exist
  if (!input.lines || input.lines.length < 2) {
    throw new Error("Jurnal minimal harus memiliki 2 baris (double-entry)");
  }

  // 2. Validate no zero lines
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    if (l.debit <= 0 && l.credit <= 0) {
      throw new Error(`Baris ${i + 1}: debit dan credit tidak boleh keduanya nol`);
    }
    if (l.debit > 0 && l.credit > 0) {
      throw new Error(`Baris ${i + 1}: debit dan credit tidak boleh keduanya lebih dari nol`);
    }
  }

  // 3. Validate balance
  const totalDebit = input.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = input.lines.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Jurnal tidak seimbang: Total Debit ${totalDebit} ≠ Total Kredit ${totalCredit}`
    );
  }

  // 4. Validate accountIds exist
  const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
  const accounts = await tx.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true },
  });
  if (accounts.length !== accountIds.length) {
    const found = new Set(accounts.map((a) => a.id));
    const missing = accountIds.filter((id) => !found.has(id));
    throw new Error(`Akun tidak ditemukan: ${missing.join(", ")}`);
  }

  // 5. Create journal entry with lines
  const entry = await tx.journalEntry.create({
    data: {
      entryNumber: input.entryNumber,
      date: input.date,
      description: input.description,
      reference: input.reference ?? null,
      source: input.source,
      sourceId: input.sourceId ?? null,
      createdBy: input.userId ?? null,
      lines: {
        create: input.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          bankAccountId: l.bankAccountId ?? null,
          description: l.description ?? null,
        })),
      },
    },
    include: { lines: true },
  });

  return entry;
}

/**
 * Buat reversal journal (untuk koreksi jurnal yang sudah POSTED).
 * Membalik semua posisi debit/credit dari jurnal asli.
 */
export async function createReversalJournal(
  tx: Prisma.TransactionClient,
  originalEntryId: string,
  reversalNumber: string,
  reversalDate: Date,
  reason: string,
  userId?: string
) {
  const original = await tx.journalEntry.findUnique({
    where: { id: originalEntryId },
    include: { lines: true },
  });

  if (!original) {
    throw new Error("Jurnal asli tidak ditemukan");
  }

  if (original.isReversed) {
    throw new Error("Jurnal ini sudah di-reversal");
  }

  // Mark original as reversed
  await tx.journalEntry.update({
    where: { id: originalEntryId },
    data: { isReversed: true },
  });

  // Create reversal (swap debit ↔ credit)
  const reversal = await createBalancedJournal(tx, {
    entryNumber: reversalNumber,
    date: reversalDate,
    description: `Reversal: ${original.description} — ${reason}`,
    reference: original.entryNumber,
    source: "REVERSAL",
    sourceId: originalEntryId,
    userId,
    lines: original.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit, // swapped
      credit: l.debit, // swapped
      bankAccountId: l.bankAccountId ?? undefined,
      description: `Reversal dari ${original.entryNumber}`,
    })),
  });

  return reversal;
}

/**
 * Validasi bahwa suatu jurnal entry seimbang.
 * Untuk use case: revalidate jurnal yang sudah ada.
 */
export function validateJournalBalance(lines: { debit: number; credit: number }[]): {
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
} {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const difference = Math.abs(totalDebit - totalCredit);
  return {
    balanced: difference <= 0.01,
    totalDebit,
    totalCredit,
    difference,
  };
}
