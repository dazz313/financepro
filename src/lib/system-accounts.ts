import { db } from "@/lib/db";

// Akun referensi sistem: kode yang dipakai modul secara longgar (relasi by code).
// Bisa diganti nama, tapi tidak boleh dihapus / diubah kodenya (ala Manager.io).
export const SYSTEM_ACCOUNTS: Record<string, string> = {
  "1-1100": "Kas & setara kas (kas/bank default)",
  "1-1200": "Bank (invoice mark-paid & transfer)",
  "1-1300": "Piutang Usaha (penjualan & pinjaman karyawan)",
  "1-1400": "Persediaan Barang (inventory)",
  "1-1600": "PPN Masukan (pembelian ber-PPN)",
  "1-1700": "Piutang Karyawan (kasbon & pinjaman pegawai)",
  "1-2100": "Aset Tetap - At Cost (pembelian aset)",
  "1-2600": "Akumulasi Penyusutan (default)",
  "1-2900": "Akumulasi Penyusutan (aset tetap)",
  "2-1100": "Hutang Usaha (pembelian)",
  "2-1200": "Hutang Pajak (PPN/PPh/BPJS)",
  "2-1500": "Hutang BPJS (potongan & iuran BPJS Kesehatan/Ketenagakerjaan)",
  "3-1000": "Modal Pemilik (saldo awal)",
  "3-3000": "Penyesuaian Modal (inventori ADJUST)",
  "4-1000": "Pendapatan Penjualan (inventory)",
  "4-1100": "Pendapatan Jasa (default invoice)",
  "4-2000": "Pendapatan Lain-lain (laba aset/jasa lepas)",
  "4-2200": "Pendapatan Bunga (bunga kasbon/pinjaman)",
  "5-1100": "Beban Gaji & Upah (payroll)",
  "5-1700": "Beban Administrasi & Umum (reimburse & pembelian)",
  "5-2000": "Harga Pokok Penjualan (inventory)",
  "5-3000": "Beban Penyusutan (aset tetap)",
  "5-4000": "Beban Lain-lain (rugi aset)",
};

// Modul yang mereferensikan akun (untuk pesan user).
const MODULE_SOURCES = [
  { key: "bankAccount", model: "bankAccount", fields: ["accountCode"] },
  { key: "fixedAsset", model: "fixedAsset", fields: ["assetAccountCode", "accumulatedAccountCode", "expenseAccountCode"] },
  { key: "inventoryItem", model: "inventoryItem", fields: ["inventoryAccountCode", "salesAccountCode", "cogsAccountCode"] },
  { key: "payment", model: "payment", fields: ["accountCode"] },
  { key: "receipt", model: "receipt", fields: ["accountCode"] },
  { key: "invoiceLine", model: "invoiceLine", fields: ["accountCode"] },
  { key: "taxRule", model: "taxRule", fields: ["accountCode"] },
  { key: "reimbursement", model: "employeeReimbursement", fields: ["accountCode"] },
  { key: "loan", model: "employeeLoan", fields: ["accountCode"] },
] as const;

export async function getSystemAccountCodes(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const add = (code: string, why: string) => {
    const list = map.get(code) ?? [];
    if (!list.includes(why)) list.push(why);
    map.set(code, list);
  };

  // 1) Referensi dari modul (nilai unik per field, efisien via groupBy)
  for (const src of MODULE_SOURCES) {
    const model = (db as any)[src.model];
    if (!model?.groupBy) continue;
    for (const f of src.fields) {
      try {
        const rows = await model.groupBy({ by: [f] });
        for (const row of rows) {
          const code = row[f];
          if (code) add(String(code), src.model);
        }
      } catch {
        // abaikan field yang tidak ada di model / versi skema
      }
    }
  }

  // 2) Acuan kode sistem default (dipakai kode meskipun belum ada record)
  for (const [code, why] of Object.entries(SYSTEM_ACCOUNTS)) {
    add(code, why);
  }

  return map;
}

export function isSystemAccount(code: string, map: Map<string, string[]>): boolean {
  return map.has(code);
}