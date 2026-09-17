import { db } from "@/lib/db";

// Penomoran-ulang dokumen saat kode perusahaan (companyCode) diubah.
// Nomor dokumen tersimpan sebagai string statis hasil template, mis.
// "INV-FPD-2026-09-0001". Mengubah companyCode tidak akan mengubah nomor yang
// sudah ada → modul ini men-sinkronkan (renumber) seluruh dokumen secara aman.

type Parser = { names: string[]; literals: string[]; re: RegExp };

function buildParser(format: string): Parser {
  // Pertahankan segmen kosong ("" di awal/akhir) agar urutan literal
  // tetap selaras dengan token saat di-rebuild.
  const raw = format.split(/(\{[a-zA-Z]+\})/);
  const names: string[] = [];
  const literals: string[] = [];
  for (const p of raw) {
    if (p.startsWith("{") && p.endsWith("}")) names.push(p.slice(1, -1));
    else literals.push(p);
  }
  let regexStr = "^";
  for (let i = 0; i < names.length; i++) {
    regexStr += (literals[i] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regexStr += "(.*?)";
  }
  regexStr += (literals[names.length] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  regexStr += "$";
  return { names, literals, re: new RegExp(regexStr) };
}

function companyTokenOf(names: string[]): string | null {
  if (names.includes("companyCode")) return "companyCode";
  if (names.includes("company")) return "company";
  return null;
}

function padSeq(rawSeq: string, n: number): string {
  return String(Math.max(1, n)).padStart(rawSeq.length > 0 ? rawSeq.length : 4, "0");
}

type Parts = Record<string, string>;

function rebuild(
  parts: Parts,
  names: string[],
  literals: string[],
  companyToken: string,
  newCode: string,
  seqOverride?: number
): string {
  let out = "";
  const rawSeq = parts.seq ?? "1";
  for (let i = 0; i < names.length; i++) {
    out += literals[i] ?? "";
    const n = names[i];
    if (n === companyToken) out += newCode;
    else if (n === "seq" && seqOverride !== undefined) out += padSeq(rawSeq, seqOverride);
    else out += parts[n] ?? "";
  }
  out += literals[names.length] ?? "";
  return out;
}

// Ubah `number` menjadi nomor dengan kode perusahaan TERTENTU.
// Kembalikan null bila template tidak memakai token kode, atau kode di nomor
// itu sudah sama dengan newCode (tidak perlu diubah).
export function remapNumber(format: string, number: string, newCode: string): string | null {
  const { names, literals, re } = buildParser(format);
  const companyToken = companyTokenOf(names);
  if (!companyToken) return null;
  const m = number.match(re);
  if (!m) return null;
  const parts: Parts = {};
  names.forEach((n, i) => (parts[n] = m[i + 1] ?? ""));
  if ((parts[companyToken] ?? "") === newCode) return null;
  return rebuild(parts, names, literals, companyToken, newCode);
}

// Sama seperti remapNumber, tapi dengan seq tertentu (untuk resolusi tabrakan).
function remapWithSeq(format: string, number: string, newCode: string, seq: number): string | null {
  const { names, literals, re } = buildParser(format);
  const companyToken = companyTokenOf(names);
  if (!companyToken) return null;
  const m = number.match(re);
  if (!m) return null;
  const parts: Parts = {};
  names.forEach((n, i) => (parts[n] = m[i + 1] ?? ""));
  if ((parts[companyToken] ?? "") === newCode) return null;
  return rebuild(parts, names, literals, companyToken, newCode, seq);
}

// Ganti kemunculan oldNum→newNum pada reference/description entry + baris jurnal.
async function replaceJournal(entryIds: string[], oldS: string, newS: string): Promise<void> {
  if (entryIds.length === 0) return;
  const uniqueIds = Array.from(new Set(entryIds.filter(Boolean)) as Set<string>);
  if (uniqueIds.length === 0) return;
  const entries = await db.journalEntry.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, reference: true, description: true },
  });
  for (const e of entries) {
    const data: Record<string, string> = {};
    if (e.reference && e.reference.includes(oldS)) data.reference = e.reference.split(oldS).join(newS);
    if (e.description && e.description.includes(oldS)) data.description = e.description.split(oldS).join(newS);
    if (Object.keys(data).length > 0) {
      await db.journalEntry.update({ where: { id: e.id }, data });
    }
    const lines = await db.journalLine.findMany({
      where: { entryId: e.id, description: { contains: oldS } },
      select: { id: true, description: true },
    });
    for (const l of lines) {
      const desc = l.description ? l.description.split(oldS).join(newS) : l.description;
      await db.journalLine.update({ where: { id: l.id }, data: { description: desc } });
    }
  }
}

