import { db } from "@/lib/db";
import type { AuthUser } from "@/lib/auth";

export type SettingsLogSection = "COMPANY" | "PREFERENCES" | "PASSWORD";
export type SettingsLogAction = "CREATE" | "UPDATE" | "PASSWORD_CHANGED";

export type ChangeDiff = {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
};

// Label Indonesia untuk setiap field pengaturan (company + preferences).
export const SETTINGS_FIELD_LABELS: Record<string, string> = {
  // Profil perusahaan
  name: "Nama Perusahaan",
  legalName: "Nama Legal",
  taxId: "NPWP",
  email: "Email",
  phone: "Telepon",
  address: "Alamat",
  city: "Kota",
  postalCode: "Kode Pos",
  country: "Negara",
  logoUrl: "Logo",
  // Mata uang & format
  currencyCode: "Kode Mata Uang",
  currencySymbol: "Simbol Mata Uang",
  currencyPosition: "Posisi Simbol",
  decimalPlaces: "Jumlah Desimal",
  thousandSeparator: "Pemisah Ribuan",
  decimalSeparator: "Pemisah Desimal",
  locale: "Locale",
  // Tahun fiskal
  fiscalYearStartMonth: "Bulan Awal Fiskal",
  fiscalYearStartDay: "Tanggal Awal Fiskal",
  // Pajak
  defaultTaxRate: "Tarif PPN Default",
  taxIncluded: "Harga Termasuk Pajak",
  ppnEnabled: "PPN Aktif",
  // Penomoran dokumen
  companyCode: "Kode Perusahaan",
  numberingFormat: "Format Template Penomoran",
  invoicePrefix: "Awalan Invoice",
  invoiceStartNumber: "Nomor Awal Invoice",
  nextInvoiceNumber: "Nomor Invoice Berikutnya",
  quotePrefix: "Awalan Penawaran",
  quoteStartNumber: "Nomor Awal Penawaran",
  nextQuoteNumber: "Nomor Penawaran Berikutnya",
  orderPrefix: "Awalan Pesanan",
  orderStartNumber: "Nomor Awal Pesanan",
  nextOrderNumber: "Nomor Pesanan Berikutnya",
  journalPrefix: "Awalan Jurnal",
  journalStartNumber: "Nomor Awal Jurnal",
  nextJournalNumber: "Nomor Jurnal Berikutnya",
  openingPrefix: "Awalan Saldo Awal",
  openingStartNumber: "Nomor Awal Saldo Awal",
  nextOpeningNumber: "Nomor Saldo Awal Berikutnya",
  receiptPrefix: "Awalan Penerimaan",
  receiptStartNumber: "Nomor Awal Penerimaan",
  nextReceiptNumber: "Nomor Penerimaan Berikutnya",
  paymentPrefix: "Awalan Pembayaran",
  paymentStartNumber: "Nomor Awal Pembayaran",
  nextPaymentNumber: "Nomor Pembayaran Berikutnya",
  transferPrefix: "Awalan Transfer",
  transferStartNumber: "Nomor Awal Transfer",
  nextTransferNumber: "Nomor Transfer Berikutnya",
  payrollPrefix: "Awalan Payroll",
  payrollStartNumber: "Nomor Awal Payroll",
  nextPayrollNumber: "Nomor Payroll Berikutnya",
  reimbursementPrefix: "Awalan Reimburse",
  reimbursementStartNumber: "Nomor Awal Reimburse",
  nextReimbursementNumber: "Nomor Reimburse Berikutnya",
  loanPrefix: "Awalan Pinjaman",
  loanStartNumber: "Nomor Awal Pinjaman",
  nextLoanNumber: "Nomor Pinjaman Berikutnya",
  employeePrefix: "Awalan Pegawai",
  employeeStartNumber: "Nomor Awal Pegawai",
  nextEmployeeNumber: "Nomor Pegawai Berikutnya",
  contactPrefix: "Awalan Kontak",
  contactStartNumber: "Nomor Awal Kontak",
  nextContactNumber: "Nomor Kontak Berikutnya",
  bankAccountPrefix: "Awalan Rekening Bank",
  bankAccountStartNumber: "Nomor Awal Rekening Bank",
  nextBankAccountNumber: "Nomor Rekening Bank Berikutnya",
  fixedAssetPrefix: "Awalan Aset Tetap",
  fixedAssetStartNumber: "Nomor Awal Aset Tetap",
  nextFixedAssetNumber: "Nomor Aset Tetap Berikutnya",
  inventoryItemPrefix: "Awalan Barang",
  inventoryItemStartNumber: "Nomor Awal Barang",
  nextInventoryItemNumber: "Nomor Barang Berikutnya",
  // Dokumen
  defaultPaymentTermsDays: "Termin Pembayaran Default",
  invoiceSignature: "Nama Penandatangan",
  invoiceSignatureTitle: "Jabatan Penandatangan",
  invoiceFooterNote: "Catatan Kaki Invoice",
  docGreeting: "Salam Hormat",
  docPicName: "Nama PIC",
  docPicPhone: "Nomor PIC",
  invoiceBankName: "Nama Bank",
  invoiceBankAccount: "Nomor Rekening",
  invoiceBankHolder: "Atas Nama Rekening",
  // Preferensi user
  theme: "Tema",
  density: "Kepadatan",
  numberFormat: "Format Angka",
  dateFormat: "Format Tanggal",
};

// Field yang tidak perlu dicatat sebagai perubahan.
const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "userId"]);

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

// Bandingkan dua objek pengaturan, hasilkan daftar perubahan berlabel.
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): ChangeDiff[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: ChangeDiff[] = [];
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const b = normalize(before[key]);
    const a = normalize(after[key]);
    if (b !== a) {
      changes.push({
        field: key,
        label: SETTINGS_FIELD_LABELS[key] ?? key,
        before: before[key] ?? null,
        after: after[key] ?? null,
      });
    }
  }
  return changes;
}

// Catat satu baris audit log pengaturan.
export async function logSettingsChange(
  user: AuthUser,
  section: SettingsLogSection,
  action: SettingsLogAction,
  changes: ChangeDiff[],
  summary: string
): Promise<void> {
  try {
    await db.settingsLog.create({
      data: {
        userId: user.id,
        section,
        action,
        summary,
        changes: changes.length ? JSON.stringify(changes) : null,
      },
    });
  } catch (error) {
    // Log audit tidak boleh menggagalkan penyimpanan utama.
    console.error("Gagal mencatat riwayat pengaturan:", error);
  }
}