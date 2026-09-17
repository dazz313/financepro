import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computePaymentLines, type PaymentLineInput } from "@/lib/payment-lines";

const DEFAULT_ACCOUNT = "1-1300";
const DEFAULT_TAX_ACCOUNT = "2-1200";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function buildCreditLines(entries: { accountId: string; credit: number }[]): { accountId: string; credit: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.accountId, (map.get(e.accountId) ?? 0) + e.credit);
  return Array.from(map.entries()).map(([accountId, credit]) => ({ accountId, credit }));
}

// GET /api/receipts/[id] - detail penerimaan
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const receipt = await db.receipt.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, code: true, name: true } },
      bankAccount: { select: { id: true, code: true, name: true } },
      lines: { orderBy: { id: "asc" } },
    },
  });
  if (!receipt) return NextResponse.json({ error: "Penerimaan tidak ditemukan" }, { status: 404 });
  const codes = Array.from(new Set([receipt.accountCode, ...receipt.lines.map((l) => l.accountCode)]));
  const accounts = await db.account.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } });
  const codeMap = new Map(accounts.map((a) => [a.code, a.name]));
  const itemIds = receipt.lines.map((l) => l.itemId).filter(Boolean) as string[];
  const items = itemIds.length ? await db.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } }) : [];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  return NextResponse.json({
    receipt: {
      ...receipt,
      accountName: codeMap.get(receipt.accountCode) ?? receipt.accountCode,
      lines: receipt.lines.map((l) => ({
        ...l,
        accountName: codeMap.get(l.accountCode) ?? l.accountCode,
        item: l.itemId ? (itemMap.get(l.itemId) ?? null) : null,
      })),
    },
  });
}

