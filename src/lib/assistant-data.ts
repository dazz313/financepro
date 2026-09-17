import { db } from "@/lib/db";

const fmt = (v: number) => "Rp " + v.toLocaleString("id-ID");

export async function buildAppDataContext(): Promise<string> {
  const sections: string[] = [];
  const now = new Date();

  const [settings, accounts, invoices, items, bankAccounts, recentEntries, employees, quoteCount, orderCount, bankLines] = await Promise.all([
    db.companySettings.findUnique({ where: { id: "default" } }).catch(() => null),
    db.account.findMany({ where: { isGroup: false }, select: { code: true, type: true, subtype: true, lines: { select: { debit: true, credit: true } } } }),
    db.invoice.findMany({ where: { documentType: "INVOICE", status: { in: ["SENT", "OVERDUE"] } }, select: { number: true, total: true, paidAmount: true, dueDate: true, contact: { select: { name: true } } } }),
    db.inventoryItem.findMany({ where: { isActive: true }, select: { code: true, name: true, unit: true, quantityOnHand: true, reorderLevel: true, purchasePrice: true } }),
    db.bankAccount.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, type: true, accountCode: true } }),
    db.journalEntry.findMany({ take: 5, orderBy: { date: "desc" }, select: { entryNumber: true, date: true, description: true, lines: { select: { debit: true, account: { select: { name: true } } } } } }),
    db.employee.findMany({ where: { status: "ACTIVE" }, select: { basicSalary: true, allowance: true } }),
    db.invoice.count({ where: { documentType: "QUOTE" } }),
    db.invoice.count({ where: { documentType: "ORDER" } }),
    db.journalLine.findMany({ where: { bankAccountId: { not: null } }, select: { bankAccountId: true, debit: true, credit: true } }),
  ]);

  if (settings) {
    sections.push(`[PERUSAHAAN] ${settings.name} | NPWP: ${settings.taxId ?? "-"} | Mata Uang: ${settings.currencyCode} | PPN: ${settings.defaultTaxRate}%`);
  }

  const sumByType = (type: string) => {
    const accs = accounts.filter(a => a.type === type);
    const d = accs.reduce((s, a) => s + a.lines.reduce((x, l) => x + l.debit, 0), 0);
    const c = accs.reduce((s, a) => s + a.lines.reduce((x, l) => x + l.credit, 0), 0);
    return type === "ASSET" || type === "EXPENSE" ? d - c : c - d;
  };

  const asset = sumByType("ASSET");
  const liability = sumByType("LIABILITY");
  const equity = sumByType("EQUITY");
  const revenue = sumByType("REVENUE");
  const expense = sumByType("EXPENSE");
  const netIncome = revenue - expense;

  const cash = accounts.filter(a => a.subtype === "Cash" || a.subtype === "Bank").reduce((s, a) => s + a.lines.reduce((x, l) => x + l.debit - l.credit, 0), 0);
  const receivable = accounts.filter(a => a.subtype === "Account Receivable").reduce((s, a) => s + a.lines.reduce((x, l) => x + l.debit - l.credit, 0), 0);
  const payable = accounts.filter(a => a.subtype === "Account Payable").reduce((s, a) => s + a.lines.reduce((x, l) => x + l.credit - l.debit, 0), 0);

  sections.push(`[KEUANGAN] Kas: ${fmt(cash)} | Piutang: ${fmt(receivable)} | Hutang: ${fmt(payable)} | Aset: ${fmt(asset)} | Ekuitas: ${fmt(equity)} | Pendapatan: ${fmt(revenue)} | Beban: ${fmt(expense)} | Laba: ${fmt(netIncome)} (${revenue > 0 ? ((netIncome / revenue) * 100).toFixed(1) : 0}%) | Rasio Lancar: ${liability > 0 ? (asset / liability).toFixed(2) : "N/A"}`);

  const outstanding = invoices.filter(i => i.total - i.paidAmount > 0.01);
  const overdue = outstanding.filter(i => i.dueDate && new Date(i.dueDate) < now);
  if (outstanding.length > 0) {
    const totOut = outstanding.reduce((s, i) => s + (i.total - i.paidAmount), 0);
    const totOvd = overdue.reduce((s, i) => s + (i.total - i.paidAmount), 0);
    sections.push(`[PIUTANG] ${outstanding.length} faktur outstanding: ${fmt(totOut)} | ${overdue.length} overdue: ${fmt(totOvd)}${overdue.slice(0, 3).map(i => `\n  ${i.number} ${i.contact.name} ${fmt(i.total - i.paidAmount)} jth ${i.dueDate ? new Date(i.dueDate).toLocaleDateString("id-ID") : "-"}`).join("")}`);
  }

  const lowStock = items.filter(i => i.reorderLevel > 0 && i.quantityOnHand <= i.reorderLevel && i.quantityOnHand > 0);
  const outOfStock = items.filter(i => i.quantityOnHand <= 0);
  if (items.length > 0) {
    const stockVal = items.reduce((s, i) => s + i.quantityOnHand * i.purchasePrice, 0);
    sections.push(`[STOK] ${items.length} item | Nilai: ${fmt(stockVal)} | Habis: ${outOfStock.length} | Menipis: ${lowStock.length}${lowStock.slice(0, 3).map(i => `\n  ${i.code} ${i.name}: ${i.quantityOnHand} ${i.unit} (min: ${i.reorderLevel})`).join("")}`);
  }

  if (bankAccounts.length > 0) {
    const bankBalance = new Map<string, number>();
    for (const l of bankLines) {
      const cur = bankBalance.get(l.bankAccountId!) ?? 0;
      bankBalance.set(l.bankAccountId!, cur + (l.debit - l.credit));
    }
    const bankLinesTxt = bankAccounts.map(b => {
      const bal = bankBalance.get(b.id) ?? 0;
      return `${b.code} ${b.name}: ${fmt(bal)}`;
    });
    sections.push(`[BANK]\n${bankLinesTxt.join("\n")}`);
  }

  if (recentEntries.length > 0) {
    sections.push(`[TRANSAKSI] ${recentEntries.map(e => `${e.entryNumber} ${new Date(e.date).toLocaleDateString("id-ID")} ${e.description} ${fmt(e.lines.reduce((s, l) => s + l.debit, 0))}`).join("\n")}`);
  }

  if (employees.length > 0) {
    const payroll = employees.reduce((s, e) => s + e.basicSalary + e.allowance, 0);
    sections.push(`[KARYAWAN] ${employees.length} aktif | Gaji/bulan: ${fmt(payroll)}`);
  }

  if (quoteCount + orderCount > 0) {
    sections.push(`[DOKUMEN] Penawaran: ${quoteCount} | Pesanan: ${orderCount}`);
  }

  return "\n\n" + sections.join("\n\n");
}

