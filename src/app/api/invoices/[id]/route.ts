import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";

// PATCH /api/invoices/[id]
// - Jika body punya `lines` → edit lengkap (replace lines + recalc totals + rebuild jurnal)
// - Jika hanya `status`/`paidAmount` → update status / tandai lunas (post jurnal sisa saja)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.invoice.findUnique({
      where: { id },
      include: { lines: true, contact: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    }

    // === MODE EDIT LENGKAP (ada `lines` di body) ===
    if (Array.isArray(body.lines)) {
      const { number: newNumber, contactId, date, dueDate, notes, taxRate, lines, status, discount, withholdingRate, footnote, customTitle, showLineNumber, showDescription } = body;
      const isSales = existing.type === "SALES";
      const effDate = date ? new Date(date) : existing.date;

      // Cek nomor unik jika diubah
      if (newNumber && newNumber !== existing.number) {
        const dup = await db.invoice.findUnique({ where: { number: newNumber } });
        if (dup) {
          return NextResponse.json({ error: "Nomor sudah digunakan dokumen lain" }, { status: 400 });
        }
      }

      const subtotal = lines.reduce((s: number, l: any) => s + (Number(l.quantity) * Number(l.unitPrice)), 0);
      const parsedTax = Number(taxRate);
      const taxRateNum = Number.isFinite(parsedTax) ? parsedTax : existing.taxRate;
      // PPN nonaktif di Pengaturan → Pajak: faktur dipaksa tanpa PPN.
      const settings = await db.companySettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
      const taxRateFinal = settings.ppnEnabled === false ? 0 : taxRateNum;

      const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
      const net = subtotal - discountAmount; // harga setelah diskon
      const taxAmount = net * (taxRateFinal / 100);
      const gross = net + taxAmount;
      // Potongan Pajak Penghasilan (PPh 23) hanya untuk pembelian. DPP dihitung
      // atas nilai TANPA PPN (PMK 141/2015).
      const withholdingRateNum = Number(withholdingRate) || 0;
      const withheld = !isSales ? net * (withholdingRateNum / 100) : 0;
      const total = gross - withheld;

      // Faktur ber-akuntansi (INVOICE): tolak edit bila sudah ada pembayaran /
      // alokasi supaya buku besar tidak menyimpang dari sub-ledger.
      if (existing.documentType === "INVOICE") {
        const [payCount, rcCount] = await Promise.all([
          db.payment.count({ where: { allocateToInvoiceId: existing.id } }),
          db.receipt.count({ where: { allocateToInvoiceId: existing.id } }),
        ]);
        if (existing.paidAmount > 0.005 || payCount > 0 || rcCount > 0) {
          return NextResponse.json(
            { error: "Faktur sudah dibayar sebagian/lunas. Batalkan pembayaran terkait di Penerimaan/Pembayaran dulu, atau buat dokumen baru." },
            { status: 400 }
          );
        }
      }

      const invoice = await db.$transaction(async (tx) => {
        // === Reverse inventory movements dari lines lama (kembalikan stok) ===
        const oldItemLines = existing.lines.filter((l) => l.itemId);
        if (oldItemLines.length > 0) {
          for (const l of oldItemLines) {
            const item = await tx.inventoryItem.findUnique({ where: { id: l.itemId! } });
            if (!item) continue;
            if (isSales) {
              await tx.inventoryItem.update({
                where: { id: item.id },
                data: { quantityOnHand: item.quantityOnHand + l.quantity },
              });
            } else {
              await tx.inventoryItem.update({
                where: { id: item.id },
                data: { quantityOnHand: Math.max(0, item.quantityOnHand - l.quantity) },
              });
            }
          }
          await tx.inventoryMovement.deleteMany({ where: { reference: existing.number } });
        }

        // === Reverse jurnal posting lama (hanya INVOICE) ===
        if (existing.documentType === "INVOICE") {
          const oldEntries = await tx.journalEntry.findMany({
            where: { sourceId: existing.id, source: { in: ["SALES_INVOICE", "PURCHASE_INVOICE"] } },
            select: { id: true },
          });
          for (const e of oldEntries) {
            await tx.journalLine.deleteMany({ where: { entryId: e.id } });
            await tx.journalEntry.delete({ where: { id: e.id } });
          }
        }

        // Hapus lines lama, buat baru
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });

        const inv = await tx.invoice.update({
          where: { id },
          data: {
            ...(newNumber !== undefined && { number: newNumber }),
            ...(contactId && { contactId }),
            ...(date && { date: effDate }),
            ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
            ...(notes !== undefined ? { notes: notes || null } : {}),
            ...(status ? { status } : {}),
            subtotal,
            discount: discountAmount,
            taxRate: taxRateFinal,
            taxAmount,
            withholdingRate: withholdingRateNum,
            total,
            ...(footnote !== undefined ? { footnote: footnote || null } : {}),
            ...(customTitle !== undefined ? { customTitle: customTitle || null } : {}),
            ...(showLineNumber !== undefined ? { showLineNumber: showLineNumber === true } : {}),
            ...(showDescription !== undefined ? { showDescription: showDescription === true } : {}),
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

        // === Proses inventory movements untuk lines BARU ===
        const newItemLines = inv.lines.filter((l) => l.itemId);
        if (newItemLines.length > 0) {
          for (const l of newItemLines) {
            const item = await tx.inventoryItem.findUnique({ where: { id: l.itemId! } });
            if (!item) continue;
            if (isSales) {
              if (item.quantityOnHand < l.quantity - 0.001) {
                throw new Error(`Stok ${item.name} tidak cukup (tersedia ${item.quantityOnHand})`);
              }
              await tx.inventoryItem.update({
                where: { id: item.id },
                data: { quantityOnHand: item.quantityOnHand - l.quantity },
              });
              await tx.inventoryMovement.create({
                data: {
                  itemId: item.id, date: effDate, type: "OUT",
                  quantity: l.quantity, unitPrice: item.purchasePrice || l.unitPrice,
                  totalValue: l.quantity * (item.purchasePrice || l.unitPrice),
                  reference: inv.number, description: `Penjualan via ${inv.number}`,
                },
              });
            } else {
              await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  quantityOnHand: item.quantityOnHand + l.quantity,
                  purchasePrice: l.unitPrice > 0 ? l.unitPrice : item.purchasePrice,
                },
              });
              await tx.inventoryMovement.create({
                data: {
                  itemId: item.id, date: effDate, type: "IN",
                  quantity: l.quantity, unitPrice: l.unitPrice,
                  totalValue: l.quantity * l.unitPrice,
                  reference: inv.number, description: `Pembelian via ${inv.number}`,
                },
              });
            }
          }
        }

        // === Posting ulang jurnal faktur (hanya INVOICE) ===
        if (existing.documentType === "INVOICE") {
          const accounts = await tx.account.findMany();
          const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
          const accAr = codeMap.get("1-1300");
          const accAp = codeMap.get("2-1100");
          const accSales = codeMap.get("4-1000") ?? codeMap.get("4-1100");
          const accTax = codeMap.get("2-1200");
          const cashAccount = isSales ? accAr : accAp;
          const revenueAccount = accSales;
          // Jika akun default belum dikonfigurasi, jurnal dilewati (sama seperti saat buat)
          if (cashAccount && revenueAccount) {
            const hasItems = newItemLines.length > 0;
            const accInventory = codeMap.get("1-1400");
            const accCOGS = codeMap.get("5-2000");
            const accPPNMasukan = codeMap.get("1-1600") ?? accTax;
            const accPurchaseExpense = codeMap.get("5-1700") ?? codeMap.get("5-4000") ?? accAp;
            const journalLines: any[] = [];
            if (isSales) {
              journalLines.push({ accountId: cashAccount, debit: total, credit: 0, description: inv.number });
              journalLines.push({ accountId: revenueAccount, debit: 0, credit: net, description: inv.number });
              if (taxAmount > 0 && accTax) {
                journalLines.push({ accountId: accTax, debit: 0, credit: taxAmount, description: `PPN ${inv.number}` });
              }
              if (hasItems && accCOGS && accInventory) {
                let totalCOGS = 0;
                for (const l of newItemLines) {
                  const item = await tx.inventoryItem.findUnique({ where: { id: l.itemId! } });
                  if (item) totalCOGS += l.quantity * (item.purchasePrice || l.unitPrice);
                }
                if (totalCOGS > 0) {
                  journalLines.push({ accountId: accCOGS, debit: totalCOGS, credit: 0, description: `HPP ${inv.number}` });
                  journalLines.push({ accountId: accInventory, debit: 0, credit: totalCOGS, description: `Persediaan keluar ${inv.number}` });
                }
              }
            } else {
              const purchaseDebitAcc = hasItems && accInventory ? accInventory : accPurchaseExpense;
              journalLines.push({ accountId: purchaseDebitAcc, debit: net, credit: 0, description: inv.number });
              if (taxAmount > 0 && accPPNMasukan) {
                journalLines.push({ accountId: accPPNMasukan, debit: taxAmount, credit: 0, description: `PPN Masukan ${inv.number}` });
              }
              journalLines.push({ accountId: cashAccount, debit: 0, credit: total, description: inv.number });
              if (withheld > 0 && accTax) {
                journalLines.push({ accountId: accTax, debit: 0, credit: withheld, description: `PPh 23 ${inv.number}` });
              }
            }

            const withContact = await tx.invoice.findUnique({ where: { id: inv.id }, include: { contact: true } });
            const entryNumber = await nextCode(tx, "journal", { date: effDate });
            await tx.journalEntry.create({
              data: {
                entryNumber,
                date: effDate,
                description: `${isSales ? "Penjualan" : "Pembelian"} - ${inv.number} (${withContact?.contact?.name ?? ""})`,
                reference: inv.number,
                source: isSales ? "SALES_INVOICE" : "PURCHASE_INVOICE",
                sourceId: inv.id,
                lines: { create: journalLines },
              },
            });
          }
        }

        return inv;
      });

      return NextResponse.json({ invoice });
    }

    // === MODE UPDATE STATUS / PAID AMOUNT ===
    const { status, paidAmount } = body;
    const bankAccountId: string | undefined = body.bankAccountId;

    const invoice = await db.invoice.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(paidAmount !== undefined && { paidAmount }),
      },
      include: { contact: true },
    });

    // Jika dibayar lunas: post jurnal hanya untuk SISA yang belum dibayar
    // (hindari pencatatan ganda bila sudah ada penerimaan/pembayaran parsial).
    if (status === "PAID" && existing.documentType === "INVOICE") {
      const remaining = Math.max(0, existing.total - existing.paidAmount);

      if (remaining > 0.01) {
        const accounts = await db.account.findMany();
        const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
        const accAr = codeMap.get("1-1300"); // Piutang
        const accAp = codeMap.get("2-1100"); // Hutang
        const isSales = invoice.type === "SALES";

        if (!bankAccountId) {
          return NextResponse.json({
            error: "Pilih akun kas/bank (uang masuk/keluar pelunasan harus tercatat di Penerimaan/Pembayaran)",
          }, { status: 400 });
        }
        const ba = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { name: true, accountCode: true } });
        if (!ba) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
        const accBank = codeMap.get(ba.accountCode);

        if (accBank && (isSales ? accAr : accAp)) {
          const today = new Date();
          const entryNumber = await nextCode(db, "journal", { date: today });
          const entry = await db.journalEntry.create({
            data: {
              entryNumber,
              date: today,
              description: `Pembayaran ${invoice.number} - ${isSales ? "Penerimaan" : "Pembayaran"} kas`,
              reference: invoice.number,
              source: isSales ? "SALES_INVOICE" : "PURCHASE_INVOICE",
              sourceId: invoice.id,
              lines: {
                create: isSales
                  ? [
                      { accountId: accBank, debit: remaining, credit: 0, bankAccountId, description: `Penerimaan dari ${invoice.contact.name}` },
                      { accountId: accAr!, debit: 0, credit: remaining },
                    ]
                  : [
                      { accountId: accAp!, debit: remaining, credit: 0 },
                      { accountId: accBank, debit: 0, credit: remaining, bankAccountId, description: `Pembayaran ke ${invoice.contact.name}` },
                    ],
              },
            },
          });

          // Manager.io: transaksi lunas tercatat di Receipt/Payments
          if (isSales) {
            const receiptNumber = await nextCode(db, "receipt", { date: today });
            await db.receipt.create({
              data: {
                number: receiptNumber,
                date: today,
                amount: remaining,
                fromContactId: invoice.contactId || null,
                bankAccountId,
                accountCode: "1-1300",
                description: `Pembayaran invoice ${invoice.number} - ${invoice.contact.name}`,
                reference: invoice.number,
                allocateToInvoiceId: invoice.id,
                journalEntryId: entry.id,
                source: "SALES_INVOICE",
              },
            });
          } else {
            const paymentNumber = await nextCode(db, "payment", { date: today });
            await db.payment.create({
              data: {
                number: paymentNumber,
                date: today,
                amount: remaining,
                toContactId: invoice.contactId || null,
                bankAccountId,
                accountCode: "2-1100",
                description: `Pembayaran invoice ${invoice.number} - ${invoice.contact.name}`,
                reference: invoice.number,
                allocateToInvoiceId: invoice.id,
                journalEntryId: entry.id,
                source: "PURCHASE_INVOICE",
              },
            });
          }

          // Sinkronkan paidAmount ke total hanya setelah jurnal berhasil dibuat
          await db.invoice.update({ where: { id }, data: { paidAmount: existing.paidAmount + remaining } });
        }
      }
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error("Invoice PATCH error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memperbarui invoice" }, { status: 500 });
  }
}

