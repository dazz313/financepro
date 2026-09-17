import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDate } from "@/lib/csv";
import { nextCode } from "@/lib/code-gen";
import { getUserFromRequest } from "@/lib/auth";
import type { CsvImportType } from "@/lib/csv-import-types";

const isType = (t: string | null): t is CsvImportType =>
  t === "jurnal" || t === "penerimaan" || t === "pengeluaran" || t === "aruskas";

type Row = {
  type?: CsvImportType;
  date?: string | null;
  description?: string;
  reference?: string;
  accountCode?: string;
  debit?: number;
  credit?: number;
  amount?: number;
  direction?: "IN" | "OUT" | null;
  bankAccountId?: string | null;
  contactId?: string | null;
};

// POST /api/csv/import - import dari CSV yang sudah divalidasi.
// Body: { type, rows: [...] }
// - type "jurnal": mengelompokkan baris (date+description+reference) → 1 JournalEntry
// - type "penerimaan": tiap baris → 1 Receipt + jurnal otomatis (Debit Kas/Bank, Kredit Akun)
// - type "pengeluaran": tiap baris → 1 Payment + jurnal otomatis (Debit Akun, Kredit Kas/Bank)
// - type "aruskas": arah MASUK → Receipt, KELUAR → Payment
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const body = await req.json();
    const typeRaw = (body.type as string | null) ?? "jurnal";
    const type: CsvImportType = isType(typeRaw) ? typeRaw : "jurnal";
    const rows: Row[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Tidak ada baris untuk diimpor" }, { status: 400 });
    }

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));

    // ====== Jurnal umum: kelompokkan (date+description+reference) ======
    if (type === "jurnal") {
      const groupsMap = new Map<string, { date: Date; description: string; reference: string; lines: any[] }>();
      for (const r of rows) {
        const date = r.date ? parseDate(r.date) : null;
        if (!date) continue;
        const description = r.description || "Import CSV";
        const reference = r.reference || "";
        const key = `${date.toISOString().slice(0, 10)}|||${description}|||${reference}`;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, { date, description, reference, lines: [] });
        }
        const g = groupsMap.get(key)!;
        const accountId = codeMap.get(r.accountCode ?? "");
        if (!accountId) continue;
        g.lines.push({ accountId, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0 });
      }

      const invalidGroups: string[] = [];
      for (const [, g] of groupsMap.entries()) {
        const d = g.lines.reduce((s, l) => s + l.debit, 0);
        const c = g.lines.reduce((s, l) => s + l.credit, 0);
        if (Math.abs(d - c) > 0.01) invalidGroups.push(g.description);
      }
      if (invalidGroups.length > 0) {
        return NextResponse.json(
          { error: `${invalidGroups.length} transaksi tidak balanced. Perbaiki dulu sebelum import.`, invalidGroups },
          { status: 400 }
        );
      }

      const created = await db.$transaction(async (tx) => {
        const entries: any[] = [];
        for (const [, g] of groupsMap.entries()) {
          const entryNumber = await nextCode(tx, "journal", { date: g.date });
          const entry = await tx.journalEntry.create({
            data: {
              entryNumber,
              date: g.date,
              description: g.description,
              reference: g.reference || null,
              source: "CSV",
              lines: { create: g.lines },
            },
          });
          entries.push(entry);
        }
        return entries;
      });

      return NextResponse.json({ message: "Import berhasil", imported: created.length, entries: created });
    }

    // ====== Domain: penerimaan / pengeluaran / arus kas ======
    const banks = await db.bankAccount.findMany({ orderBy: { createdAt: "asc" } });
    const bankMap = new Map(banks.map((b) => [b.id, b]));
    const defaultBank = banks[0] ?? null;

    const created = await db.$transaction(async (tx) => {
      let receipts = 0;
      let payments = 0;
      const entries: any[] = [];
      const records: any[] = [];

      for (const r of rows) {
        const date = r.date ? parseDate(r.date) : null;
        if (!date) continue;
        const accountId = codeMap.get(r.accountCode ?? "");
        if (!accountId) continue;

        const direction = r.direction;
        // Arah uang: penerimaan/pengeluaran eksplisit per jenis; arus kas per baris.
        const isIn = type === "penerimaan" || direction === "IN";
        const isOut = type === "pengeluaran" || direction === "OUT";
        if (!isIn && !isOut) continue;

        const amount = Number(r.amount) || 0;
        if (!(amount > 0)) continue;

        const bank = r.bankAccountId ? bankMap.get(r.bankAccountId) ?? defaultBank : defaultBank;
        if (!bank) continue;
        const bankAccId = codeMap.get(bank.accountCode);
        if (!bankAccId) continue;

        const number = await nextCode(tx, isIn ? "receipt" : "payment", { date });
        const entryNumber = await nextCode(tx, "journal", { date });
        const description = r.description || `Import CSV ${isIn ? "penerimaan" : "pengeluaran"}`;

        // Jurnal otomatis:
        //  IN  → Debit Kas/Bank, Kredit Akun Lawan
        //  OUT → Debit Akun Lawan, Kredit Kas/Bank
        const entry = await tx.journalEntry.create({
          data: {
            entryNumber,
            date,
            description: `${isIn ? "Penerimaan" : "Pengeluaran"} ${number}`,
            reference: r.reference || null,
            source: "CSV",
            lines: {
              create:
                isIn
                  ? [
                      { accountId: bankAccId, debit: amount, credit: 0, bankAccountId: bank.id, description: `Penerimaan ke ${bank.name}` },
                      { accountId, debit: 0, credit: amount, description: `Penerimaan ${number}` },
                    ]
                  : [
                      { accountId, debit: amount, credit: 0, description: `Pengeluaran ${number}` },
                      { accountId: bankAccId, debit: 0, credit: amount, bankAccountId: bank.id, description: `Pengeluaran dari ${bank.name}` },
                    ],
            },
          },
        });

        if (isIn) {
          const receipt = await tx.receipt.create({
            data: {
              number,
              date,
              amount,
              fromContactId: r.contactId || null,
              bankAccountId: bank.id,
              accountCode: r.accountCode!,
              description: description || null,
              reference: r.reference || null,
              subtotal: amount,
              journalEntryId: entry.id,
              source: "CSV",
              lines: {
                create: [{ description, quantity: 1, unit: "pcs", discount: 0, unitPrice: amount, amount, accountCode: r.accountCode! }],
              },
            },
          });
          receipts += 1;
          records.push(receipt);
        } else {
          const payment = await tx.payment.create({
            data: {
              number,
              date,
              amount,
              toContactId: r.contactId || null,
              bankAccountId: bank.id,
              accountCode: r.accountCode!,
              description: description || null,
              reference: r.reference || null,
              subtotal: amount,
              journalEntryId: entry.id,
              source: "CSV",
              lines: {
                create: [{ description, quantity: 1, unit: "pcs", discount: 0, unitPrice: amount, amount, accountCode: r.accountCode! }],
              },
            },
          });
          payments += 1;
          records.push(payment);
        }
        entries.push(entry);
      }

      return { receipts, payments, total: receipts + payments, entries, records };
    });

    return NextResponse.json({
      message: "Import berhasil",
      imported: created.total,
      receipts: created.receipts,
      payments: created.payments,
      entries: created.entries,
    });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal import CSV" }, { status: 500 });
  }
}