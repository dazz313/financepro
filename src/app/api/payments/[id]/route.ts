import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computePaymentLines, type PaymentLineInput } from "@/lib/payment-lines";

const DEFAULT_ACCOUNT = "2-1100";
const DEFAULT_TAX_ACCOUNT = "2-1200";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function buildDebitLines(entries: { accountId: string; debit: number }[]): { accountId: string; debit: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.accountId, (map.get(e.accountId) ?? 0) + e.debit);
  return Array.from(map.entries()).map(([accountId, debit]) => ({ accountId, debit }));
}

// GET /api/payments/[id] - detail pembayaran
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, code: true, name: true } },
      bankAccount: { select: { id: true, code: true, name: true } },
      lines: { orderBy: { id: "asc" } },
    },
  });
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 });
  const codes = Array.from(new Set([payment.accountCode, ...payment.lines.map((l) => l.accountCode)]));
  const accounts = await db.account.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } });
  const codeMap = new Map(accounts.map((a) => [a.code, a.name]));
  const itemIds = payment.lines.map((l) => l.itemId).filter(Boolean) as string[];
  const items = itemIds.length ? await db.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } }) : [];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  return NextResponse.json({
    payment: {
      ...payment,
      accountName: codeMap.get(payment.accountCode) ?? payment.accountCode,
      lines: payment.lines.map((l) => ({
        ...l,
        accountName: codeMap.get(l.accountCode) ?? l.accountCode,
        item: l.itemId ? (itemMap.get(l.itemId) ?? null) : null,
      })),
    },
  });
}

