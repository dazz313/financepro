import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { getUserFromRequest } from "@/lib/auth";
import { createBalancedJournal } from "@/lib/accounting-engine";
import type { DocSeries } from "@/lib/codegen-shared";

// Status turunan ala Manager.io (dihitung dari total vs paidAmount vs jatuh tempo)
// OVERPAID=Lebih bayar, PAID=Lunas, PARTIAL=Kurang bayar, OVERDUE=Jatuh tempo, OPEN=Terbuka
export function computePaymentStatus(inv: { total: number; paidAmount: number; dueDate?: Date | string | null }): string {
  const balance = Math.round((Number(inv.total) - Number(inv.paidAmount)) * 100) / 100;
  if (balance < -0.005) return "OVERPAID";
  if (Math.abs(balance) <= 0.005) return "PAID";
  if (Number(inv.paidAmount) > 0) return "PARTIAL";
  if (inv.dueDate) {
    const due = new Date(inv.dueDate);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return "OVERDUE";
  }
  return "OPEN";
}

export function daysOverdue(date?: Date | string | null): number {
  if (!date) return 0;
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

// GET /api/invoices
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status"); // status dokumen tersimpan (DRAFT/SENT/PAID/dll)
  const paymentStatus = searchParams.get("paymentStatus"); // status turunan (alokasi pembayaran)
  const documentType = searchParams.get("documentType");
  const where: any = {};
  if (type && type !== "ALL") where.type = type;
  if (status && status !== "ALL") where.status = status;
  if (documentType && documentType !== "ALL") where.documentType = documentType;

  const invoices = await db.invoice.findMany({
    where,
    orderBy: { number: "asc" },
    include: {
      contact: true,
      lines: true,
    },
  });

  // Riwayat pembayaran per invoice: Purchase → Payment, Sales → Receipt.
  // Dipakai untuk menampilkan tanggal pelunasan & rincian "-Pembayaran" pada dokumen.
  const invIds = invoices.map((i) => i.id);
  const [payments, receipts] =
    invIds.length > 0
      ? await Promise.all([
          db.payment.findMany({
            where: { allocateToInvoiceId: { in: invIds } },
            select: { allocateToInvoiceId: true, date: true, amount: true },
            orderBy: { date: "asc" },
          }),
          db.receipt.findMany({
            where: { allocateToInvoiceId: { in: invIds } },
            select: { allocateToInvoiceId: true, date: true, amount: true },
            orderBy: { date: "asc" },
          }),
        ])
      : [[], []];
  const paymentsByInv = new Map<string, { date: string; amount: number }[]>();
  for (const p of payments) {
    const list = paymentsByInv.get(p.allocateToInvoiceId!) ?? [];
    list.push({ date: p.date.toISOString(), amount: p.amount });
    paymentsByInv.set(p.allocateToInvoiceId!, list);
  }
  const receiptsByInv = new Map<string, { date: string; amount: number }[]>();
  for (const r of receipts) {
    const list = receiptsByInv.get(r.allocateToInvoiceId!) ?? [];
    list.push({ date: r.date.toISOString(), amount: r.amount });
    receiptsByInv.set(r.allocateToInvoiceId!, list);
  }

  let result = invoices.map((inv) => ({
    ...inv,
    payments:
      inv.type === "SALES"
        ? (receiptsByInv.get(inv.id) ?? [])
        : (paymentsByInv.get(inv.id) ?? []),
    balanceDue: Math.round((Number(inv.total) - Number(inv.paidAmount)) * 100) / 100,
    paymentStatus: computePaymentStatus(inv),
    daysOverdue: daysOverdue(inv.dueDate),
  }));
  if (paymentStatus && paymentStatus !== "ALL") {
    result = result.filter((i) => i.paymentStatus === paymentStatus);
  }
  return NextResponse.json({ invoices: result });
}

