// Perhitungan baris item pembayaran ala Manager.io.
// Dipakai bersama oleh POST & PATCH /api/payments agar hasil jurnal selalu konsisten.

import type { TaxRule } from "@prisma/client";

export type PaymentLineInput = {
  itemId?: string | null;
  accountCode?: string | null;
  description?: string;
  quantity?: number | string;
  unit?: string;
  discount?: number | string;
  unitPrice?: number | string;
  taxCode?: string | null;
};

export type ComputedLine = {
  itemId: string | null;
  accountCode: string;
  description: string;
  quantity: number;
  unit: string;
  discount: number; // persen baris
  unitPrice: number;
  amount: number; // net baris (debit akun CoA)
  taxCode: string | null;
  taxRate: number;
  taxAmount: number;
};

export type ComputedTotals = {
  subtotal: number; // Σ kuantitas × harga
  discount: number; // Σ potongan (Rp)
  taxAmount: number; // Σ pajak (Rp)
  total: number; // subtotal − discount + taxAmount
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Cari aturan pajak; rate dari flat / bracket pertama (rate tunggal).
export function resolveTaxRate(rules: TaxRule[], code: string | null | undefined): number {
  if (!code) return 0;
  const rule = rules.find((r) => r.code === code);
  if (!rule) return 0;
  if (rule.brackets) {
    const first = JSON.parse(rule.brackets);
    if (typeof first === "string") return 0;
  }
  return rule.rate ?? 0;
}

export function resolveTaxAccount(rules: TaxRule[], code: string | null | undefined, fallback = "2-1200"): string {
  const rule = rules.find((r) => r.code === code);
  return rule?.accountCode || fallback;
}

export type ComputeOptions = {
  defaultAccountCode: string;
  amountExcludesTax: boolean; // true = tarif menambah total (harga belum termasuk PPN)
  fixedAmount?: boolean;
  fixedTotal?: number;
};

export function computePaymentLines(
  inputs: PaymentLineInput[],
  rules: TaxRule[],
  opts: ComputeOptions
): { lines: ComputedLine[]; totals: ComputedTotals } {
  const valid = inputs
    .filter((l) => (l.description ?? "").trim() !== "")
    .map((l) => {
      const qty = num(l.quantity);
      const price = num(l.unitPrice);
      const dct = Math.min(Math.max(num(l.discount), 0), 100);
      const taxRate = resolveTaxRate(rules, l.taxCode);

      const gross = qty * price;
      const discAmount = gross * (dct / 100);

      // amountExcludesTax=true (default): harga belum termasuk pajak → pajak di atas net.
      // false: harga sudah termasuk pajak → pisahkan pajak dari harga.
      let net: number;
      let tax: number;
      if (taxRate > 0 && !opts.amountExcludesTax) {
        const full = gross - discAmount;
        net = full / (1 + taxRate / 100);
        tax = full - net;
      } else {
        net = gross - discAmount;
        tax = net * (taxRate / 100);
      }

      return {
        itemId: l.itemId || null,
        accountCode: (l.accountCode ?? "").trim() || opts.defaultAccountCode,
        description: (l.description ?? "").trim(),
        quantity: qty,
        unit: (l.unit ?? "").trim() || "pcs",
        discount: dct,
        unitPrice: price,
        amount: round2(net),
        taxCode: l.taxCode || null,
        taxRate,
        taxAmount: round2(tax),
      };
    })
    .filter((l) => l.quantity > 0);

  let subtotal = round2(valid.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  let discount = round2(valid.reduce((s, l) => s + l.quantity * l.unitPrice * (l.discount / 100), 0));
  let taxAmount = round2(valid.reduce((s, l) => s + l.taxAmount, 0));
  // Total selalu = kontribusi tiap baris (net + pajak). Pada mode "jumlah belum
  // termasuk PPN", net = harga − diskon sehingga hasilnya sama dengan
  // subtotal − diskon + pajak. Pada mode "termasuk PPN", net sudah memisahkan
  // pajak dari harga sehingga menjumlahkan pajak di atas subtotal keliru.
  let total = round2(valid.reduce((s, l) => s + l.amount + l.taxAmount, 0));

  if (valid.length > 0 && opts.fixedAmount) {
    const fixed = round2(num(opts.fixedTotal));
    if (fixed > 0 && total > 0) {
      const scale = fixed / total;
      for (const l of valid) {
        l.amount = round2(l.amount * scale);
        l.taxAmount = round2(l.taxAmount * scale);
      }
      subtotal = round2(subtotal * scale);
      discount = round2(discount * scale);
      taxAmount = round2(valid.reduce((s, l) => s + l.taxAmount, 0));
      total = fixed;
    } else {
      total = round2(valid.reduce((s, l) => s + l.amount + l.taxAmount, 0));
    }
  }

  return { lines: valid, totals: { subtotal, discount, taxAmount, total } };
}