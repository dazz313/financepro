import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { computePaymentLines, type PaymentLineInput } from "@/lib/payment-lines";
import { getUserFromRequest } from "@/lib/auth";
import { createBalancedJournal } from "@/lib/accounting-engine";

const DEFAULT_ACCOUNT = "1-1300"; // Piutang Usaha
const DEFAULT_TAX_ACCOUNT = "2-1200"; // Hutang Pajak (PPN Keluaran)

// Ringkasan akun untuk jurnal: grup berdasarkan accountId
function buildCreditLines(
  entries: { accountId: string; credit: number }[]
): { accountId: string; credit: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.accountId, (map.get(e.accountId) ?? 0) + e.credit);
  }
  return Array.from(map.entries()).map(([accountId, credit]) => ({ accountId, credit }));
}

// GET /api/receipts - daftar penerimaan
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const receipts = await db.receipt.findMany({
    orderBy: { number: "asc" },
    take: limit,
    include: {
      contact: { select: { id: true, code: true, name: true } },
      bankAccount: { select: { id: true, code: true, name: true } },
      lines: { orderBy: { id: "asc" } },
    },
  });
  // Sheet ala Manager.io: kolom "Accounts" = akun lawan (kategori) dari accountCode/default
  const codes = Array.from(new Set(receipts.map((r) => r.accountCode).filter(Boolean)));
  receipts.forEach((r) => r.lines.forEach((l) => codes.push(l.accountCode)));
  const accounts = codes.length ? await db.account.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } }) : [];
  const codeMap = new Map(accounts.map((a) => [a.code, a.name]));
  const allocIds = receipts.map((r) => r.allocateToInvoiceId).filter(Boolean) as string[];
  const invoices = allocIds.length ? await db.invoice.findMany({ where: { id: { in: allocIds } }, select: { id: true, number: true } }) : [];
  const invMap = new Map(invoices.map((i) => [i.id, i.number]));
  const itemIds = Array.from(new Set(receipts.flatMap((r) => r.lines.map((l) => l.itemId).filter(Boolean) as string[])));
  const items = itemIds.length ? await db.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } }) : [];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const result = receipts.map((r) => ({
    ...r,
    accountName: codeMap.get(r.accountCode) ?? r.accountCode,
    allocateInvoice: invMap.get(r.allocateToInvoiceId ?? "") ?? null,
    lines: r.lines.map((l) => ({
      ...l,
      accountName: codeMap.get(l.accountCode) ?? l.accountCode,
      item: l.itemId ? (itemMap.get(l.itemId) ?? null) : null,
    })),
  }));
  return NextResponse.json({ receipts: result });
}