async function replaceRaw(modelName: "payment" | "receipt" | "inventoryMovement", ids: string[], oldS: string, newS: string): Promise<void> {
  if (ids.length === 0) return;
  const model = (db as any)[modelName];
  for (const id of ids) {
    const row = await model.findUnique({ where: { id } });
    if (!row) continue;
    const data: Record<string, string> = {};
    if (row.reference && row.reference.includes(oldS)) data.reference = row.reference.split(oldS).join(newS);
    if (row.description && row.description.includes(oldS)) data.description = row.description.split(oldS).join(newS);
    if (Object.keys(data).length > 0) await model.update({ where: { id }, data });
  }
}

type Kind = {
  model: "invoice" | "receipt" | "payment" | "transfer" | "payrollEntry" | "employeeReimbursement" | "employeeLoan";
  label: string;
  orderField?: string;
  cascade: (rowId: string, oldNum: string, newNum: string) => Promise<void>;
};

const KINDS: Kind[] = [
  {
    model: "invoice",
    label: "invoice",
    orderField: "date",
    cascade: async (id, o, n) => {
      const entries = await db.journalEntry.findMany({
        where: { sourceId: id, source: { in: ["SALES_INVOICE", "PURCHASE_INVOICE"] } },
        select: { id: true },
      });
      await replaceJournal(entries.map((e) => e.id), o, n);
      const movements = await db.inventoryMovement.findMany({
        where: { OR: [{ reference: o }, { description: { contains: o } }] },
        select: { id: true },
      });
      await replaceRaw("inventoryMovement", movements.map((m) => m.id), o, n);
      const recs = await db.receipt.findMany({ where: { allocateToInvoiceId: id } });
      await replaceRaw("receipt", recs.map((r) => r.id), o, n);
      await replaceJournal(recs.map((r) => r.journalEntryId ?? ""), o, n);
      const pays = await db.payment.findMany({ where: { allocateToInvoiceId: id } });
      await replaceRaw("payment", pays.map((p) => p.id), o, n);
      await replaceJournal(pays.map((p) => p.journalEntryId ?? ""), o, n);
    },
  },
  {
    model: "receipt",
    label: "receipt",
    orderField: "date",
    cascade: async (id, o, n) => {
      const r = await db.receipt.findUnique({ where: { id } });
      await replaceJournal(r?.journalEntryId ? [r.journalEntryId] : [], o, n);
    },
  },
  {
    model: "payment",
    label: "payment",
    orderField: "date",
    cascade: async (id, o, n) => {
      const p = await db.payment.findUnique({ where: { id } });
      await replaceJournal(p?.journalEntryId ? [p.journalEntryId] : [], o, n);
    },
  },
  {
    model: "transfer",
    label: "transfer",
    orderField: "date",
    cascade: async (id, o, n) => {
      const t = await db.transfer.findUnique({ where: { id } });
      await replaceJournal(t?.journalEntryId ? [t.journalEntryId] : [], o, n);
    },
  },
  {
    model: "payrollEntry",
    label: "payroll",
    orderField: "payDate",
    cascade: async (id, o, n) => {
      const p = await db.payrollEntry.findUnique({ where: { id } });
      await replaceJournal(p?.journalEntryId ? [p.journalEntryId] : [], o, n);
      const pays = await db.payment.findMany({ where: { reference: o } });
      await replaceRaw("payment", pays.map((x) => x.id), o, n);
      await replaceJournal(pays.map((x) => x.journalEntryId ?? ""), o, n);
    },
  },
  {
    model: "employeeReimbursement",
    label: "reimbursement",
    orderField: "date",
    cascade: async (id, o, n) => {
      const r = await db.employeeReimbursement.findUnique({ where: { id } });
      await replaceJournal(r?.journalEntryId ? [r.journalEntryId] : [], o, n);
      const pays = await db.payment.findMany({ where: { reference: o } });
      await replaceRaw("payment", pays.map((x) => x.id), o, n);
      await replaceJournal(pays.map((x) => x.journalEntryId ?? ""), o, n);
    },
  },
  {
    model: "employeeLoan",
    label: "loan",
    orderField: "date",
    cascade: async (id, o, n) => {
      const l = await db.employeeLoan.findUnique({ where: { id } });
      await replaceJournal(l?.journalEntryId ? [l.journalEntryId] : [], o, n);
      const pays = await db.payment.findMany({ where: { reference: o } });
      await replaceRaw("payment", pays.map((x) => x.id), o, n);
      await replaceJournal(pays.map((x) => x.journalEntryId ?? ""), o, n);
      const recs = await db.receipt.findMany({ where: { reference: o } });
      await replaceRaw("receipt", recs.map((x) => x.id), o, n);
      await replaceJournal(recs.map((x) => x.journalEntryId ?? ""), o, n);
    },
  },
];