// DELETE /api/invoices/[id]
// Menghapus invoice beserta jurnal posting, pembayaran terkait, dan
// pergerakan stok (reverse) agar buku besar tetap konsisten.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await db.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      // 1. Kembalikan stok & hapus movement lama
      const itemLines = invoice.lines.filter((l) => l.itemId);
      if (itemLines.length > 0) {
        const itemIds = Array.from(new Set(itemLines.map((l) => l.itemId!)));
        const items = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } } });
        const itemMap = new Map(items.map((i) => [i.id, i]));
        for (const l of itemLines) {
          const item = itemMap.get(l.itemId!);
          if (!item) continue;
          // SALES → stok naik kembali; PURCHASE → stok turun
          const delta = invoice.type === "SALES" ? l.quantity : -l.quantity;
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantityOnHand: Math.max(0, item.quantityOnHand + delta) },
          });
        }
        await tx.inventoryMovement.deleteMany({ where: { reference: invoice.number } });
      }

      // 2. Hapus penerimaan/pembayaran yang menautkan ke invoice + jurnalnya
      const receipts = await tx.receipt.findMany({ where: { allocateToInvoiceId: invoice.id } });
      for (const r of receipts) {
        if (r.journalEntryId) {
          await tx.journalLine.deleteMany({ where: { entryId: r.journalEntryId } });
          await tx.journalEntry.delete({ where: { id: r.journalEntryId } });
        }
      }
      await tx.receipt.deleteMany({ where: { allocateToInvoiceId: invoice.id } });

      const payments = await tx.payment.findMany({ where: { allocateToInvoiceId: invoice.id } });
      for (const p of payments) {
        if (p.journalEntryId) {
          await tx.journalLine.deleteMany({ where: { entryId: p.journalEntryId } });
          await tx.journalEntry.delete({ where: { id: p.journalEntryId } });
        }
      }
      await tx.payment.deleteMany({ where: { allocateToInvoiceId: invoice.id } });

      // 3. Hapus entry jurnal posting invoice (cascade menghapus barisnya)
      const entries = await tx.journalEntry.findMany({
        where: { sourceId: invoice.id, source: { in: ["SALES_INVOICE", "PURCHASE_INVOICE"] } },
        select: { id: true },
      });
      for (const e of entries) {
        await tx.journalLine.deleteMany({ where: { entryId: e.id } });
        await tx.journalEntry.delete({ where: { id: e.id } });
      }

      // 4. Hapus invoice & lines
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });

    return NextResponse.json({ message: "Invoice dihapus (termasuk pembayaran & jurnal terkait)" });
  } catch (error) {
    console.error("Invoice DELETE error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghapus invoice" }, { status: 500 });
  }
}