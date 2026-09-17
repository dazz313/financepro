// Definisi jenis transaksi untuk impor CSV: asal data, pemetaan kolom, dan template contoh.
import { CSV_TEMPLATE_ROWS } from "@/lib/seed-data";

export type CsvImportType = "jurnal" | "penerimaan" | "pengeluaran" | "aruskas";

export type CsvRole =
  | "date"
  | "description"
  | "reference"
  | "accountCode"
  | "debit"
  | "credit"
  | "amount"
  | "bank"
  | "from"
  | "to"
  | "contact"
  | "direction";

export type CsvColumnSpec = {
  role: CsvRole;
  label: string;
  candidates: string[];
  required?: boolean;
};

export type CsvTypeMeta = {
  label: string;
  shortLabel: string;
  description: string;
  columns: CsvColumnSpec[];
  template: string[][];
};

export const CSV_IMPORT_TYPES: Record<CsvImportType, CsvTypeMeta> = {
  jurnal: {
    label: "Jurnal Umum",
    shortLabel: "Jurnal",
    description:
      "Entri jurnal ganda. Kolom debit/credit. Satu transaksi boleh beberapa baris; total debit = total credit.",
    columns: [
      { role: "date", label: "Tanggal", candidates: ["date", "tanggal", "tgl", "trxdate"], required: true },
      { role: "description", label: "Deskripsi", candidates: ["description", "desc", "keterangan", "deskripsi", "uraian", "namatransaksi", "memo"] },
      { role: "reference", label: "Referensi", candidates: ["reference", "ref", "bukti", "nobukti", "noreferensi"] },
      { role: "accountCode", label: "Kode Akun", candidates: ["accountcode", "kodeakun", "akun", "kodeperkiraan", "account", "kode"], required: true },
      { role: "debit", label: "Debit", candidates: ["debit", "debet"] },
      { role: "credit", label: "Kredit", candidates: ["credit", "kredit"] },
    ],
    template: CSV_TEMPLATE_ROWS,
  },
  penerimaan: {
    label: "Penerimaan (Uang Masuk)",
    shortLabel: "Penerimaan",
    description:
      "Uang masuk ke kas/bank. 1 baris = 1 transaksi penerimaan. Jurnal otomatis: Debit Kas/Bank, Kredit Akun Lawan.",
    columns: [
      { role: "date", label: "Tanggal", candidates: ["date", "tanggal", "tgl", "trxdate"], required: true },
      { role: "description", label: "Deskripsi", candidates: ["description", "desc", "keterangan", "deskripsi", "uraian", "memo"] },
      { role: "reference", label: "Referensi", candidates: ["reference", "ref", "bukti", "nobukti", "noreferensi"] },
      { role: "bank", label: "Kas/Bank", candidates: ["bank", "bankaccount", "rekening", "kasbank", "akunbank", "norekening"], required: true },
      { role: "from", label: "Dari Kontak", candidates: ["fromcontact", "dari", "darikontak", "kontak"] },
      { role: "accountCode", label: "Akun Lawan", candidates: ["accountcode", "akunlawan", "kodeakun", "account", "kode"], required: true },
      { role: "amount", label: "Jumlah", candidates: ["amount", "jumlah", "nominal"], required: true },
    ],
    template: [
      ["date", "description", "reference", "bank", "fromContact", "accountCode", "amount"],
      ["2024-01-05", "Penerimaan jasa sewa", "BKT-101", "REK-01", "PT Pelanggan A", "4-1100", "25000000"],
      ["2024-01-10", "Pelunasan piutang", "BKT-102", "REK-01", "PT Pelanggan A", "1-1300", "12000000"],
      ["2024-01-12", "Pendapatan lain-lain", "BKT-103", "KAS-01", "", "4-2000", "500000"],
    ],
  },
  pengeluaran: {
    label: "Pengeluaran (Uang Keluar)",
    shortLabel: "Pengeluaran",
    description:
      "Uang keluar dari kas/bank. 1 baris = 1 transaksi pembayaran. Jurnal otomatis: Debit Akun Lawan, Kredit Kas/Bank.",
    columns: [
      { role: "date", label: "Tanggal", candidates: ["date", "tanggal", "tgl", "trxdate"], required: true },
      { role: "description", label: "Deskripsi", candidates: ["description", "desc", "keterangan", "deskripsi", "uraian", "memo"] },
      { role: "reference", label: "Referensi", candidates: ["reference", "ref", "bukti", "nobukti", "noreferensi"] },
      { role: "bank", label: "Kas/Bank", candidates: ["bank", "bankaccount", "rekening", "kasbank", "akunbank", "norekening"], required: true },
      { role: "to", label: "Kepada Kontak", candidates: ["tocontact", "kepada", "kepadacontact", "kontak"] },
      { role: "accountCode", label: "Akun Lawan", candidates: ["accountcode", "akunlawan", "kodeakun", "account", "kode"], required: true },
      { role: "amount", label: "Jumlah", candidates: ["amount", "jumlah", "nominal"], required: true },
    ],
    template: [
      ["date", "description", "reference", "bank", "toContact", "accountCode", "amount"],
      ["2024-01-15", "Pembelian ATK kantor", "BKT-201", "KAS-01", "CV Pemasok B", "5-1400", "3750000"],
      ["2024-01-20", "Listrik & air kantor", "BKT-202", "REK-01", "", "5-1300", "1750000"],
      ["2024-01-25", "Sewa kendaraan", "BKT-203", "REK-01", "CV Pemasok B", "5-1200", "6000000"],
    ],
  },
  aruskas: {
    label: "Arus Kas (Masuk & Keluar)",
    shortLabel: "Arus Kas",
    description:
      "Buku kas campur: baris MASUK jadi penerimaan, baris KELUAR jadi pembayaran. Jika tanpa kolom arah, isi kolom debit/credit.",
    columns: [
      { role: "date", label: "Tanggal", candidates: ["date", "tanggal", "tgl", "trxdate"], required: true },
      { role: "description", label: "Deskripsi", candidates: ["description", "desc", "keterangan", "deskripsi", "uraian", "memo"] },
      { role: "reference", label: "Referensi", candidates: ["reference", "ref", "bukti", "nobukti", "noreferensi"] },
      { role: "bank", label: "Kas/Bank", candidates: ["bank", "bankaccount", "rekening", "kasbank", "akunbank", "norekening"] },
      { role: "contact", label: "Kontak", candidates: ["contact", "kontak", "dari", "kepada", "pihak"] },
      { role: "accountCode", label: "Akun Lawan", candidates: ["accountcode", "akunlawan", "kodeakun", "account", "kode"] },
      { role: "amount", label: "Jumlah", candidates: ["amount", "jumlah", "nominal"] },
      { role: "direction", label: "Arah", candidates: ["direction", "arah", "jenis", "tipe", "aliran"] },
    ],
    template: [
      ["date", "description", "reference", "bank", "contact", "accountCode", "amount", "direction"],
      ["2024-01-02", "Penjualan tunai", "AFK-001", "KAS-01", "", "4-1000", "5000000", "MASUK"],
      ["2024-01-03", "Pembelian BBM", "AFK-002", "KAS-01", "", "5-1600", "750000", "KELUAR"],
      ["2024-01-04", "Jasa servis AC", "AFK-003", "", "CV Pelanggan", "4-1100", "2000000", "MASUK"],
    ],
  },
};

