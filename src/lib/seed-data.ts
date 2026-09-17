// Chart of Accounts default berdasarkan standar akuntansi Indonesia.
// Struktur: kode - nama - tipe - subtype - isGroup
// 1 = Aset, 2 = Kewajiban, 3 = Ekuitas, 4 = Pendapatan, 5 = Beban

export type SeedAccount = {
  code: string;
  name: string;
  type: string;
  subtype?: string;
  parentCode?: string;
  isGroup: boolean;
};

export const DEFAULT_CHART_OF_ACCOUNTS: SeedAccount[] = [
  // ============ ASET (1) ============
  { code: "1", name: "ASET", type: "ASSET", isGroup: true },
  { code: "1-1000", name: "Aset Lancar", type: "ASSET", subtype: "Current Asset", parentCode: "1", isGroup: true },
  { code: "1-1100", name: "Kas & Setara Kas", type: "ASSET", subtype: "Cash", parentCode: "1-1000", isGroup: false },
  { code: "1-1200", name: "Bank - BCA", type: "ASSET", subtype: "Bank", parentCode: "1-1000", isGroup: false },
  { code: "1-1210", name: "Bank - Mandiri", type: "ASSET", subtype: "Bank", parentCode: "1-1000", isGroup: false },
  { code: "1-1300", name: "Piutang Usaha", type: "ASSET", subtype: "Account Receivable", parentCode: "1-1000", isGroup: false },
  { code: "1-1400", name: "Persediaan Barang", type: "ASSET", subtype: "Inventory", parentCode: "1-1000", isGroup: false },
  { code: "1-1500", name: "Uang Muka & Biaya Dibayar Di Muka", type: "ASSET", subtype: "Prepaid", parentCode: "1-1000", isGroup: false },
  { code: "1-1600", name: "PPN Masukan", type: "ASSET", subtype: "VAT Input", parentCode: "1-1000", isGroup: false },
  { code: "1-1700", name: "Piutang Karyawan", type: "ASSET", subtype: "Other Receivable", parentCode: "1-1000", isGroup: false },
  { code: "1-2000", name: "Aset Tetap", type: "ASSET", subtype: "Fixed Asset", parentCode: "1", isGroup: true },
  { code: "1-2100", name: "Peralatan", type: "ASSET", subtype: "Equipment", parentCode: "1-2000", isGroup: false },
  { code: "1-2200", name: "Kendaraan", type: "ASSET", subtype: "Vehicle", parentCode: "1-2000", isGroup: false },
  { code: "1-2300", name: "Bangunan", type: "ASSET", subtype: "Building", parentCode: "1-2000", isGroup: false },
  { code: "1-2900", name: "Akumulasi Penyusutan", type: "ASSET", subtype: "Contra Asset", parentCode: "1-2000", isGroup: false },

  // ============ KEWAJIBAN (2) ============
  { code: "2", name: "KEWAJIBAN", type: "LIABILITY", isGroup: true },
  { code: "2-1000", name: "Kewajiban Jangka Pendek", type: "LIABILITY", subtype: "Current Liability", parentCode: "2", isGroup: true },
  { code: "2-1100", name: "Hutang Usaha", type: "LIABILITY", subtype: "Account Payable", parentCode: "2-1000", isGroup: false },
  { code: "2-1200", name: "Hutang PPN", type: "LIABILITY", subtype: "VAT Payable", parentCode: "2-1000", isGroup: false },
  { code: "2-1210", name: "Hutang PPh 23", type: "LIABILITY", subtype: "Income Tax Payable", parentCode: "2-1000", isGroup: false },
  { code: "2-1300", name: "Pendapatan Diterima Di Muka", type: "LIABILITY", subtype: "Unearned Revenue", parentCode: "2-1000", isGroup: false },
  { code: "2-1400", name: "Hutang Bank Jangka Pendek", type: "LIABILITY", subtype: "Short Term Loan", parentCode: "2-1000", isGroup: false },
  { code: "2-1500", name: "Hutang BPJS", type: "LIABILITY", subtype: "Accrued Liability", parentCode: "2-1000", isGroup: false },
  { code: "2-2000", name: "Kewajiban Jangka Panjang", type: "LIABILITY", subtype: "Long Term Liability", parentCode: "2", isGroup: true },
  { code: "2-2100", name: "Hutang Bank Jangka Panjang", type: "LIABILITY", subtype: "Long Term Loan", parentCode: "2-2000", isGroup: false },

  // ============ EKUITAS (3) ============
  { code: "3", name: "EKUITAS", type: "EQUITY", isGroup: true },
  { code: "3-1000", name: "Modal Pemilik", type: "EQUITY", subtype: "Owner Capital", parentCode: "3", isGroup: false },
  { code: "3-1100", name: "Prive / Penarikan Modal", type: "EQUITY", subtype: "Owner Drawing", parentCode: "3", isGroup: false },
  { code: "3-2000", name: "Laba Ditahan", type: "EQUITY", subtype: "Retained Earning", parentCode: "3", isGroup: false },
  { code: "3-3000", name: "Laba Tahun Berjalan", type: "EQUITY", subtype: "Current Year Income", parentCode: "3", isGroup: false },

  // ============ PENDAPATAN (4) ============
  { code: "4", name: "PENDAPATAN", type: "REVENUE", isGroup: true },
  { code: "4-1000", name: "Pendapatan Penjualan", type: "REVENUE", subtype: "Sales Revenue", parentCode: "4", isGroup: false },
  { code: "4-1100", name: "Pendapatan Jasa", type: "REVENUE", subtype: "Service Revenue", parentCode: "4", isGroup: false },
  { code: "4-2000", name: "Pendapatan Lain-lain", type: "REVENUE", subtype: "Other Revenue", parentCode: "4", isGroup: false },
  { code: "4-2200", name: "Pendapatan Bunga", type: "REVENUE", subtype: "Interest Revenue", parentCode: "4", isGroup: false },
  { code: "4-2100", name: "Potongan Penjualan", type: "REVENUE", subtype: "Sales Discount", parentCode: "4", isGroup: false },

  // ============ BEBAN (5) ============
  { code: "5", name: "BEBAN", type: "EXPENSE", isGroup: true },
  { code: "5-1000", name: "Beban Operasional", type: "EXPENSE", subtype: "Operating Expense", parentCode: "5", isGroup: true },
  { code: "5-1100", name: "Beban Gaji & Upah", type: "EXPENSE", subtype: "Salary Expense", parentCode: "5-1000", isGroup: false },
  { code: "5-1200", name: "Beban Sewa", type: "EXPENSE", subtype: "Rent Expense", parentCode: "5-1000", isGroup: false },
  { code: "5-1300", name: "Beban Listrik & Utilitas", type: "EXPENSE", subtype: "Utility Expense", parentCode: "5-1000", isGroup: false },
  { code: "5-1400", name: "Beban Perlengkapan", type: "EXPENSE", subtype: "Supplies Expense", parentCode: "5-1000", isGroup: false },
  { code: "5-1500", name: "Beban Pemasaran & Iklan", type: "EXPENSE", subtype: "Marketing Expense", parentCode: "5-1000", isGroup: false },
  { code: "5-1600", name: "Beban Transportasi", type: "EXPENSE", subtype: "Transport Expense", parentCode: "5-1000", isGroup: false },
  { code: "5-1700", name: "Beban Administrasi & Umum", type: "EXPENSE", subtype: "Admin Expense", parentCode: "5-1000", isGroup: false },
  { code: "5-2000", name: "Harga Pokok Penjualan", type: "EXPENSE", subtype: "COGS", parentCode: "5", isGroup: false },
  { code: "5-2010", name: "Potongan Pembelian", type: "EXPENSE", subtype: "Purchase Discount", parentCode: "5", isGroup: false },
  { code: "5-3000", name: "Beban Penyusutan", type: "EXPENSE", subtype: "Depreciation Expense", parentCode: "5", isGroup: false },
  { code: "5-4000", name: "Beban Pajak", type: "EXPENSE", subtype: "Tax Expense", parentCode: "5", isGroup: false },
];

