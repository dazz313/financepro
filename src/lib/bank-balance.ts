import { db } from "@/lib/db";

// Hitung saldo tiap rekening kas/bank KONSISTEN dengan saldo akun CoA subtype Cash/Bank.
//
// Latar: saldo per rekening selama ini hanya menjumlah journalLine yang punya
// `bankAccountId`. Padahal banyak transaksi (setoran modal, transfer, gaji, jurnal
// umum, dsb.) mencatatnya ke akun CoA kas/bank TANPA menautkan bankAccountId,
// sehingga saldo rekening ≠ saldo akun → total view Kas & Bank ≠ total dashboard.
//
// Solusi: selisih saldo akun yang tidak tertaut ke rekening mana pun ("orphan")
// dialihkan ke rekening utama akun itu (rekening pertama dibuat). Total rekening
// menjadi sama persis dengan total akun CoA.
export type BankBalanceMap = Map<string, number>;

// orphan per akun CoA kas/bank dan rekening utama masing-masing akun
export async function computeBankBalances(): Promise<{ byId: BankBalanceMap; orphans: Map<string, number> }> {
  const banks = await db.bankAccount.findMany({ orderBy: [{ createdAt: "asc" }, { code: "asc" }] });
  const bankIds = banks.map((b) => b.id);

  const accounts = await db.account.findMany({
    where: { OR: [{ subtype: "Cash" }, { subtype: "Bank" }] },
    select: { id: true, code: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const lines = await db.journalLine.findMany({
    where: {
      OR: [{ bankAccountId: { in: bankIds } }, { accountId: { in: accountIds } }],
    },
    select: { debit: true, credit: true, bankAccountId: true, accountId: true },
  });

  const accountIdSet = new Set(accountIds);

  // saldo per rekening (tertaut) & saldo per akun (hanya akun kas/bank)
  const perBank = new Map<string, number>();
  const perAccount = new Map<string, number>();
  for (const l of lines) {
    if (l.bankAccountId) perBank.set(l.bankAccountId!, (perBank.get(l.bankAccountId!) ?? 0) + (l.debit - l.credit));
    if (accountIdSet.has(l.accountId)) perAccount.set(l.accountId, (perAccount.get(l.accountId) ?? 0) + (l.debit - l.credit));
  }

  // tanah tertaut per akun: jumlah saldo rekening-rekening yang menunjuk akun itu
  const perAccountLinked = new Map<string, number>();
  for (const b of banks) {
    const v = perBank.get(b.id) ?? 0;
    perAccountLinked.set(b.accountCode, (perAccountLinked.get(b.accountCode) ?? 0) + v);
  }

  // orphan per akun + rekening utama (pertama dibuat) penerimanya
  const orphanByAcc = new Map<string, number>();
  const primaryBankByAcc = new Map<string, string>();
  for (const acc of accounts) {
    const accountBalance = perAccount.get(acc.id) ?? 0;
    const linked = perAccountLinked.get(acc.code) ?? 0;
    const orphan = accountBalance - linked;
    if (Math.abs(orphan) > 0.001) {
      const primary = banks.find((b) => b.accountCode === acc.code);
      if (primary) {
        orphanByAcc.set(acc.code, orphan);
        primaryBankByAcc.set(acc.code, primary.id);
      }
    }
  }

  const byId: BankBalanceMap = new Map();
  for (const b of banks) {
    let bal = perBank.get(b.id) ?? 0;
    if (primaryBankByAcc.get(b.accountCode) === b.id) {
      bal += orphanByAcc.get(b.accountCode) ?? 0;
    }
    byId.set(b.id, bal);
  }

  return { byId, orphans: orphanByAcc };
}