// POST /api/invoices - buat invoice + jurnal akuntansi otomatis
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  try {
    const body = await req.json();
    let { number, type, contactId, date, dueDate, notes, taxRate, lines, documentType, parentInvoiceId, discount, withholdingRate, footnote, customTitle, showLineNumber, showDescription } = body;

    if (!type || !contactId || !date || !lines?.length) {
      return NextResponse.json({ error: "Field wajib tidak lengkap (type, contactId, date, lines)" }, { status: 400 });
    }

    const docType = (documentType || "INVOICE").toUpperCase(); // QUOTE | ORDER | INVOICE

    // Auto-generate nomor berdasarkan documentType
    const settings = await db.companySettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
    if (!number) {
      // Prefix & nomor mengikuti Pengaturan Perusahaan per jenis dokumen
      const seriesByDoc: Record<string, DocSeries> = {
        QUOTE: "quote",
        ORDER: "order",
        INVOICE: "invoice",
      };
      number = await nextCode(db, seriesByDoc[docType] || "invoice", { date });
    }

    // Auto-generate dueDate jika tidak diisi: pakai termin pembayaran kontak terlebih
// dahulu (diisi saat tambah/sunting pemasok/pelanggan), fallback pengaturan perusahaan.
    if (!dueDate) {
      const contact = await db.contact.findUnique({
        where: { id: contactId },
        select: { paymentTermsDays: true },
      });
      const terms = contact?.paymentTermsDays ?? settings.defaultPaymentTermsDays;
      if (terms && terms > 0) {
        const d = new Date(date);
        d.setDate(d.getDate() + terms);
        dueDate = d.toISOString();
      }
    }

    const subtotal = lines.reduce((s: number, l: any) => s + (Number(l.quantity) * Number(l.unitPrice)), 0);
    const parsedTax = Number(taxRate);
    const taxRateNum = Number.isFinite(parsedTax) ? parsedTax : (settings.defaultTaxRate ?? 0);
    // PPN nonaktif di Pengaturan → Pajak: faktur dipaksa tanpa PPN.
    const taxRateFinal = settings.ppnEnabled === false ? 0 : taxRateNum;

    const isSales = type === "SALES";
    const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
    const net = subtotal - discountAmount; // harga setelah diskon
    const taxAmount = net * (taxRateFinal / 100);
    const gross = net + taxAmount;
    // Potongan Pajak Penghasilan (PPh 23) hanya untuk pembelian.
    // DPP dihitung atas nilai TANPA PPN (PMK 141/2015).
    const withholdingRateNum = Number(withholdingRate) || 0;
    const withheld = !isSales ? net * (withholdingRateNum / 100) : 0;
    const total = gross - withheld;

    const isInvoice = docType === "INVOICE";

    // Akun default untuk jurnal (hanya dipakai jika INVOICE)
    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const accAr = codeMap.get("1-1300");
    const accAp = codeMap.get("2-1100");
    const accSales = codeMap.get("4-1000") ?? codeMap.get("4-1100");
    const accTax = codeMap.get("2-1200");
    const cashAccount = isSales ? accAr : accAp;
    const revenueAccount = accSales;

    // Jika INVOICE tapi akun belum dikonfigurasi, tetap buat invoice tanpa jurnal
    const skipJournal = !isInvoice || !cashAccount || !revenueAccount;

    const entryNumber = await nextCode(db, "journal", { date });

    const result = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number,
          type,
          documentType: docType,
          parentInvoiceId: parentInvoiceId || null,
          contactId,
          date: new Date(date),
          dueDate: dueDate ? new Date(dueDate) : null,
          status: isInvoice ? "SENT" : "DRAFT",
          notes: notes || null,
          subtotal,
          discount: discountAmount,
          taxRate: taxRateFinal,
          taxAmount,
          withholdingRate: withholdingRateNum,
          total,
          footnote: footnote || null,
          customTitle: customTitle || null,
          showLineNumber: showLineNumber === true,
          showDescription: showDescription !== false,
          paidAmount: 0,
          lines: {
            create: lines.map((l: any) => ({
              description: l.description,
              quantity: Number(l.quantity) || 1,
              unit: l.unit || "pcs",
              unitPrice: Number(l.unitPrice) || 0,
              amount: Number(l.quantity) * Number(l.unitPrice),
              accountCode: l.accountCode || null,
              itemId: l.itemId || null,
            })),
          },
        },
        include: { lines: true, contact: true },
      });

      // === Proses inventory items (jika ada line dengan itemId) ===
      // Untuk SALES: buat InventoryMovement OUT (stok turun) + posting COGS (Debit HPP, Kredit Persediaan)
      // Untuk PURCHASE: buat InventoryMovement IN (stok naik) + update purchasePrice item
      const itemLines = invoice.lines.filter((l) => l.itemId);
      if (itemLines.length > 0) {
        // Pre-fetch items
        const itemIds = Array.from(new Set(itemLines.map((l) => l.itemId!)));
        const items = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } } });
        const itemMap = new Map(items.map((i) => [i.id, i]));

        for (const l of itemLines) {
          const item = itemMap.get(l.itemId!);
          if (!item) continue;
          const qty = l.quantity;
          const price = l.unitPrice;
          const value = qty * price;

          if (isSales) {
            // Stok TURUN untuk penjualan. Validasi stok cukup.
            if (item.quantityOnHand < qty - 0.001) {
              throw new Error(`Stok ${item.name} tidak cukup (tersedia ${item.quantityOnHand} ${item.unit})`);
            }
            // Update stok item
            await tx.inventoryItem.update({
              where: { id: item.id },
              data: { quantityOnHand: item.quantityOnHand - qty },
            });
            // Buat movement OUT (cogs pakai harga BELI item, bukan harga jual)
            const cogsValue = qty * (item.purchasePrice || price);
            await tx.inventoryMovement.create({
              data: {
                itemId: item.id,
                date: new Date(date),
                type: "OUT",
                quantity: qty,
                unitPrice: item.purchasePrice || price,
                totalValue: cogsValue,
                reference: number,
                description: `Penjualan via ${number}`,
              },
            });
          } else {
            // PURCHASE: stok NAIK
            await tx.inventoryItem.update({
              where: { id: item.id },
              data: {
                quantityOnHand: item.quantityOnHand + qty,
                // Update harga beli item ke harga terbaru
                purchasePrice: price > 0 ? price : item.purchasePrice,
              },
            });
            await tx.inventoryMovement.create({
              data: {
                itemId: item.id,
                date: new Date(date),
                type: "IN",
                quantity: qty,
                unitPrice: price,
                totalValue: value,
                reference: number,
                description: `Pembelian via ${number}`,
              },
            });
          }
        }
      }

      // === Jurnal akuntansi (hanya INVOICE) ===
      // Logika akun berubah jika ada inventory items:
      //  - PURCHASE + item: Debit Persediaan (1-1400) bukan Hutang Usaha
      //  - SALES + item: tambah baris COGS (Debit HPP 5-2000, Kredit Persediaan 1-1400) berdasarkan harga BELI
      if (!skipJournal) {
        const hasItems = itemLines.length > 0;
        const accInventory = codeMap.get("1-1400");
        const accCOGS = codeMap.get("5-2000");

        // Akun lawan untuk Piutang/Hutang: kalau ada item → gunakan akun Persediaan,
        // kalau tidak → gunakan akun Pendapatan (untuk sales) atau Hutang (untuk purchase)
        let mainCreditAcc = revenueAccount!;
        let mainDebitAcc = cashAccount!;
        if (hasItems && accInventory) {
          if (isSales) {
            mainCreditAcc = revenueAccount!; // penjualan tetap kredit pendapatan
          } else {
            mainDebitAcc = accInventory; // pembelian barang → debit persediaan
          }
        }

        const journalLines: any[] = [];
        // Akun PPN masukan (pembelian ber-PPN) & akun beban default pembelian non-item
        const accPPNMasukan = codeMap.get("1-1600") ?? accTax;
        const accPurchaseExpense = codeMap.get("5-1700") ?? codeMap.get("5-4000") ?? accAp;
        if (isSales) {
          journalLines.push({ accountId: mainDebitAcc, debit: total, credit: 0, description: number });
          journalLines.push({ accountId: mainCreditAcc, debit: 0, credit: net, description: number });
          if (taxAmount > 0 && accTax) {
            journalLines.push({ accountId: accTax, debit: 0, credit: taxAmount, description: `PPN ${number}` });
          }
          // COGS untuk item yang dijual (berdasarkan harga BELI)
          if (hasItems && accCOGS && accInventory) {
            let totalCOGS = 0;
            for (const l of itemLines) {
              const item = (await tx.inventoryItem.findUnique({ where: { id: l.itemId! } }))!;
              totalCOGS += l.quantity * (item.purchasePrice || l.unitPrice);
            }
            if (totalCOGS > 0) {
              journalLines.push({ accountId: accCOGS, debit: totalCOGS, credit: 0, description: `HPP ${number}` });
              journalLines.push({ accountId: accInventory, debit: 0, credit: totalCOGS, description: `Persediaan keluar ${number}` });
            }
          }
        } else {
          // PURCHASE: Debit Beban/Persediaan (subtotal) + Debit PPN Masukan (tax)
          //           Kredit Hutang Usaha (AP) = total.
          // PPN Masukan dipisah agar PPN terhutang = Keluaran - Masukan (laporan PPN).
          const purchaseDebitAcc = hasItems && accInventory ? accInventory : accPurchaseExpense;
          journalLines.push({ accountId: purchaseDebitAcc, debit: net, credit: 0, description: number });
          if (taxAmount > 0 && accPPNMasukan) {
            journalLines.push({ accountId: accPPNMasukan, debit: taxAmount, credit: 0, description: `PPN Masukan ${number}` });
          }
          journalLines.push({ accountId: cashAccount!, debit: 0, credit: total, description: number });
          // PPh 23 dipotong dari pembayaran pemasok & disetor ke negara
          if (withheld > 0 && accTax) {
            journalLines.push({ accountId: accTax, debit: 0, credit: withheld, description: `PPh 23 ${number}` });
          }
        }

        const entry = await createBalancedJournal(tx, {
            entryNumber,
            date: new Date(date),
            description: `${isSales ? "Penjualan" : "Pembelian"} - ${number} (${invoice.contact?.name ?? ""})`,
            reference: number,
            source: isSales ? "SALES_INVOICE" : "PURCHASE_INVOICE",
            sourceId: invoice.id,
            userId: user?.id,
            lines: [...journalLines],
          });
        return { invoice, entry };
      }

      return { invoice, entry: null };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Invoice create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat invoice" }, { status: 500 });
  }
}