// Resolusi indeks kolom (case-insensitive, normalisasi) ala route CSV lama:
// 1) exact match, 2) startsWith (kandidat >=3), 3) includes (kandidat >=4)
export function findColIndex(headers: string[], candidates: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const nc = candidates.map(norm);
  const normHeaders = headers.map(norm);
  let idx = normHeaders.findIndex((h) => nc.includes(h));
  if (idx >= 0) return idx;
  idx = normHeaders.findIndex((h) => nc.some((c) => c.length >= 3 && h.startsWith(c)));
  if (idx >= 0) return idx;
  return normHeaders.findIndex((h) => nc.some((c) => c.length >= 4 && h.includes(c)));
}

export function resolveRoles(headers: string[], columns: CsvColumnSpec[]): Partial<Record<CsvRole, number>> {
  const out: Partial<Record<CsvRole, number>> = {};
  for (const col of columns) {
    out[col.role] = findColIndex(headers, col.candidates);
  }
  return out;
}

export function normalizeDirection(v: string): "IN" | "OUT" | null {
  const s = v.trim().toLowerCase();
  if (/^(masuk|in|debit|pemasukan|income|inflow|m)$/.test(s)) return "IN";
  if (/^(keluar|out|credit|pengeluaran|expense|outflow|k)$/.test(s)) return "OUT";
  return null;
}

// Template header + baris contoh dalam format CSV siap unduh
export function buildTemplateCSV(type: CsvImportType): string {
  const meta = CSV_IMPORT_TYPES[type];
  return meta.template
    .map((row) =>
      row.map((cell) => {
        const needsQuote = /[",\n]/.test(cell);
        return needsQuote ? `"${cell.replace(/"/g, '""')}"` : cell;
      }).join(",")
    )
    .join("\n");
}

export const CSV_TYPE_KEYS = Object.keys(CSV_IMPORT_TYPES) as CsvImportType[];