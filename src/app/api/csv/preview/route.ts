import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseCSV, parseAmount, parseDate, type ParsedCSV } from "@/lib/csv";
import {
  CSV_IMPORT_TYPES,
  resolveRoles,
  normalizeDirection,
  type CsvImportType,
  type CsvRole,
} from "@/lib/csv-import-types";

export type PreviewRow = {
  rowIndex: number;
  type: CsvImportType;
  date: string | null;
  description: string;
  reference: string;
  accountCode: string;
  accountName: string | null;
  debit: number;
  credit: number;
  // Asal data domain (penerimaan/pengeluaran/aruskas)
  bankAccount: string;
  bankAccountId: string | null;
  bankLabel: string | null;
  contact: string;
  contactId: string | null;
  contactLabel: string | null;
  amount: number;
  direction: "IN" | "OUT" | null;
  // Status validasi
  valid: boolean;
  errors: string[];
  groupKey: string;
};

export type PreviewResponse = {
  parsed: ParsedCSV;
  type: CsvImportType;
  typeLabel: string;
  rows: PreviewRow[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    totalDebit: number;
    totalCredit: number;
    transactions: number;
    groups: { key: string; description: string; date: string; debit: number; credit: number; balanced: boolean; lineCount: number }[];
  };
};

const isType = (t: string | null): t is CsvImportType =>
  t === "jurnal" || t === "penerimaan" || t === "pengeluaran" || t === "aruskas";