export async function renumberDocuments(
  oldCode: string,
  newCode: string,
  format: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (oldCode === newCode) return result;
  // format tanpa token companyCode → tidak ada yang perlu diubah
  if (!companyTokenOf(buildParser(format).names)) return result;

  // Peta oldNumber → newNumber untuk sweep teks referensi lintas dokumen.
  const numberMap = new Map<string, string>();

  for (const kind of KINDS) {
    const model = (db as any)[kind.model];
    const orderField = kind.orderField || "date";
    const rows = await model.findMany({ orderBy: [{ [orderField]: "asc" }, { createdAt: "asc" }] });
    const used = new Set<string>(rows.map((r: any) => r.number));
    let count = 0;
    for (const row of rows as any[]) {
      // Dokumen dengan segmen kode ≠ newCode ikut dinomori ulang (mengikuti
      // kode perusahaan saat ini), sehingga bolak-balik kode selalu konsisten.
      const target = remapNumber(format, row.number, newCode);
      if (!target) continue;
      let final = target;
      if (used.has(final)) {
        let seq = 2;
        let ok = false;
        while (seq < 1_000_000) {
          const alt = remapWithSeq(format, row.number, newCode, seq);
          if (alt && !used.has(alt)) {
            final = alt;
            ok = true;
            break;
          }
          seq += 1;
        }
        if (!ok && used.has(final)) continue; // lewati bila tak dapat nomor unik
      }
      used.delete(row.number);
      used.add(final);
      await model.update({ where: { id: row.id }, data: { number: final } });
      numberMap.set(row.number, final);
      await kind.cascade(row.id, row.number, final);
      count += 1;
    }
    if (count > 0) result[kind.label] = count;
  }

  // Nomor jurnal umum (entryNumber) ikut diseragamkan
  const jeRows = await db.journalEntry.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
  const usedJe = new Set<string>(jeRows.map((e) => e.entryNumber));
  let jeCount = 0;
  for (const e of jeRows) {
    const target = remapNumber(format, e.entryNumber, newCode);
    if (!target) continue;
    let final = target;
    if (usedJe.has(final)) {
      let seq = 2;
      let ok = false;
      while (seq < 1_000_000) {
        const alt = remapWithSeq(format, e.entryNumber, newCode, seq);
        if (alt && !usedJe.has(alt)) {
          final = alt;
          ok = true;
          break;
        }
        seq += 1;
      }
      if (!ok && usedJe.has(final)) continue;
    }
    usedJe.delete(e.entryNumber);
    usedJe.add(final);
    await db.journalEntry.update({ where: { id: e.id }, data: { entryNumber: final } });
    numberMap.set(e.entryNumber, final);
    jeCount += 1;
  }
  if (jeCount > 0) result.journal = jeCount;

  // === Sweep global teks referensi lintas dokumen ===
  // Menutup celah referensi non-relasional (mis. payment.reference yang berisi
  // nomor PO/invoice lain sebagai teks biasa): ganti semua oldNumber→newNumber.
  if (numberMap.size > 0) {
    const applyReplace = (text: string | null): string | null => {
      if (!text) return text;
      let out = text;
      for (const [o, n] of numberMap) {
        if (out.includes(o)) out = out.split(o).join(n);
      }
      return out;
    };
    const replaceRow = async (modelName: "payment" | "receipt" | "inventoryMovement" | "journalEntry", fields: string[]) => {
      const model = (db as any)[modelName];
      const rows = await model.findMany();
      for (const row of rows as any[]) {
        const data: Record<string, string> = {};
        for (const f of fields) {
          const next = applyReplace(row[f]);
          if (next !== row[f]) data[f] = next ?? "";
        }
        if (Object.keys(data).length > 0) await model.update({ where: { id: row.id }, data });
      }
    };
    await replaceRow("payment", ["reference", "description"]);
    await replaceRow("receipt", ["reference", "description"]);
    await replaceRow("inventoryMovement", ["reference", "description"]);
    await replaceRow("journalEntry", ["reference", "description"]);
    const jeLines = await db.journalLine.findMany();
    for (const l of jeLines) {
      const next = applyReplace(l.description);
      if (next !== l.description) {
        await db.journalLine.update({ where: { id: l.id }, data: { description: next } });
      }
    }
  }

  return result;
}