// PATCH /api/receipts/[id] - sunting penerimaan + sinkron jurnal, baris item & alokasi invoice
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const existing = await db.receipt.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Penerimaan tidak ditemukan" }, { status: 404 });

    const date = body.date ? new Date(body.date) : existing.date;
    const bankAccountId = body.bankAccountId ?? existing.bankAccountId;
    const accountCode = body.accountCode !== undefined ? (body.accountCode || DEFAULT_ACCOUNT) : existing.accountCode;
    const fromContactId = body.fromContactId !== undefined ? (body.fromContactId || null) : existing.fromContactId;
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
    const debitAcc = codeMap.get(bank.accountCode); // kas/bank didebit (uang masuk)
    const taxRules = await db.taxRule.findMany();

    const { lines, totals } = computePaymentLines(rawLines, taxRules, {
      defaultAccountCode: accountCode,
      amountExcludesTax,
      fixedAmount,
      fixedTotal: Number(body.amount) || 0,
    });

    // Cegah "piutang tanpa penjualan" saat edit/simpan penerimaan.
    if (!newAlloc) {
      const arCodes = accounts
        .filter((a) => a.type === "ASSET" && a.subtype === "Account Receivable")
        .map((a) => a.code);
      const accCodes = [accountCode, ...lines.map((l) => l.accountCode)]
        .filter((c): c is string => !!c)
        .map((c) => c.trim());
      if (accCodes.some((c) => arCodes.includes(c))) {
        return NextResponse.json(
          { error: "Akun Piutang Usaha hanya dipakai saat penerimaan dialokasikan ke faktur penjualan. Alokasikan ke faktur, atau gunakan akun Pendapatan untuk uang masuk tanpa piutang." },
          { status: 400 }
        );
      }
    }

    let total = lines.length > 0 ? totals.total : (body.amount !== undefined && body.amount !== null ? Number(body.amount) : existing.amount);
    if (fixedAmount && Number(body.amount) > 0) total = Number(body.amount);
    if (!(total > 0)) return NextResponse.json({ error: "Jumlah harus > 0" }, { status: 400 });

    // Susun sisi kredit jurnal (sama dengan POST)
    let creditEntries: { accountId: string; credit: number }[] = [];
    if (newAlloc) {
      const ppAcc = codeMap.get(accountCode);
      if (!ppAcc) return NextResponse.json({ error: `Akun lawan ${accountCode} tidak valid` }, { status: 400 });
      creditEntries = [{ accountId: ppAcc, credit: total }];
    } else if (lines.length > 0) {
      for (const l of lines) {
        const creditAcc = codeMap.get(l.accountCode);
        if (!creditAcc) return NextResponse.json({ error: `Akun ${l.accountCode} di baris "${l.description}" tidak valid` }, { status: 400 });
        if (l.amount > 0) creditEntries.push({ accountId: creditAcc, credit: l.amount });
        if (l.taxAmount > 0) {
          const rule = taxRules.find((r) => r.code === l.taxCode);
          const taxAccountCode = rule?.accountCode || DEFAULT_TAX_ACCOUNT;
          const tid = codeMap.get(taxAccountCode);
          if (!tid) return NextResponse.json({ error: `Akun pajak ${taxAccountCode} tidak valid` }, { status: 400 });
          creditEntries.push({ accountId: tid, credit: l.taxAmount });
        }
      }
      creditEntries = buildCreditLines(creditEntries);
      if (Math.abs(creditEntries.reduce((s, e) => s + e.credit, 0) - total) > 0.01) {
        return NextResponse.json({ error: "Total baris tidak sesuai dengan jumlah penerimaan" }, { status: 400 });
      }
    } else {
      const creditAcc = codeMap.get(accountCode);
      if (!creditAcc) return NextResponse.json({ error: `Akun lawan ${accountCode} tidak valid` }, { status: 400 });
      creditEntries = [{ accountId: creditAcc, credit: total }];
    }
    if (!debitAcc) return NextResponse.json({ error: `Akun kas/bank ${bank.accountCode} tidak valid` }, { status: 400 });

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
      await tx.receiptLine.deleteMany({ where: { receiptId: id } });

      if (existing.journalEntryId) {
        await tx.journalLine.deleteMany({ where: { entryId: existing.journalEntryId } });
        await tx.journalEntry.update({
          where: { id: existing.journalEntryId },
          data: {
            date,
            description: description || `Penerimaan ${existing.number}`,
            reference: reference || existing.number,
            lines: {
              create: [
                { accountId: debitAcc, debit: total, credit: 0, bankAccountId, description: `Penerimaan ke ${bank.name}` },
                ...creditEntries.map((e) => ({
                  accountId: e.accountId,
                  debit: 0,
                  credit: e.credit,
                  description: `Penerimaan ${existing.number}`,
                })),
              ],
            },
          },
        });
      }

      const receipt = await tx.receipt.update({
        where: { id },
        data: {
          date,
          amount: total,
          fromContactId,
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
      return receipt;
    });

    const account = await db.account.findUnique({ where: { code: accountCode }, select: { name: true } });
    return NextResponse.json({ receipt: { ...result, accountName: account?.name ?? accountCode } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui penerimaan" }, { status: 500 });
  }
}

// DELETE /api/receipts/[id] - hapus penerimaan + jurnal + reverse alokasi invoice
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt) return NextResponse.json({ error: "Penerimaan tidak ditemukan" }, { status: 404 });

    await db.$transaction(async (tx) => {
      if (receipt.allocateToInvoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: receipt.allocateToInvoiceId! }, select: { id: true, total: true, paidAmount: true } });
        if (inv) {
          const newPaid = Math.max(0, inv.paidAmount - receipt.amount);
          const newStatus = newPaid >= inv.total - 0.01 ? "PAID" : "SENT";
          await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount: newPaid, status: newStatus } });
        }
      }
      if (receipt.journalEntryId) {
        await tx.journalLine.deleteMany({ where: { entryId: receipt.journalEntryId } });
        await tx.journalEntry.delete({ where: { id: receipt.journalEntryId } });
      }
      await tx.receipt.delete({ where: { id } });
    });

    return NextResponse.json({ message: "Penerimaan dihapus" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus penerimaan" }, { status: 500 });
  }
}