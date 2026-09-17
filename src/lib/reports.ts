// Library perhitungan laporan keuangan berdasarkan data jurnal.
// Mengikuti prinsip akuntansi: Aset = Kewajiban + Ekuitas.

import { db } from "@/lib/db";
import { computeBalance, type AccountType } from "@/lib/accounting";

export type AccountWithBalance = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  isGroup: boolean;
  parentCode: string | null;
  totalDebit: number;
  totalCredit: number;
  balance: number; // saldo normal (positif)
};

// Ambil semua akun + total debit/kredit sampai tanggal tertentu (atau seluruhnya)
export async function getAccountBalances(untilDate?: Date) {
  const accounts = await db.account.findMany({
    orderBy: { code: "asc" },
    include: {
      lines: {
        where: {
          entry: {
            isReversed: false,
            ...(untilDate ? { date: { lte: untilDate } } : {}),
          },
        },
        select: { debit: true, credit: true },
      },
    },
  });

  return accounts.map((acc) => {
    const totalDebit = acc.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = acc.lines.reduce((s, l) => s + (l.credit || 0), 0);
    const balance = computeBalance(acc.type as AccountType, totalDebit, totalCredit);
    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type as AccountType,
      subtype: acc.subtype,
      isGroup: acc.isGroup,
      parentCode: acc.parentCode,
      totalDebit,
      totalCredit,
      balance,
    } as AccountWithBalance;
  });
}