// PATCH /api/payments/[id] - sunting pembayaran + sinkron jurnal, baris item & alokasi invoice
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 });

    const date = body.date ? new Date(body.date) : existing.date;
    const bankAccountId = body.bankAccountId ?? existing.bankAccountId;
    const accountCode = body.accountCode !== undefined ? (body.accountCode || DEFAULT_ACCOUNT) : existing.accountCode;
    const toContactId = body.toContactId !== undefined ? (body.toContactId || null) : existing.toContactId;
    const description = body.description !== undefined ? (body.description || null) : existing.description;
    const reference = body.reference !== undefined ? (body.reference || null) : existing.reference;
    const newAlloc = body.allocateToInvoiceId !== undefined ? (body.allocateToInvoiceId || null) : existing.allocateToInvoiceId;

    const amountExcludesTax = body.amountExcludesTax !== undefined ? !!body.amountExcludesTax : existing.amountExcludesTax;
    const fixedAmount = body.fixedAmount !== undefined ? !!body.fixedAmount : existing.fixedAmount;
    const rawLines: PaymentLineInput[] = body.lines !== undefined ? body.lines : [];

    const bank = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { id: true, name: true, accountCode: true } });
    if (!bank) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const creditAcc = codeMap.get(bank.accountCode);
    const taxRules = await db.taxRule.findMany();

    const { lines, totals } = computePaymentLines(rawLines, taxRules, {
      defaultAccountCode: accountCode,
      amountExcludesTax,
      fixedAmount,
      fixedTotal: Number(body.amount) || 0,
    });

    // Cegah "hutang tanpa pembelian" saat edit/simpan pembayaran.
    if (!newAlloc) {
      const apCodes = accounts
        .filter((a) => a.type === "LIABILITY" && a.subtype === "Account Payable")
        .map((a) => a.code);
      const accCodes = [accountCode, ...lines.map((l) => l.accountCode)]
        .filter((c): c is string => !!c)
        .map((c) => c.trim());
      if (accCodes.some((c) => apCodes.includes(c))) {
        return NextResponse.json(
          { error: "Akun Hutang Usaha hanya dipakai saat pembayaran dialokasikan ke faktur pembelian. Alokasikan ke faktur, atau gunakan akun Beban untuk pengeluaran tanpa hutang." },
          { status: 400 }
        );
      }
    }

    let total = lines.length > 0 ? totals.total : (body.amount !== undefined && body.amount !== null ? Number(body.amount) : existing.amount);
    if (fixedAmount && Number(body.amount) > 0) total = Number(body.amount);
    if (!(total > 0)) return NextResponse.json({ error: "Jumlah harus > 0" }, { status: 400 });

    // Susun sisi debit jurnal (sama dengan POST)
    let debitEntries: { accountId: string; debit: number }[] = [];
    if (newAlloc) {
      const ppAcc = codeMap.get(accountCode);
      if (!ppAcc) return NextResponse.json({ error: `Akun lawan ${accountCode} tidak valid` }, { status: 400 });
      debitEntries = [{ accountId: ppAcc, debit: total }];
    } else if (lines.length > 0) {
      for (const l of lines) {
        const debitAcc = codeMap.get(l.accountCode);
        if (!debitAcc) return NextResponse.json({ error: `Akun ${l.accountCode} di baris "${l.description}" tidak valid` }, { status: 400 });
        if (l.amount > 0) debitEntries.push({ accountId: debitAcc, debit: l.amount });
        if (l.taxAmount > 0) {
          const rule = taxRules.find((r) => r.code === l.taxCode);
          const taxAccountCode = rule?.accountCode || DEFAULT_TAX_ACCOUNT;
          const tid = codeMap.get(taxAccountCode);
          if (!tid) return NextResponse.json({ error: `Akun pajak ${taxAccountCode} tidak valid` }, { status: 400 });
          debitEntries.push({ accountId: tid, debit: l.taxAmount });
        }
      }
      debitEntries = buildDebitLines(debitEntries);
      if (Math.abs(debitEntries.reduce((s, e) => s + e.debit, 0) - total) > 0.01) {
        return NextResponse.json({ error: "Total baris tidak sesuai dengan jumlah pembayaran" }, { status: 400 });
      }
    } else {
      const debitAcc = codeMap.get(accountCode);
      if (!debitAcc) return NextResponse.json({ error: `Akun lawan ${accountCode} tidak valid` }, { status: 400 });
      debitEntries = [{ accountId: debitAcc, debit: total }];
    }
    if (!creditAcc) return NextResponse.json({ error: `Akun kas/bank ${bank.accountCode} tidak valid` }, { status: 400 });

    if (newAlloc && existing.allocateToInvoiceId !== newAlloc) {
      const inv = await db.invoice.findUnique({ where: { id: newAlloc }, select: { total: true, paidAmount: true } });
      if (!inv) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 400 });
      if (inv.paidAmount + total > inv.total + 0.01) {
        return NextResponse.json({ error: "Jumlah melebihi sisa invoice" }, { status: 400 });
      }
    }

    const adjustInvoice = async (tx: any, invId: string, delta: number) => {
      const inv = await tx.invoice.findUnique({ where: { id: invId }, select: { id: true, total: true, paidAmount: true } });
      if (!inv) return;
      const newPaid = Math.max(0, inv.paidAmount + delta);
      const newStatus = newPaid >= inv.total - 0.01 ? "PAID" : "SENT";
      await tx.invoice.update({ where: { id: invId }, data: { paidAmount: newPaid, status: newStatus } });
    };

    const result = await db.$transaction(async (tx) => {
      if (existing.allocateToInvoiceId !== newAlloc || total !== existing.amount) {
        if (existing.allocateToInvoiceId) await adjustInvoice(tx, existing.allocateToInvoiceId, -existing.amount);
        if (newAlloc) await adjustInvoice(tx, newAlloc, total);
      }

      // Rebuild baris item
      await tx.paymentLine.deleteMany({ where: { paymentId: id } });

      if (existing.journalEntryId) {
        await tx.journalLine.deleteMany({ where: { entryId: existing.journalEntryId } });
        await tx.journalEntry.update({
          where: { id: existing.journalEntryId },
          data: {
            date,
            description: description || `Pembayaran ${existing.number}`,
            reference: reference || existing.number,
            lines: {
              create: [
                ...debitEntries.map((e) => ({
                  accountId: e.accountId,
                  debit: e.debit,
                  credit: 0,
                  description: `Pembayaran ${existing.number}`,
                })),
                { accountId: creditAcc, debit: 0, credit: total, bankAccountId, description: `Pembayaran dari ${bank.name}` },
              ],
            },
          },
        });
      }

      const payment = await tx.payment.update({
        where: { id },
        data: {
          date,
          amount: total,
          toContactId,
          bankAccountId,
          accountCode,
          description,
          reference,
          allocateToInvoiceId: newAlloc,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxAmount: totals.taxAmount,
          footnote: body.footnote !== undefined ? (body.footnote || null) : existing.footnote,
          customTitle: body.customTitle !== undefined ? (body.customTitle || null) : existing.customTitle,
          customTheme: body.customTheme !== undefined ? !!body.customTheme : existing.customTheme,
          themeColor: body.themeColor || existing.themeColor,
          amountExcludesTax,
          fixedAmount,
          showLineNumber: body.showLineNumber !== undefined ? !!body.showLineNumber : existing.showLineNumber,
          showDescription: body.showDescription !== undefined ? !!body.showDescription : existing.showDescription,
          showQuantity: body.showQuantity !== undefined ? !!body.showQuantity : existing.showQuantity,
          showDiscount: body.showDiscount !== undefined ? !!body.showDiscount : existing.showDiscount,
          showTaxColumn: body.showTaxColumn !== undefined ? !!body.showTaxColumn : existing.showTaxColumn,
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
      return payment;
    });

    const account = await db.account.findUnique({ where: { code: accountCode }, select: { name: true } });
    return NextResponse.json({ payment: { ...result, accountName: account?.name ?? accountCode } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui pembayaran" }, { status: 500 });
  }
}

// DELETE /api/payments/[id] - hapus pembayaran + jurnal + reverse alokasi invoice
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const payment = await db.payment.findUnique({ where: { id } });
    if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 });

    await db.$transaction(async (tx) => {
      if (payment.allocateToInvoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: payment.allocateToInvoiceId! }, select: { id: true, total: true, paidAmount: true } });
        if (inv) {
          const newPaid = Math.max(0, inv.paidAmount - payment.amount);
          const newStatus = newPaid >= inv.total - 0.01 ? "PAID" : "SENT";
          await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount: newPaid, status: newStatus } });
        }
      }
      if (payment.journalEntryId) {
        await tx.journalLine.deleteMany({ where: { entryId: payment.journalEntryId } });
        await tx.journalEntry.delete({ where: { id: payment.journalEntryId } });
      }
      await tx.payment.delete({ where: { id } });
    });

    return NextResponse.json({ message: "Pembayaran dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus pembayaran" }, { status: 500 });
  }
}