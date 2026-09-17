/* Backfill: tautkan baris jurnal lama ke rekening kas/bank (JournalLine.bankAccountId).
 * Dijalankan sekali setelah migrasi schema (db push). Idempotent terhadap
 * atribusi yang sudah ada (tidak menimpa bankAccountId yang terisi).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const banks = await prisma.bankAccount.findMany();
  const bankByCode = new Map(banks.map((b) => [b.code, b]));
  const bankIdByCode = new Map(banks.map((b) => [b.accountCode, b]));
  const codeToBanks = new Map();
  for (const b of banks) {
    if (!codeToBanks.has(b.accountCode)) codeToBanks.set(b.accountCode, []);
    codeToBanks.get(b.accountCode).push(b);
  }

  // id entry -> { lines: [{id, accountCode, debit, credit, bankAccountId}] }
  const entryLines = new Map();
  async function loadEntries(ids) {
    const unique = [...new Set(ids.filter((x) => x))];
    if (unique.length === 0) return;
    const entries = await prisma.journalEntry.findMany({
      where: { id: { in: unique } },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    for (const e of entries) {
      entryLines.set(e.id, {
        source: e.source,
        reference: e.reference,
        lines: e.lines.map((l) => ({
          id: l.id,
          accountCode: l.account.code,
          debit: l.debit,
          credit: l.credit,
          bankAccountId: l.bankAccountId,
        })),
      });
    }
  }

  const attribution = new Map(); // lineId -> bankId
  const mark = (line, bank) => {
    if (line && bank && !line.bankAccountId) attribution.set(line.id, bank.id);
  };

  // 1. Jurnal saldo awal (source OPENING, reference "OPEN-<bankCode>")
  const openings = await prisma.journalEntry.findMany({
    where: { source: "OPENING" },
    select: { id: true, reference: true },
  });
  for (const e of openings) {
    const bank = bankByCode.get(e.reference && e.reference.replace(/^OPEN-/, ""));
    if (bank) entryLines.set(e.id, { source: "OPENING", reference: e.reference, lines: await lineOf(e.id) });
  }

  async function lineOf(entryId) {
    const ls = await prisma.journalLine.findMany({
      where: { entryId },
      include: { account: { select: { code: true } } },
    });
    return ls.map((l) => ({
      id: l.id,
      accountCode: l.account.code,
      debit: l.debit,
      credit: l.credit,
      bankAccountId: l.bankAccountId,
    }));
  }

  for (const e of openings) {
    const bank = bankByCode.get(e.reference && e.reference.replace(/^OPEN-/, ""));
    if (!bank) continue;
    const rec = entryLines.get(e.id);
    if (!rec) continue;
    for (const l of rec.lines) if (l.debit > 0 && l.accountCode === bank.accountCode) mark(l, bank);
  }

  // 2. Penerimaan (Receipt) — baris debit di akun bank
  const receipts = await prisma.receipt.findMany({
    where: { journalEntryId: { not: null } },
    select: { journalEntryId: true, bankAccountId: true },
  });
  await loadEntries(receipts.map((r) => r.journalEntryId));
  for (const r of receipts) {
    const rec = entryLines.get(r.journalEntryId);
    const bank = r.bankAccountId && (await prisma.bankAccount.findUnique({ where: { id: r.bankAccountId } }));
    if (!rec || !bank) continue;
    for (const l of rec.lines) if (l.debit > 0 && l.accountCode === bank.accountCode) mark(l, bank);
  }

  // 3. Pembayaran (Payment) — baris kredit di akun bank
  const payments = await prisma.payment.findMany({
    where: { journalEntryId: { not: null } },
    select: { journalEntryId: true, bankAccountId: true },
  });
  await loadEntries(payments.map((p) => p.journalEntryId));
  for (const p of payments) {
    const rec = entryLines.get(p.journalEntryId);
    const bank = p.bankAccountId && (await prisma.bankAccount.findUnique({ where: { id: p.bankAccountId } }));
    if (!rec || !bank) continue;
    for (const l of rec.lines) if (l.credit > 0 && l.accountCode === bank.accountCode) mark(l, bank);
  }

  // 4. Transfer — debit ke tujuan, kredit dari sumber
  const transfers = await prisma.transfer.findMany({
    where: { journalEntryId: { not: null } },
    select: { journalEntryId: true, toBankAccountId: true, fromBankAccountId: true },
  });
  await loadEntries(transfers.map((t) => t.journalEntryId));
  for (const t of transfers) {
    const rec = entryLines.get(t.journalEntryId);
    const toBank = await prisma.bankAccount.findUnique({ where: { id: t.toBankAccountId } });
    const fromBank = await prisma.bankAccount.findUnique({ where: { id: t.fromBankAccountId } });
    if (!rec) continue;
    for (const l of rec.lines) {
      if (l.debit > 0 && l.accountCode === toBank.accountCode) mark(l, toBank);
      if (l.credit > 0 && l.accountCode === fromBank.accountCode) mark(l, fromBank);
    }
  }

  // 5. Payroll (per akun bank pegawai) — baris kredit di akun bank
  const payrolls = await prisma.payrollEntry.findMany({
    where: { journalEntryId: { not: null } },
    select: { journalEntryId: true, employee: { select: { bankAccountId: true } } },
  });
  await loadEntries(payrolls.map((p) => p.journalEntryId));
  for (const p of payrolls) {
    const rec = entryLines.get(p.journalEntryId);
    const bank = p.employee.bankAccountId && (await prisma.bankAccount.findUnique({ where: { id: p.employee.bankAccountId } }));
    if (!rec || !bank) continue;
    for (const l of rec.lines) if (l.credit > 0 && l.accountCode === bank.accountCode) mark(l, bank);
  }

  // 6. Pinjaman karyawan (disburse) — baris kredit di akun bank
  const loans = await prisma.employeeLoan.findMany({
    where: { journalEntryId: { not: null }, bankAccountId: { not: null } },
    select: { journalEntryId: true, bankAccountId: true },
  });
  await loadEntries(loans.map((n) => n.journalEntryId));
  for (const n of loans) {
    const rec = entryLines.get(n.journalEntryId);
    const bank = await prisma.bankAccount.findUnique({ where: { id: n.bankAccountId } });
    if (!rec || !bank) continue;
    for (const l of rec.lines) if (l.credit > 0 && l.accountCode === bank.accountCode) mark(l, bank);
  }

  // 7. Reimburse PAID — baris kredit di akun bank
  const reimbursements = await prisma.employeeReimbursement.findMany({
    where: { journalEntryId: { not: null }, bankAccountId: { not: null } },
    select: { journalEntryId: true, bankAccountId: true },
  });
  await loadEntries(reimbursements.map((rm) => rm.journalEntryId));
  for (const rm of reimbursements) {
    const rec = entryLines.get(rm.journalEntryId);
    const bank = await prisma.bankAccount.findUnique({ where: { id: rm.bankAccountId } });
    if (!rec || !bank) continue;
    for (const l of rec.lines) if (l.credit > 0 && l.accountCode === bank.accountCode) mark(l, bank);
  }

  // 8. Aset tetap (pembelian) — baris bank
  const assets = await prisma.fixedAsset.findMany({
    where: { journalEntryId: { not: null }, bankAccountId: { not: null } },
    select: { journalEntryId: true, bankAccountId: true },
  });
  await loadEntries(assets.map((a) => a.journalEntryId));
  for (const a of assets) {
    const rec = entryLines.get(a.journalEntryId);
    const bank = await prisma.bankAccount.findUnique({ where: { id: a.bankAccountId } });
    if (!rec || !bank) continue;
    for (const l of rec.lines) if (l.accountCode === bank.accountCode) mark(l, bank);
  }

  // 9. Fallback: baris Cash/Bank yang belum tertaut, hanya bila satu rekening
  //    memakai kode CoA tersebut (tidak ambigu). Baris ambigu dibiarkan kosong.
  const unassigned = await prisma.journalLine.findMany({
    where: { bankAccountId: null, account: { OR: [{ subtype: "Cash" }, { subtype: "Bank" }] } },
    include: { account: { select: { code: true } } },
  });
  for (const l of unassigned) {
    const cands = codeToBanks.get(l.account.code);
    if (cands && cands.length === 1) attribution.set(l.id, cands[0].id);
  }

  // Terapkan atribusi
  for (const [lineId, bankId] of attribution) {
    await prisma.journalLine.update({ where: { id: lineId }, data: { bankAccountId: bankId } });
  }

  console.log(`Terkait ${attribution.size} baris jurnal ke rekening kas/bank.`);
  console.log("Detail per rekening:");
  for (const b of banks) {
    const tot = await prisma.journalLine.aggregate({
      where: { bankAccountId: b.id },
      _sum: { debit: true, credit: true },
    });
    console.log(`  ${b.code} (${b.name}): saldo ${(tot._sum.debit || 0) - (tot._sum.credit || 0)}`);
  }
  void bankIdByCode;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());