// ============ NERACA SALDO (Trial Balance) ============
export function buildTrialBalance(accounts: AccountWithBalance[]) {
  const detail = accounts.filter((a) => !a.isGroup);
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = detail.map((a) => {
    // Neraca saldo menggunakan posisi debit/kredit AKTUAL (bukan saldo normal),
    // sehingga akun kontra (mis. Akumulasi Penyusutan) tetap menempati kolom
    // yang benar dan total debit selalu sama dengan total kredit.
    const net = a.totalDebit - a.totalCredit;
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    totalDebit += debit;
    totalCredit += credit;
    return {
      ...a,
      debit,
      credit,
    };
  });
  return { rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

// ============ LAPORAN LABA RUGI (Income Statement) ============
export function buildIncomeStatement(accounts: AccountWithBalance[]) {
  const revenues = accounts.filter((a) => a.type === "REVENUE" && !a.isGroup);
  const expenses = accounts.filter((a) => a.type === "EXPENSE" && !a.isGroup);

  const totalRevenue = revenues.reduce((s, a) => s + a.balance, 0);
  const totalExpense = expenses.reduce((s, a) => s + a.balance, 0);
  const netIncome = totalRevenue - totalExpense;

  // Kelompokkan pendapatan & beban berdasarkan subtype
  const groupBy = (list: AccountWithBalance[]) => {
    const map = new Map<string, { subtype: string; accounts: AccountWithBalance[]; total: number }>();
    for (const a of list) {
      const key = a.subtype ?? "Lainnya";
      if (!map.has(key)) map.set(key, { subtype: key, accounts: [], total: 0 });
      const g = map.get(key)!;
      g.accounts.push(a);
      g.total += a.balance;
    }
    return Array.from(map.values());
  };

  return {
    revenueGroups: groupBy(revenues),
    expenseGroups: groupBy(expenses),
    totalRevenue,
    totalExpense,
    netIncome,
  };
}

// ============ NERACA (Balance Sheet) ============
// Aset = Kewajiban + Ekuitas (termasuk laba ditahan / laba tahun berjalan)
export function buildBalanceSheet(accounts: AccountWithBalance[]) {
  const assets = accounts.filter((a) => a.type === "ASSET" && !a.isGroup);
  const liabilities = accounts.filter((a) => a.type === "LIABILITY" && !a.isGroup);
  const equities = accounts.filter((a) => a.type === "EQUITY" && !a.isGroup);

  // Hitung laba tahun berjalan untuk ditambahkan ke ekuitas
  const revenues = accounts.filter((a) => a.type === "REVENUE" && !a.isGroup);
  const expenses = accounts.filter((a) => a.type === "EXPENSE" && !a.isGroup);
  const totalRevenue = revenues.reduce((s, a) => s + a.balance, 0);
  const totalExpense = expenses.reduce((s, a) => s + a.balance, 0);
  const currentYearIncome = totalRevenue - totalExpense;

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equities.reduce((s, a) => s + a.balance, 0) + currentYearIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  // Kelompokkan aset lancar vs tetap, kewajiban jangka pendek vs panjang.
  // Setiap akun non-grup PASTI masuk salah satu kelompok (fallback = lancar/
  // jangka pendek) agar total kelompok selalu konsisten dengan totalAset.
  const groupAssets = () => {
    const fixedTypes = ["Fixed Asset", "Equipment", "Vehicle", "Building", "Contra Asset"];
    const fixed = assets.filter((a) => fixedTypes.includes(a.subtype ?? ""));
    const current = assets.filter((a) => !fixedTypes.includes(a.subtype ?? ""));
    return {
      current: { accounts: current, total: current.reduce((s, a) => s + a.balance, 0) },
      fixed: { accounts: fixed, total: fixed.reduce((s, a) => s + a.balance, 0) },
    };
  };

  const groupLiabilities = () => {
    const longTermTypes = ["Long Term Liability", "Long Term Loan"];
    const longTerm = liabilities.filter((a) => longTermTypes.includes(a.subtype ?? ""));
    const current = liabilities.filter((a) => !longTermTypes.includes(a.subtype ?? ""));
    return {
      current: { accounts: current, total: current.reduce((s, a) => s + a.balance, 0) },
      longTerm: { accounts: longTerm, total: longTerm.reduce((s, a) => s + a.balance, 0) },
    };
  };

  return {
    assets: groupAssets(),
    liabilities: groupLiabilities(),
    equities: { accounts: equities, total: equities.reduce((s, a) => s + a.balance, 0) },
    currentYearIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
  };
}

// ============ ARUS KAS (Cash Flow Statement) ============
// Diklasifikasikan ke Aktivitas Operasi, Investasi, dan Pendanaan berdasarkan
// akun lawan (sisi non-kas) dari setiap jurnal yang menyentuh kas/bank.
export async function buildCashFlow(fromDate?: Date, toDate?: Date) {
  const emptyGroup = () => ({ inflow: 0, outflow: 0, net: 0, lines: [] as CashFlowLine[] });
  const result: { operating: ReturnType<typeof emptyGroup>; investing: ReturnType<typeof emptyGroup>; financing: ReturnType<typeof emptyGroup>; lines: CashFlowLine[] } = {
    operating: emptyGroup(),
    investing: emptyGroup(),
    financing: emptyGroup(),
    lines: [],
  };

  // Akun kas & bank
  const cashAccounts = await db.account.findMany({
    where: { OR: [{ subtype: "Cash" }, { subtype: "Bank" }] },
  });
  if (cashAccounts.length === 0) {
    return { ...result, totalInflow: 0, totalOutflow: 0, netCashFlow: 0 };
  }
  const cashIds = new Set(cashAccounts.map((a) => a.id));

  const entries = await db.journalEntry.findMany({
    where: {
      AND: [
        fromDate ? { date: { gte: fromDate } } : {},
        toDate ? { date: { lte: toDate } } : {},
        { isReversed: false },
        { lines: { some: { accountId: { in: cashAccounts.map((a) => a.id) } } } },
      ],
    },
    include: {
      lines: { include: { account: true } },
    },
    orderBy: { date: "asc" },
  });

  // Klasifikasi aktivitas berdasarkan sumber & akun lawan (non-kas).
  const classify = (entry: { source: string; lines: { account: { id: string; type: string; subtype: string | null } }[] }): CashFlowCategory => {
    if (entry.source === "FIXED_ASSET" || entry.source === "FIXED_ASSET_DISPOSAL") return "investing";
    if (entry.source === "OPENING") return "financing"; // setoran modal/saldo awal pemilik
    for (const l of entry.lines) {
      if (cashIds.has(l.account.id)) continue;
      const acc = l.account;
      if (acc.type === "EQUITY") return "financing"; // modal & prive
      if (acc.type === "LIABILITY") {
        const isLoan = ["Short Term Loan", "Long Term Loan", "Long Term Liability"].includes(acc.subtype ?? "");
        // Peminjaman = pendanaan; hutang dagang/pajak/akrual = operasi
        return isLoan ? "financing" : "operating";
      }
      if (acc.type === "ASSET") {
        // Investasi modal berupa perolehan aset tetap (dan akumulasi penyusutannya)
        if (["Fixed Asset", "Equipment", "Vehicle", "Building", "Contra Asset"].includes(acc.subtype ?? "")) return "investing";
        return "operating"; // piutang, persediaan, uang muka = modal kerja
      }
      return "operating"; // pendapatan & beban
    }
    // Transfer antar rekening kas (net nol) digolongkan sebagai operasi
    return "operating";
  };

  for (const entry of entries) {
    const cls = classify(entry);
    const group = result[cls];
    for (const l of entry.lines) {
      if (!cashIds.has(l.accountId)) continue;
      const inflow = l.debit || 0;
      const outflow = l.credit || 0;
      const line: CashFlowLine = {
        date: entry.date.toISOString(),
        description: entry.description,
        source: entry.source,
        accountCode: l.account.code,
        accountName: l.account.name,
        inflow,
        outflow,
        classification: cls,
      };
      group.inflow += inflow;
      group.outflow += outflow;
      result.lines.push(line);
    }
  }
  for (const key of ["operating", "investing", "financing"] as const) {
    result[key].net = result[key].inflow - result[key].outflow;
  }
  result.lines = result.lines.filter((l) => l.inflow > 0 || l.outflow > 0).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalInflow = result.operating.inflow + result.investing.inflow + result.financing.inflow;
  const totalOutflow = result.operating.outflow + result.investing.outflow + result.financing.outflow;

  return { ...result, totalInflow, totalOutflow, netCashFlow: totalInflow - totalOutflow };
}

export type CashFlowCategory = "operating" | "investing" | "financing";

export type CashFlowLine = {
  date: string;
  description: string;
  source: string;
  accountCode: string;
  accountName: string;
  inflow: number;
  outflow: number;
  classification: CashFlowCategory;
};

// ============ DASHBOARD KPIs ============
// Optimized: lakukan 1 query untuk semua journal lines, lalu hitung saldo
// bulanan in-memory (sebelumnya 6x query getAccountBalances — sangat lambat).
export async function buildDashboardKPIs() {
  // Ambil semua akun + SEMUA journal lines dalam 1 query (akan difilter in-memory)
  const accounts = await getAccountBalances();
  const balanceSheet = buildBalanceSheet(accounts);
  const income = buildIncomeStatement(accounts);

  // Kas & bank total
  const cashAccounts = accounts.filter((a) => ["Cash", "Bank"].includes(a.subtype ?? ""));
  const totalCash = cashAccounts.reduce((s, a) => s + a.balance, 0);

  // Piutang & Hutang
  const totalReceivable = accounts
    .filter((a) => a.subtype === "Account Receivable")
    .reduce((s, a) => s + a.balance, 0);
  const totalPayable = accounts
    .filter((a) => a.subtype === "Account Payable")
    .reduce((s, a) => s + a.balance, 0);

  // Trend bulanan (6 bulan terakhir): 1 query untuk semua lines + filter in-memory
  // (jauh lebih cepat daripada 6x query getAccountBalances)
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);

  const revenueAccounts = accounts.filter((a) => a.type === "REVENUE" && !a.isGroup);
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE" && !a.isGroup);
  const revIds = new Set(revenueAccounts.map((a) => a.id));
  const expIds = new Set(expenseAccounts.map((a) => a.id));

  // 1 query: ambil semua journal lines Revenue/Expense dalam 6 bulan terakhir
  const trendLines = await db.journalLine.findMany({
    where: {
      AND: [
        { entry: { date: { gte: sixMonthsAgo }, isReversed: false } },
        { OR: [{ accountId: { in: [...revIds] } }, { accountId: { in: [...expIds] } }] },
      ],
    },
    select: { debit: true, credit: true, accountId: true, entry: { select: { date: true } } },
  });

  // Bangun range tiap bulan lalu akumulasi lines yang jatuh di bulan tsb
  const months: { label: string; revenue: number; expense: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    let revenue = 0;
    let expense = 0;
    for (const l of trendLines) {
      const d = new Date(l.entry.date);
      if (d >= start && d <= end) {
        if (revIds.has(l.accountId)) {
          revenue += l.credit - l.debit; // revenue: saldo normal credit
        } else if (expIds.has(l.accountId)) {
          expense += l.debit - l.credit; // expense: saldo normal debit
        }
      }
    }
    months.push({
      label: start.toLocaleDateString("id-ID", { month: "short" }),
      revenue,
      expense,
    });
  }

  // Komposisi beban (untuk pie chart)
  const expenseBreakdown = accounts
    .filter((a) => a.type === "EXPENSE" && !a.isGroup && a.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 6)
    .map((a) => ({ name: a.name, value: a.balance, code: a.code }));

  // Transaksi terbaru
  const recentEntries = await db.journalEntry.findMany({
    take: 8,
    orderBy: { date: "desc" },
    where: { isReversed: false },
    include: { lines: { include: { account: true } } },
  });
  const recentTransactions = recentEntries.map((e) => {
    const debitLine = e.lines.find((l) => l.debit > 0);
    return {
      id: e.id,
      entryNumber: e.entryNumber,
      date: e.date,
      description: e.description,
      source: e.source,
      amount: e.lines.reduce((s, l) => s + l.debit, 0),
      accountName: debitLine?.account.name ?? "",
    };
  });

  // Piutang & hutang jatuh tempo / segera jatuh tempo (7 hari ke depan)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonLimit = new Date(today);
  soonLimit.setDate(soonLimit.getDate() + 7);

  const dueInvoices = await db.invoice.findMany({
    where: {
      documentType: { in: ["INVOICE", "ORDER"] },
      status: { notIn: ["PAID", "CANCELLED"] },
      dueDate: { not: null },
    },
    select: {
      id: true,
      number: true,
      type: true,
      total: true,
      paidAmount: true,
      dueDate: true,
      contact: { select: { name: true } },
    },
  });

  const dueItems = dueInvoices.map((inv) => {
    const balance = Math.max(0, Math.round((Number(inv.total) - Number(inv.paidAmount)) * 100) / 100);
    const due = new Date(inv.dueDate!);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - due.getTime()) / 86400000); // >0 = sudah lewat
    return {
      id: inv.id,
      number: inv.number,
      type: inv.type,
      contactName: inv.contact?.name ?? "",
      dueDate: inv.dueDate,
      balance,
      overdue: diffDays > 0,
      days: Math.abs(diffDays),
    };
  }).filter((d) => d.balance > 0.005);

  const sortByDue = (a: { overdue: boolean; days: number }, b: { overdue: boolean; days: number }) =>
    Number(b.overdue) - Number(a.overdue) || a.days - b.days;

  const overdueReceivables = dueItems.filter((d) => d.type === "SALES" && d.overdue).sort(sortByDue);
  const dueSoonReceivables = dueItems
    .filter((d) => d.type === "SALES" && !d.overdue && d.dueDate && new Date(d.dueDate) <= soonLimit)
    .sort(sortByDue);
  const overduePayables = dueItems.filter((d) => d.type === "PURCHASE" && d.overdue).sort(sortByDue);
  const dueSoonPayables = dueItems
    .filter((d) => d.type === "PURCHASE" && !d.overdue && d.dueDate && new Date(d.dueDate) <= soonLimit)
    .sort(sortByDue);

  return {
    totalCash,
    totalReceivable,
    totalPayable,
    totalAssets: balanceSheet.totalAssets,
    totalLiabilities: balanceSheet.totalLiabilities,
    totalEquity: balanceSheet.totalEquity,
    totalRevenue: income.totalRevenue,
    totalExpense: income.totalExpense,
    netIncome: income.netIncome,
    profitMargin: income.totalRevenue > 0 ? (income.netIncome / income.totalRevenue) * 100 : 0,
    currentRatio:
      balanceSheet.liabilities.current.total > 0
        ? balanceSheet.assets.current.total / balanceSheet.liabilities.current.total
        : 0,
    months,
    expenseBreakdown,
    recentTransactions,
    overdueReceivables,
    dueSoonReceivables,
    overduePayables,
    dueSoonPayables,
  };
}
