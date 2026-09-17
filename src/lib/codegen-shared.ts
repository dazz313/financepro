// Definisi seri penomoran otomatis. Dipakai server (code-gen) & client (preview).

export type DocSeries =
  | "invoice"
  | "quote"
  | "order"
  | "journal"
  | "receipt"
  | "payment"
  | "transfer"
  | "payroll"
  | "reimbursement"
  | "loan"
  | "opening"
  | "employee"
  | "contact"
  | "bankAccount"
  | "fixedAsset"
  | "inventoryItem";

export interface SeriesDef {
  prefix: string; // field prefix di CompanySettings
  start: string; // field nomor awal di CompanySettings
  next: string; // field nomor berikutnya di CompanySettings
  fallback: string; // prefix default bila settings belum tersedia
  label: string; // label UI
}

export interface NumberingContext {
  prefix: string;
  company: string;
  year: string;
  month: string;
  seq: string;
}

export const SERIES_DEFS: Record<DocSeries, SeriesDef> = {
  invoice:       { prefix: "invoicePrefix",        start: "invoiceStartNumber",        next: "nextInvoiceNumber",        fallback: "INV", label: "Faktur (Invoice)" },
  quote:         { prefix: "quotePrefix",          start: "quoteStartNumber",          next: "nextQuoteNumber",          fallback: "QTN", label: "Penawaran (Quote)" },
  order:         { prefix: "orderPrefix",          start: "orderStartNumber",          next: "nextOrderNumber",          fallback: "ORD", label: "Pesanan (Order)" },
  journal:       { prefix: "journalPrefix",        start: "journalStartNumber",        next: "nextJournalNumber",        fallback: "JE",  label: "Jurnal" },
  receipt:       { prefix: "receiptPrefix",        start: "receiptStartNumber",        next: "nextReceiptNumber",        fallback: "RCV", label: "Penerimaan (Receipt)" },
  payment:       { prefix: "paymentPrefix",        start: "paymentStartNumber",        next: "nextPaymentNumber",        fallback: "PMT", label: "Pembayaran (Payment)" },
  transfer:      { prefix: "transferPrefix",       start: "transferStartNumber",       next: "nextTransferNumber",       fallback: "TRF", label: "Transfer" },
  payroll:       { prefix: "payrollPrefix",        start: "payrollStartNumber",        next: "nextPayrollNumber",        fallback: "PAY", label: "Penggajian (Payroll)" },
  reimbursement: { prefix: "reimbursementPrefix",  start: "reimbursementStartNumber",  next: "nextReimbursementNumber",  fallback: "RMB", label: "Reimburse" },
  loan:          { prefix: "loanPrefix",           start: "loanStartNumber",           next: "nextLoanNumber",           fallback: "LN",  label: "Pinjaman Karyawan" },
  opening:       { prefix: "openingPrefix",        start: "openingStartNumber",        next: "nextOpeningNumber",        fallback: "OP",  label: "Saldo Awal (Opening)" },
  employee:      { prefix: "employeePrefix",       start: "employeeStartNumber",       next: "nextEmployeeNumber",       fallback: "EMP", label: "Pegawai" },
  contact:       { prefix: "contactPrefix",        start: "contactStartNumber",        next: "nextContactNumber",        fallback: "CUS", label: "Kontak" },
  bankAccount:   { prefix: "bankAccountPrefix",    start: "bankAccountStartNumber",    next: "nextBankAccountNumber",    fallback: "BA",  label: "Akun Kas/Bank" },
  fixedAsset:    { prefix: "fixedAssetPrefix",     start: "fixedAssetStartNumber",     next: "nextFixedAssetNumber",     fallback: "FA",  label: "Aset Tetap" },
  inventoryItem: { prefix: "inventoryItemPrefix",  start: "inventoryItemStartNumber",  next: "nextInventoryItemNumber",  fallback: "ITM", label: "Item Persediaan" },
};

export const SERIES_ORDER = Object.keys(SERIES_DEFS) as DocSeries[];

export function padNumber(n: number, length = 4): string {
  return String(Math.max(1, n)).padStart(length, "0");
}

export function renderNumberingTemplate(
  template: string,
  context: NumberingContext
): string {
  return template
    .replaceAll("{prefix}", context.prefix)
    .replaceAll("{company}", context.company)
    .replaceAll("{companyCode}", context.company)
    .replaceAll("{year}", context.year)
    .replaceAll("{month}", context.month)
    .replaceAll("{seq}", context.seq);
}

export function formatNumberForPreview(value: number, length = 4): string {
  return padNumber(value, length);
}
