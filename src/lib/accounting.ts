// Konstanta & helper akuntansi berdasarkan kaidah akuntansi yang benar.

export const ACCOUNT_TYPES = {
  ASSET: "ASSET",
  LIABILITY: "LIABILITY",
  EQUITY: "EQUITY",
  REVENUE: "REVENUE",
  EXPENSE: "EXPENSE",
} as const;

export type AccountType = keyof typeof ACCOUNT_TYPES;

// Normal balance tiap tipe akun.
// ASSET & EXPENSE -> normal DEBIT (saldo bertambah di sisi debit)
// LIABILITY, EQUITY, REVENUE -> normal CREDIT (saldo bertambah di sisi kredit)
export const NORMAL_BALANCE: Record<AccountType, "DEBIT" | "CREDIT"> = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  REVENUE: "CREDIT",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Aset",
  LIABILITY: "Kewajiban",
  EQUITY: "Ekuitas",
  REVENUE: "Pendapatan",
  EXPENSE: "Beban",
};

// Warna untuk tipe akun di UI
export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  ASSET: "emerald",
  LIABILITY: "rose",
  EQUITY: "violet",
  REVENUE: "sky",
  EXPENSE: "amber",
};

export function formatCurrency(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(abs);
  return `${negative ? "(" : ""}Rp ${formatted}${negative ? ")" : ""}`;
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Saldo akun berdasarkan tipe & normal balance.
// Untuk akun bersaldo normal DEBIT: saldo = debit - credit
// Untuk akun bersaldo normal CREDIT: saldo = credit - debit
export function computeBalance(
  type: AccountType,
  debit: number,
  credit: number
): number {
  return NORMAL_BALANCE[type] === "DEBIT" ? debit - credit : credit - debit;
}

// Hitung retained earnings (laba ditahan) = total revenue - total expense
export function computeNetIncome(
  revenueBalance: number,
  expenseBalance: number
): number {
  return revenueBalance - expenseBalance;
}