// POST /api/csv/preview - parse CSV & validasi tanpa menyimpan
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const typeRaw = (formData.get("type") as string | null) ?? "jurnal";
    const type: CsvImportType = isType(typeRaw) ? typeRaw : "jurnal";
    const meta = CSV_IMPORT_TYPES[type];

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }
    const text = await file.text();
    const parsed = parseCSV(text);

    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "CSV kosong atau tidak terbaca" }, { status: 400 });
    }

    const cols = resolveRoles(parsed.headers, meta.columns);

    // Kolom wajib harus ada di header
    for (const col of meta.columns) {
      if (col.required && cols[col.role] === undefined) {
        return NextResponse.json(
          { error: `Kolom ${col.label} (${col.candidates[0]}) tidak ditemukan di header CSV` },
          { status: 400 }
        );
      }
    }
    // Arus kas: wajib ada kolom arah ATAU kolom debit/credit sebagai fallback
    if (type === "aruskas" && cols.direction === undefined && cols.debit === undefined && cols.credit === undefined) {
      return NextResponse.json(
        { error: "Arus kas butuh kolom arah (direction/arah) atau kolom debit/credit di header CSV" },
        { status: 400 }
      );
    }

    const accountCodes = await db.account.findMany({ where: { isGroup: false } });
    const codeToAccount = new Map(accountCodes.map((a) => [a.code, a]));

    const banks = await db.bankAccount.findMany({ orderBy: { createdAt: "asc" } });
    const bankByCode = new Map(banks.map((b) => [b.code.toLowerCase(), b]));
    const bankByName = new Map(banks.map((b) => [b.name.toLowerCase(), b]));
    const resolveBank = (v: string) => {
      const s = v.trim().toLowerCase();
      if (!s) return null;
      return bankByCode.get(s) ?? bankByName.get(s) ?? null;
    };

    const contacts = await db.contact.findMany();
    const contactByCode = new Map(contacts.map((c) => [c.code.toLowerCase(), c]));
    const contactByName = new Map(contacts.map((c) => [c.name.toLowerCase(), c]));
    const resolveContact = (v: string) => {
      const s = v.trim().toLowerCase();
      if (!s) return null;
      return contactByCode.get(s) ?? contactByName.get(s) ?? null;
    };

    const cell = (row: string[], role: CsvRole) => {
      const idx = cols[role];
      return idx !== undefined && idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    const rows: PreviewRow[] = [];
    const groupsMap = new Map<string, { debit: number; credit: number; description: string; date: string; lineCount: number }>();

    parsed.rows.forEach((rawRow, idx) => {
      const errors: string[] = [];
      const rowIndex = idx + 2;

      const dateRaw = cell(rawRow, "date");
      const description = cell(rawRow, "description");
      const reference = cell(rawRow, "reference");
      const accountCode = cell(rawRow, "accountCode");
      const date = parseDate(dateRaw);

      const account = accountCode ? codeToAccount.get(accountCode) : undefined;

      if (!date) errors.push("Format tanggal tidak valid");

      // ==== Ambiguitan: jenis jurnal = baris jurnal umum (debit/credit) ====
      if (type === "jurnal") {
        const debitRaw = cell(rawRow, "debit");
        const creditRaw = cell(rawRow, "credit");
        const debit = parseAmount(debitRaw);
        const credit = parseAmount(creditRaw);
        if (!accountCode) errors.push("Kode akun kosong");
        else if (!account) errors.push(`Kode akun "${accountCode}" tidak ditemukan`);
        else if (account.isGroup) errors.push(`Akun "${accountCode}" adalah header/group`);
        if (debit === 0 && credit === 0) errors.push("Debit & credit keduanya 0");
        if (debit < 0 || credit < 0) errors.push("Nilai tidak boleh negatif");

        const groupKey = `${date ? date.toISOString().slice(0, 10) : "no-date"}|||${description}|||${reference}`;
        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, { debit: 0, credit: 0, description, date: date ? date.toISOString() : "", lineCount: 0 });
        }
        const g = groupsMap.get(groupKey)!;
        g.debit += debit;
        g.credit += credit;
        g.lineCount += 1;

        rows.push({
          rowIndex,
          type,
          date: date ? date.toISOString() : null,
          description,
          reference,
          accountCode,
          accountName: account?.name ?? null,
          debit,
          credit,
          bankAccount: "",
          bankAccountId: null,
          bankLabel: null,
          contact: "",
          contactId: null,
          contactLabel: null,
          amount: debit > 0 ? debit : credit,
          direction: null,
          valid: errors.length === 0,
          errors,
          groupKey,
        });
        return;
      }

      // ==== Jenis domain: penerimaan / pengeluaran / arus kas ====
      const bankRaw = cell(rawRow, "bank");
      const bank = bankRaw ? resolveBank(bankRaw) : null;
      const accountCodeGiven = !!accountCode;
      const defaultAccountFor = (dir: "IN" | "OUT" | null) => (dir === "OUT" ? "5-1700" : "4-1100");

      // Resolve kontak sesuai role jenis
      const contactRaw =
        type === "penerimaan" ? cell(rawRow, "from") : type === "pengeluaran" ? cell(rawRow, "to") : cell(rawRow, "contact");
      const contact = contactRaw ? resolveContact(contactRaw) : null;

      // Cuplik jumlah & arah
      let amount = 0;
      let direction: "IN" | "OUT" | null = null;
      const dirRaw = cell(rawRow, "direction");
      if (dirRaw) direction = normalizeDirection(dirRaw);
      const amountRaw = cell(rawRow, "amount");
      const debitRaw = cell(rawRow, "debit");
      const creditRaw = cell(rawRow, "credit");
      const debitVal = debitRaw ? parseAmount(debitRaw) : 0;
      const creditVal = creditRaw ? parseAmount(creditRaw) : 0;

      if (type === "penerimaan") {
        amount = amountRaw ? parseAmount(amountRaw) : debitVal;
        direction = "IN";
      } else if (type === "pengeluaran") {
        amount = amountRaw ? parseAmount(amountRaw) : creditVal;
        direction = "OUT";
      } else {
        // aruskas
        if (dirRaw) {
          if (!direction) errors.push(`Arah tidak dikenali: "${dirRaw}" (pakai MASUK/KELUAR)`);
          amount = amountRaw ? parseAmount(amountRaw) : Math.max(debitVal, creditVal);
        } else if (cols.debit !== undefined || cols.credit !== undefined) {
          if (debitVal > 0 && creditVal === 0) {
            direction = "IN";
            amount = debitVal;
          } else if (creditVal > 0 && debitVal === 0) {
            direction = "OUT";
            amount = creditVal;
          } else if (debitVal === 0 && creditVal === 0) {
            errors.push("Debit & credit keduanya 0");
          } else {
            errors.push("Arah tidak jelas: isi hanya debit ATAU credit");
          }
        } else {
          errors.push("Kolom jumlah (amount/jumlah) tidak ditemukan");
        }
      }

      // Validasi akun lawan
      let finalAccountCode = accountCode;
      if (type === "aruskas" && !accountCodeGiven) {
        finalAccountCode = defaultAccountFor(direction);
      }
      const finalAccount = finalAccountCode ? codeToAccount.get(finalAccountCode) : undefined;
      if (!finalAccountCode) errors.push("Kode akun lawan kosong");
      else if (!account) errors.push(`Kode akun "${finalAccountCode}" tidak ditemukan`);
      else if (account.isGroup) errors.push(`Akun "${finalAccountCode}" adalah header/group`);

      if (!(amount > 0)) errors.push("Jumlah harus > 0");
      if (debitVal < 0 || creditVal < 0) errors.push("Nilai tidak boleh negatif");

      // Kas/bank
      if (type !== "aruskas" || bankRaw) {
        if (bankRaw) {
          if (!bank) errors.push(`Kas/bank "${bankRaw}" tidak ditemukan`);
        } else if (type === "penerimaan" || type === "pengeluaran") {
          errors.push("Kolom kas/bank kosong");
        }
      }

      // Kontak: jika diisi tapi tidak ketemu → invalid
      if (contactRaw && !contact) errors.push(`Kontak "${contactRaw}" tidak ditemukan`);

      const finalBank = bank ?? banks[0] ?? null;
      const debit = direction === "IN" ? amount : 0;
      const credit = direction === "OUT" ? amount : 0;

      const groupKey = `${date ? date.toISOString().slice(0, 10) : "no-date"}|||row-${rowIndex}`;
      rows.push({
        rowIndex,
        type,
        date: date ? date.toISOString() : null,
        description,
        reference,
        accountCode: finalAccountCode,
        accountName: (finalAccount?.name ?? null) as string | null,
        debit,
        credit,
        bankAccount: bankRaw,
        bankAccountId: finalBank?.id ?? null,
        bankLabel: finalBank ? `${finalBank.code} — ${finalBank.name}` : null,
        contact: contactRaw,
        contactId: contact?.id ?? null,
        contactLabel: contact ? `${contact.code} — ${contact.name}` : null,
        amount,
        direction,
        valid: errors.length === 0,
        errors,
        groupKey,
      });
    });

    const groups = Array.from(groupsMap.entries()).map(([key, g]) => ({
      key,
      description: g.description,
      date: g.date,
      debit: g.debit,
      credit: g.credit,
      balanced: Math.abs(g.debit - g.credit) < 0.01,
      lineCount: g.lineCount,
    }));

    const validRows = rows.filter((r) => r.valid).length;
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

    return NextResponse.json({
      parsed,
      type,
      typeLabel: meta.label,
      rows,
      summary: {
        totalRows: rows.length,
        validRows,
        invalidRows: rows.length - validRows,
        totalDebit,
        totalCredit,
        transactions: type === "jurnal" ? groups.length : validRows,
        groups: type === "jurnal" ? groups : [],
      },
    } as PreviewResponse);
  } catch (error) {
    console.error("CSV preview error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal parse CSV" }, { status: 500 });
  }
}