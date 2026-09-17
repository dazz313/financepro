// Data default pajak & potongan yang berlaku di Indonesia
// Dikirim ke TaxRule saat seed / reset to default.

export type TaxRuleInput = {
  code: string;
  name: string;
  description: string;
  category: string;
  rate: number;
  brackets?: [number, number | null, number][]; // [min, max|null, persen]
  appliesTo: string;
  accountCode: string;
  isActive: boolean;
  notes?: string;
};

// PTKP & potongan PPh 21 (UU HPP, per pasal):
// Lapisan tarif PPh Orang Pribadi (Tahun 2024):
//   0 - 60jt        → 5%
//   60jt - 250jt    → 15%
//   250jt - 500jt   → 25%
//   500jt - 5M      → 30%
//   > 5M            → 35%
export const PPH21_BRACKETS: [number, number | null, number][] = [
  [0, 60000000, 5],
  [60000000, 250000000, 15],
  [250000000, 500000000, 25],
  [500000000, 5000000000, 30],
  [5000000000, null, 35],
];

export const DEFAULT_TAX_RULES: TaxRuleInput[] = [
  {
    code: "PPN",
    name: "Pajak Pertambahan Nilai (PPN)",
    description:
      "PPN terutang atas penjualan/pembelian barang & jasa kena pajak. Berlaku multi-tarif sejak 2025 (11% umum, 12% untuk barang mewah tertentu).",
    category: "PPN",
    rate: 11,
    appliesTo: "BOTH",
    accountCode: "2-1200",
    isActive: true,
    notes: "UU HPP No. 7/2021",
  },
  {
    code: "PPH21",
    name: "PPh Pasal 21",
    description:
      "Pajak penghasilan atas gaji/tunjangan pegawai. Dihitung dengan tarif progresif terhadap penghasilan neto setahun dikurangi PTKP.",
    category: "PPH21",
    rate: 5,
    brackets: PPH21_BRACKETS,
    appliesTo: "PAYROLL",
    accountCode: "2-1200",
    isActive: true,
    notes: "UU HPP No. 7/2021, PP 58/2023",
  },
  {
    code: "PPH23",
    name: "PPh Pasal 23",
    description:
      "Pemotongan atas penghasilan berupa dividen, bunga, royalti, sewa, dan imbalan jasa tertentu yang dibayarkan kepada Wajib Pajak dalam negeri.",
    category: "PPH23",
    rate: 2,
    appliesTo: "PURCHASE",
    accountCode: "2-1200",
    isActive: true,
    notes: "PPh 23 jasa umum: 2%. Tarif 15% utk dividen/bunga/royalti.",
  },
  {
    code: "PPH42",
    name: "PPh Final Pasal 4(2)",
    description:
      "Pajak penghasilan bersifat final atas sewa tanah/bangunan (10%), bunga deposito (20%), hadiah undian (25%), jasa konstruksi, dan pengalihan hak atas tanah.",
    category: "PPH42",
    rate: 10,
    appliesTo: "PURCHASE",
    accountCode: "2-1200",
    isActive: true,
    notes: "PP 34/2016, PP 9/2022",
  },
  {
    code: "PPH22",
    name: "PPh Pasal 22",
    description:
      "Pemungutan pajak atas pembelian barang tertentu dan kegiatan impor. Dipungut oleh bendaharawan atau badan tertentu.",
    category: "PPH22",
    rate: 2.5,
    appliesTo: "PURCHASE",
    accountCode: "2-1200",
    isActive: true,
    notes: "Impor dgn API: 2,5%. Tanpa API: 7,5%.",
  },
  {
    code: "PPH26",
    name: "PPh Pasal 26",
    description:
      "Pemotongan atas penghasilan Wajib Pajak Luar Negeri (WPLN) berupa dividen, bunga, royalti, sewa, dan jasa.",
    category: "PPH26",
    rate: 20,
    appliesTo: "PURCHASE",
    accountCode: "2-1200",
    isActive: true,
    notes: "20% atau sesuai tax treaty (P3B).",
  },
  {
    code: "UMKM",
    name: "PPh Final UMKM (PP 55/2022)",
    description:
      "PPh final 0,5% atas peredaran bruto usaha bagi Wajib Pajak dengan omzet sampai Rp 4,8 miliar dalam satu tahun pajak.",
    category: "UMKM",
    rate: 0.5,
    appliesTo: "BOTH",
    accountCode: "2-1200",
    isActive: true,
    notes: "PP 55/2022 (sebelumnya PP 23/2018).",
  },
  {
    code: "PPHBADAN",
    name: "PPh Badan",
    description:
      "Pajak penghasilan Wajib Pajak Badan dalam negeri atas penghasilan neto. Tarif umum 22%.",
    category: "PPHBADAN",
    rate: 22,
    appliesTo: "BOTH",
    accountCode: "2-1200",
    isActive: true,
    notes: "UU HPP No. 7/2021. Terbuka utk 20% di bursa (3% lebih rendah).",
  },
  {
    code: "PBB",
    name: "PBB - Pajak Bumi & Bangunan",
    description:
      "Pajak atas kepemilikan/penguasaan tanah dan bangunan. Tarif 0,5% x NJKP (hingga 20% dari NJOP).",
    category: "PBB",
    rate: 0.5,
    appliesTo: "BOTH",
    accountCode: "2-1200",
    isActive: true,
    notes: "UU HKPD No. 1/2022.",
  },
  {
    code: "BPJS",
    name: "BPJS Kesehatan & Ketenagakerjaan",
    description:
      "Iuran jaminan sosial (bukan pajak, tapi potongan wajib dari gaji). Kesehatan: 5% (4% perusahaan + 1% pegawai). JHT: 5,7% (3,7% + 2%). JKK/JKM/Jaminan Pensiun tambahan.",
    category: "BPJS",
    rate: 5,
    appliesTo: "PAYROLL",
    accountCode: "2-1200",
    isActive: true,
    notes: "PP 49/2023. Komposisi dibedakan di modul payroll.",
  },
];