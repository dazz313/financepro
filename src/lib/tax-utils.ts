// Utilitas perhitungan pajak (tarif progresif & flat)

export type TaxBracket = [number, number | null, number];

/** Parse string brackets JSON ([[min, max|null, %], ...]) menjadi array. */
export function parseBrackets(raw: string | null | undefined): TaxBracket[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is TaxBracket =>
        Array.isArray(b) &&
        b.length === 3 &&
        typeof b[0] === "number" &&
        (b[1] === null || typeof b[1] === "number") &&
        typeof b[2] === "number"
    );
  } catch {
    return [];
  }
}

export function bracketsToJson(brackets: TaxBracket[]): string | null {
  if (!brackets || brackets.length === 0) return null;
  return JSON.stringify(brackets);
}

/**
 * Hitung pajak dengan tarif progresif.
 * Example: taxable income 80jt → (60jt*5%) + (20jt*15%) = 3jt + 3jt = 6jt.
 */
export function computeProgressive(income: number, brackets: TaxBracket[]): number {
  if (income <= 0 || brackets.length === 0) return 0;
  let tax = 0;
  for (const [min, max, rate] of brackets) {
    const upper = max === null ? Infinity : max;
    if (income <= min) continue;
    const taxableInBand = Math.min(income, upper) - min;
    if (taxableInBand <= 0) continue;
    tax += taxableInBand * (rate / 100);
    if (income <= upper) break;
  }
  return tax;
}

/**
 * Hitung PPh 21 bulanan (metode sederhana berbasis tarif progresif tahunan).
 * Penghasilan neto setahun = gross bulanan x 12, dikurangi PTKP standar.
 * PTKP (menikah, 2 tanggungan, UU HPP 2024): Rp 58.500.000/tahun.
 */
export const PTKP_STANDARD = 58500000;

export function computePph21Monthly(
  grossMonthly: number,
  brackets: TaxBracket[],
  ptkp: number = PTKP_STANDARD
): number {
  if (grossMonthly <= 0) return 0;
  const annual = grossMonthly * 12;
  const netAnnual = Math.max(0, annual - ptkp);
  const annualTax = computeProgressive(netAnnual, brackets);
  return annualTax / 12;
}

/** Hitung pajak flat: amount * rate/100. */
export function computeFlat(amount: number, rate: number): number {
  if (amount <= 0 || rate <= 0) return 0;
  return (amount * rate) / 100;
}

/** Label pendek untuk kategori pajak (untuk badge/tooltip). */
export const TAX_CATEGORY_LABEL: Record<string, string> = {
  PPN: "PPN",
  PPH21: "PPh 21",
  PPH23: "PPh 23",
  PPH42: "PPh 4(2)",
  PPH22: "PPh 22",
  PPH26: "PPh 26",
  UMKM: "Final UMKM",
  PPHBADAN: "PPh Badan",
  PBB: "PBB",
  BPJS: "BPJS",
  OTHER: "Lainnya",
};

export const TAX_CATEGORIES = [
  "PPH21",
  "PPH23",
  "PPH42",
  "PPH22",
  "PPH26",
  "UMKM",
  "PPN",
  "PPHBADAN",
  "PBB",
  "BPJS",
  "OTHER",
];

export const TAX_APPLIES_LABEL: Record<string, string> = {
  SALES: "Penjualan",
  PURCHASE: "Pembelian",
  PAYROLL: "Gaji",
  BOTH: "Semua",
};