// POST /api/receipts - catat penerimaan + auto-post journal
// Jurnal: Debit Akun Kas/Bank (dari bankAccount.accountCode) sebesar total,
// Kredit Akun Lawan per baris + Kredit Akun Pajak per baris bila ber-PPN.
// Jika dialokasikan ke invoice (pelanggan), akun lawan default = 1-1300 (Piutang)
// dan update paidAmount invoice.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  try {
    const body = await req.json();
    const {
      date, bankAccountId, fromContactId, accountCode, description, reference, allocateToInvoiceId,
      amountExcludesTax = true, fixedAmount = false, amount,
      footnote, customTitle, customTheme = false, themeColor,
      showLineNumber = false, showDescription = true, showQuantity = true, showDiscount = false, showTaxColumn = true,
      lines: rawLines = [] as PaymentLineInput[],
    } = body;

    if (!date || !bankAccountId) {
      return NextResponse.json({ error: "Tanggal dan akun kas/bank wajib diisi" }, { status: 400 });
    }

    const bank = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { id: true, name: true, accountCode: true } });
    if (!bank) {
      return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
    }
    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const taxRules = await db.taxRule.findMany();
    const debitAcc = codeMap.get(bank.accountCode); // kas/bank didebit (uang masuk)

    const defaultAccount = (accountCode ?? "").trim() || DEFAULT_ACCOUNT;
    const { lines, totals } = computePaymentLines(rawLines, taxRules, {
      defaultAccountCode: defaultAccount,
      amountExcludesTax: !!amountExcludesTax,
      fixedAmount: !!fixedAmount,
      fixedTotal: Number(amount) || 0,
    });

    // Cegah "piutang tanpa penjualan": akun lawan Piutang Usaha boleh dipakai
    // HANYA saat penerimaan dialokasikan ke faktur penjualan.
    if (!allocateToInvoiceId) {
      const arCodes = accounts
        .filter((a) => a.type === "ASSET" && a.subtype === "Account Receivable")
        .map((a) => a.code);
      const accCodes = [defaultAccount, ...lines.map((l) => l.accountCode)]
        .filter((c): c is string => !!c)
        .map((c) => c.trim());
      if (accCodes.some((c) => arCodes.includes(c))) {
        return NextResponse.json(
          { error: "Akun Piutang Usaha hanya dipakai saat penerimaan dialokasikan ke faktur penjualan. Alokasikan ke faktur, atau gunakan akun Pendapatan untuk uang masuk tanpa piutang." },
          { status: 400 }
        );
      }
    }

    // Total kas masuk: baris (atau jumlah tetap) → fallback ke amount legacy
    let total = lines.length > 0 ? totals.total : (Number(amount) || 0);
    if (fixedAmount && Number(amount) > 0) total = Number(amount);
    if (!(total > 0)) {
      return NextResponse.json({ error: "Jumlah penerimaan harus > 0 (isi baris item atau nomina tetap)" }, { status: 400 });
    }

    // Validasi alokasi invoice
    let invoice: { id: string; number: string; paidAmount: number; total: number } | null = null;
    if (allocateToInvoiceId) {
      invoice = await db.invoice.findUnique({ where: { id: allocateToInvoiceId }, select: { id: true, number: true, paidAmount: true, total: true } });
      if (!invoice) {
        return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 400 });
      }
      const newPaid = invoice.paidAmount + total;
      if (newPaid > invoice.total + 0.01) {
        return NextResponse.json({ error: `Jumlah melebihi sisa invoice (sisa: ${(invoice.total - invoice.paidAmount).toLocaleString("id-ID")})` }, { status: 400 });
      }
    }

    // Susun sisi kredit jurnal. Bila dialokasikan ke invoice penjualan,
    // seluruh jumlah disetor ke Piutang Usaha (akun lawan).
    let creditEntries: { accountId: string; credit: number }[] = [];
    if (allocateToInvoiceId) {
      const ppAcc = codeMap.get(defaultAccount);
      if (!ppAcc) {
        return NextResponse.json({ error: `Akun lawan ${defaultAccount} tidak valid` }, { status: 400 });
      }
      creditEntries = [{ accountId: ppAcc, credit: total }];
    } else if (lines.length > 0) {
      for (const l of lines) {
        const creditAcc = codeMap.get(l.accountCode);
        if (!creditAcc) {
          return NextResponse.json({ error: `Akun ${l.accountCode} di baris "${l.description}" tidak valid` }, { status: 400 });
        }
        if (l.amount > 0) creditEntries.push({ accountId: creditAcc, credit: l.amount });
        if (l.taxAmount > 0) {
          const rule = taxRules.find((r) => r.code === l.taxCode);
          const taxAccountCode = rule?.accountCode || DEFAULT_TAX_ACCOUNT;
          const tid = codeMap.get(taxAccountCode);
          if (!tid) {
            return NextResponse.json({ error: `Akun pajak ${taxAccountCode} tidak valid` }, { status: 400 });
          }
          creditEntries.push({ accountId: tid, credit: l.taxAmount });
        }
      }
      creditEntries = buildCreditLines(creditEntries);
      const creditSum = creditEntries.reduce((s, e) => s + e.credit, 0);
      if (Math.abs(creditSum - total) > 0.01) {
        return NextResponse.json({ error: "Total baris tidak sesuai dengan akun lawan (periksa pajak/diskonto)" }, { status: 400 });
      }
    } else {
      // Legacy single-account receipt (tanpa baris): kredit akun lawan sebesar total
      const creditAcc = codeMap.get(defaultAccount);
      if (!creditAcc) {
        return NextResponse.json({ error: `Akun lawan ${defaultAccount} tidak valid` }, { status: 400 });
      }
      creditEntries = [{ accountId: creditAcc, credit: total }];
    }
    if (!debitAcc) {
      return NextResponse.json({ error: `Akun kas/bank ${bank.accountCode} tidak valid` }, { status: 400 });
    }

    const number = await nextCode(db, "receipt", { date });
    const entryNumber = await nextCode(db, "journal", { date });

    const result = await db.$transaction(async (tx) => {
      // 1. Journal entry (balanced: Debit Kas/Bank, Kredit Akun-Akun)
      const entry = await createBalancedJournal(tx, {
          entryNumber,
          date: new Date(date),
          description: description || `Penerimaan ${number}${invoice ? ` (alokasi ${invoice.number})` : ""}`,
          reference: reference || number,
          source: "RECEIPT",
          userId: user?.id,
          lines: [
              { accountId: debitAcc, debit: total, credit: 0, bankAccountId, description: `Penerimaan ke ${bank.name}` },
              ...creditEntries.map((e) => ({
                accountId: e.accountId,
                debit: 0,
                credit: e.credit,
                description: `Penerimaan ${number}`,
              })),
          ],
        });

      // 2. Receipt record
      const receipt = await tx.receipt.create({
        data: {
          number,
          date: new Date(date),
          amount: total,
          fromContactId: fromContactId || null,
          bankAccountId,
          accountCode: defaultAccount,
          description: description || null,
          reference: reference || null,
          allocateToInvoiceId: allocateToInvoiceId || null,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxAmount: totals.taxAmount,
          footnote: footnote || null,
          customTitle: customTitle || null,
          customTheme: !!customTheme,
          themeColor: themeColor || "#047857",
          amountExcludesTax: !!amountExcludesTax,
          fixedAmount: !!fixedAmount,
          showLineNumber: !!showLineNumber,
          showDescription: !!showDescription,
          showQuantity: !!showQuantity,
          showDiscount: !!showDiscount,
          showTaxColumn: !!showTaxColumn,
          journalEntryId: entry.id,
          source: "RECEIPT",
          lines: {
            create: lines.map((l) => ({
              itemId: l.itemId,
              accountCode: l.accountCode,
              description: l.description,
              quantity: l.quantity,
              unit: l.unit,
              discount: l.discount,
              unitPrice: l.unitPrice,
              amount: l.amount,
              taxCode: l.taxCode,
              taxRate: l.taxRate,
              taxAmount: l.taxAmount,
            })),
          },
        },
        include: {
          contact: { select: { id: true, code: true, name: true } },
          bankAccount: { select: { id: true, code: true, name: true } },
          lines: true,
        },
      });

      // 3. Update invoice jika ada alokasi
      if (invoice) {
        const newPaid = invoice.paidAmount + total;
        const newStatus = newPaid >= invoice.total - 0.01 ? "PAID" : "SENT";
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { paidAmount: newPaid, status: newStatus },
        });
      }

      return { receipt, entry };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Receipt create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat penerimaan" }, { status: 500 });
  }
}