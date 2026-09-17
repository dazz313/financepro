import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { computePaymentLines, type PaymentLineInput } from "@/lib/payment-lines";

const DEFAULT_ACCOUNT = "2-1100"; // Hutang Usaha
const DEFAULT_TAX_ACCOUNT = "2-1200"; // Utang Pajak

// Ringkasan akun untuk jurnal: grup berdasarkan accountId
function buildDebitLines(
  entries: { accountId: string; debit: number }[]
): { accountId: string; debit: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.accountId, (map.get(e.accountId) ?? 0) + e.debit);
  }
  return Array.from(map.entries()).map(([accountId, debit]) => ({ accountId, debit }));
}

// GET /api/payments - daftar pembayaran
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const payments = await db.payment.findMany({
    orderBy: { number: "asc" },
    take: limit,
    include: {
      contact: { select: { id: true, code: true, name: true } },
      bankAccount: { select: { id: true, code: true, name: true } },
      lines: { orderBy: { id: "asc" } },
    },
  });
  // Sheet ala Manager.io: kolom "Accounts" = akun lawan (kategori) dari accountCode/default
  const codes = Array.from(new Set(payments.map((p) => p.accountCode).filter(Boolean)));
  payments.forEach((p) => p.lines.forEach((l) => codes.push(l.accountCode)));
  const accounts = codes.length ? await db.account.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } }) : [];
  const codeMap = new Map(accounts.map((a) => [a.code, a.name]));
  const allocIds = payments.map((p) => p.allocateToInvoiceId).filter(Boolean) as string[];
  const invoices = allocIds.length ? await db.invoice.findMany({ where: { id: { in: allocIds } }, select: { id: true, number: true } }) : [];
  const invMap = new Map(invoices.map((i) => [i.id, i.number]));
  const itemIds = Array.from(new Set(payments.flatMap((p) => p.lines.map((l) => l.itemId).filter(Boolean) as string[])));
  const items = itemIds.length ? await db.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } }) : [];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const result = payments.map((p) => ({
    ...p,
    accountName: codeMap.get(p.accountCode) ?? p.accountCode,
    allocateInvoice: invMap.get(p.allocateToInvoiceId ?? "") ?? null,
    lines: p.lines.map((l) => ({
      ...l,
      accountName: codeMap.get(l.accountCode) ?? l.accountCode,
      item: l.itemId ? (itemMap.get(l.itemId) ?? null) : null,
    })),
  }));
  return NextResponse.json({ payments: result });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      date, bankAccountId, toContactId, accountCode, description, reference, allocateToInvoiceId,
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
    const creditAcc = codeMap.get(bank.accountCode); // kas/bank dikredit (uang keluar)

    const defaultAccount = (accountCode ?? "").trim() || DEFAULT_ACCOUNT;
    const { lines, totals } = computePaymentLines(rawLines, taxRules, {
      defaultAccountCode: defaultAccount,
      amountExcludesTax: !!amountExcludesTax,
      fixedAmount: !!fixedAmount,
      fixedTotal: Number(amount) || 0,
    });

    // Cegah "hutang tanpa pembelian": akun lawan Hutang Usaha boleh dipakai
    // HANYA saat pembayaran dialokasikan ke faktur pembelian.
    if (!allocateToInvoiceId) {
      const apCodes = accounts
        .filter((a) => a.type === "LIABILITY" && a.subtype === "Account Payable")
        .map((a) => a.code);
      const accCodes = [defaultAccount, ...lines.map((l) => l.accountCode)]
        .filter((c): c is string => !!c)
        .map((c) => c.trim());
      if (accCodes.some((c) => apCodes.includes(c))) {
        return NextResponse.json(
          { error: "Akun Hutang Usaha hanya dipakai saat pembayaran dialokasikan ke faktur pembelian. Alokasikan ke faktur, atau gunakan akun Beban untuk pengeluaran tanpa hutang." },
          { status: 400 }
        );
      }
    }

    // Total kas keluar: baris (atau jumlah tetap) → fallback ke amount legacy
    let total = lines.length > 0 ? totals.total : (Number(amount) || 0);
    if (fixedAmount && Number(amount) > 0) total = Number(amount);
    if (!(total > 0)) {
      return NextResponse.json({ error: "Jumlah pembayaran harus > 0 (isi baris item atau nomina tetap)" }, { status: 400 });
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

    // Susun sisi debit jurnal. Bila dialokasikan ke invoice pembelian,
    // seluruh jumlah disetor ke Hutang Usaha (akun lawan).
    let debitEntries: { accountId: string; debit: number }[] = [];
    if (allocateToInvoiceId) {
      const ppAcc = codeMap.get(defaultAccount);
      if (!ppAcc) {
        return NextResponse.json({ error: `Akun lawan ${defaultAccount} tidak valid` }, { status: 400 });
      }
      debitEntries = [{ accountId: ppAcc, debit: total }];
    } else if (lines.length > 0) {
      for (const l of lines) {
        const debitAcc = codeMap.get(l.accountCode);
        if (!debitAcc) {
          return NextResponse.json({ error: `Akun ${l.accountCode} di baris "${l.description}" tidak valid` }, { status: 400 });
        }
        if (l.amount > 0) debitEntries.push({ accountId: debitAcc, debit: l.amount });
        if (l.taxAmount > 0) {
          const rule = taxRules.find((r) => r.code === l.taxCode);
          const taxAccountCode = rule?.accountCode || DEFAULT_TAX_ACCOUNT;
          const tid = codeMap.get(taxAccountCode);
          if (!tid) {
            return NextResponse.json({ error: `Akun pajak ${taxAccountCode} tidak valid` }, { status: 400 });
          }
          debitEntries.push({ accountId: tid, debit: l.taxAmount });
        }
      }
      debitEntries = buildDebitLines(debitEntries);
      const debitSum = debitEntries.reduce((s, e) => s + e.debit, 0);
      if (Math.abs(debitSum - total) > 0.01) {
        return NextResponse.json({ error: "Total baris tidak sesuai dengan akun lawan (periksa pajak/diskonto)" }, { status: 400 });
      }
    } else {
      // Legacy single-account payment (tanpa baris): debit akun lawan sebesar total
      const debitAcc = codeMap.get(defaultAccount);
      if (!debitAcc) {
        return NextResponse.json({ error: `Akun lawan ${defaultAccount} tidak valid` }, { status: 400 });
      }
      debitEntries = [{ accountId: debitAcc, debit: total }];
    }
    if (!creditAcc) {
      return NextResponse.json({ error: `Akun kas/bank ${bank.accountCode} tidak valid` }, { status: 400 });
    }

    const number = await nextCode(db, "payment", { date });
    const entryNumber = await nextCode(db, "journal", { date });

    const result = await db.$transaction(async (tx) => {
      // 1. Journal entry (balanced: Debit Akun-Akun, Kredit Kas/Bank)
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: new Date(date),
          description: description || `Pembayaran ${number}${invoice ? ` (alokasi ${invoice.number})` : ""}`,
          reference: reference || number,
          source: "PAYMENT",
          lines: {
            create: [
              ...debitEntries.map((e) => ({
                accountId: e.accountId,
                debit: e.debit,
                credit: 0,
                description: `Pembayaran ${number}`,
              })),
              { accountId: creditAcc, debit: 0, credit: total, bankAccountId, description: `Pembayaran dari ${bank.name}` },
            ],
          },
        },
      });

      // 2. Payment record
      const payment = await tx.payment.create({
        data: {
          number,
          date: new Date(date),
          amount: total,
          toContactId: toContactId || null,
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
          source: "PAYMENT",
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

      return { payment, entry };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Payment create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat pembayaran" }, { status: 500 });
  }
}