// Template contoh CSV untuk transaksi umum (bisa dipakai user sebagai panduan)
export const CSV_TEMPLATE_ROWS = [
  ["date", "description", "reference", "accountCode", "debit", "credit"],
  ["2024-01-05", "Setoran modal pemilik", "BUKTI-001", "1-1100", "50000000", "0"],
  ["2024-01-05", "Setoran modal pemilik", "BUKTI-001", "3-1000", "0", "50000000"],
  ["2024-01-10", "Pembelian peralatan kantor", "BUKTI-002", "1-2100", "15000000", "0"],
  ["2024-01-10", "Pembelian peralatan kantor", "BUKTI-002", "1-1200", "0", "15000000"],
  ["2024-01-15", "Penjualan jasa", "INV-001", "1-1200", "25000000", "0"],
  ["2024-01-15", "Penjualan jasa", "INV-001", "4-1100", "0", "25000000"],
  ["2024-01-20", "Pembayaran gaji karyawan", "BUKTI-003", "5-1100", "8000000", "0"],
  ["2024-01-20", "Pembayaran gaji karyawan", "BUKTI-003", "1-1100", "0", "8000000"],
  ["2024-01-25", "Pembayaran sewa kantor", "BUKTI-004", "5-1200", "5000000", "0"],
  ["2024-01-25", "Pembayaran sewa kantor", "BUKTI-004", "1-1200", "0", "5000000"],
];