let _actionCache: { items: string[]; ts: number } | null = null;
const ACTION_CACHE_TTL = 30_000;

export async function buildActionItems(): Promise<string[]> {
  if (_actionCache && Date.now() - _actionCache.ts < ACTION_CACHE_TTL) {
    return _actionCache.items;
  }

  const items: string[] = [];
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const [overdueInvoices, lowStockItems, allItems, outstandingInvoices, quoteCount, employees, paidThisMonth] = await Promise.all([
    db.invoice.findMany({ where: { documentType: "INVOICE", status: "SENT", dueDate: { lt: now }, total: { gt: 0 } }, select: { number: true, total: true, paidAmount: true, contact: { select: { name: true } } } }),
    db.inventoryItem.findMany({ where: { isActive: true, quantityOnHand: { lte: 0 } }, select: { code: true, name: true } }),
    db.inventoryItem.findMany({ where: { isActive: true, reorderLevel: { gt: 0 } }, select: { code: true, name: true, quantityOnHand: true, reorderLevel: true, unit: true } }),
    db.invoice.findMany({ where: { documentType: "INVOICE", status: "SENT", dueDate: { gte: now } }, select: { total: true, paidAmount: true } }),
    db.invoice.count({ where: { documentType: "QUOTE" } }),
    db.employee.findMany({ where: { status: "ACTIVE" }, select: { basicSalary: true, allowance: true } }),
    db.payrollEntry.count({ where: { payPeriod: { gte: new Date(thisYear, thisMonth, 1), lt: new Date(thisYear, thisMonth + 1, 1) } } }),
  ]);

  const realOverdue = overdueInvoices.filter(i => i.total - i.paidAmount > 0.01);
  if (realOverdue.length > 0) {
    const total = realOverdue.reduce((s, i) => s + (i.total - i.paidAmount), 0);
    items.push(`🔴 [URGENT] ${realOverdue.length} faktur JATUH TEMPO — total ${fmt(total)}. Kirim reminder atau catat penerimaan.`);
  }

  if (lowStockItems.length > 0) {
    items.push(`🟠 ${lowStockItems.length} item STOK HABIS. Buat faktur pembelian untuk restock.`);
  }

  const nearLow = allItems.filter(i => i.quantityOnHand > 0 && i.quantityOnHand <= i.reorderLevel);
  if (nearLow.length > 0) {
    items.push(`🟡 ${nearLow.length} item stok menipis: ${nearLow.slice(0, 3).map(i => `${i.name} (${i.quantityOnHand} ${i.unit})`).join(", ")}${nearLow.length > 3 ? "..." : ""}`);
  }

  const realOut = outstandingInvoices.filter(i => i.total - i.paidAmount > 0.01);
  if (realOut.length > 0) {
    const total = realOut.reduce((s, i) => s + (i.total - i.paidAmount), 0);
    items.push(`🔵 ${realOut.length} faktur outstanding ${fmt(total)}. Pantau & follow up pelanggan.`);
  }

  if (quoteCount > 0) {
    items.push(`📋 ${quoteCount} penawaran belum dikonversi. Follow up atau "Salin ke" di menu Faktur.`);
  }

  if (employees.length > 0 && paidThisMonth < employees.length) {
    const total = employees.reduce((s, e) => s + e.basicSalary + e.allowance, 0);
    items.push(`💰 Payroll ${paidThisMonth}/${employees.length} bulan ini. Total: ${fmt(total)}.`);
  }

  _actionCache = { items, ts: Date.now() };
  return items;
}
