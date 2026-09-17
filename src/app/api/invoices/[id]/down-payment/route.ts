import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/code-gen";
import { getUserFromRequest } from "@/lib/auth";
import { createBalancedJournal } from "@/lib/accounting-engine";

// POST /api/invoices/[id]/down-payment — catat DP dari pelanggan
// Jurnal: Dr Kas/Bank, Cr Uang Muka Pelanggan (2-1300)
// DP BUKAN pendapatan — hanya diakui sebagai liabilitas sampai jasa selesai.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req);
    const { id } = await params;
    const { bankAccountId, amount, date, description } = await req.json();

    if (!bankAccountId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Akun bank dan jumlah DP (> 0) wajib diisi" }, { status: 400 });
    }

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    if (invoice.type !== "SALES") return NextResponse.json({ error: "DP hanya untuk faktur penjualan" }, { status: 400 });

    const bank = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { accountCode: true, name: true } });
    if (!bank) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const bankAccId = codeMap.get(bank.accountCode);
    const dpAccId = codeMap.get("2-1300"); // Pendapatan Diterima Di Muka
    if (!bankAccId) return NextResponse.json({ error: `Akun bank ${bank.accountCode} tidak valid` }, { status: 400 });
    if (!dpAccId) return NextResponse.json({ error: "Akun Uang Muka Pelanggan (2-1300) belum ada di CoA" }, { status: 400 });

    const today = date ? new Date(date) : new Date();
    const entryNumber = await nextCode(db, "journal", { date: today });

    const result = await db.$transaction(async (tx) => {
      const entry = await createBalancedJournal(tx, {
        entryNumber,
        date: today,
        description: description || `DP dari pelanggan — ${invoice.number}`,
        reference: invoice.number,
        source: "DOWN_PAYMENT",
        sourceId: invoice.id,
        userId: user?.id,
        lines: [
          { accountId: bankAccId, debit: amount, credit: 0, bankAccountId, description: `DP ke ${bank.name}` },
          { accountId: dpAccId, debit: 0, credit: amount, description: `DP ${invoice.number}` },
        ],
      });

      // Update invoice: tambah downPayment, link journal
      await tx.invoice.update({
        where: { id },
        data: {
          downPayment: { increment: amount },
          downPaymentJournalId: entry.id,
        },
      });

      return entry;
    });

    return NextResponse.json({ journal: result, message: `DP Rp ${amount.toLocaleString("id-ID")} tercatat (Dr Kas, Cr Uang Muka Pelanggan)` });
  } catch (error) {
    console.error("Down payment error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mencatat DP" }, { status: 500 });
  }
}

// POST /api/invoices/[id]/recognize-revenue — akui pendapatan + reklasifikasi DP
// Flow: Dr Uang Muka Pelanggan (DP), Dr Piutang/Kas (sisa), Cr Pendapatan (total)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req);
    const { id } = await params;
    const { bankAccountId, date, description } = await req.json();

    const invoice = await db.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    if (invoice.type !== "SALES") return NextResponse.json({ error: "Reklasifikasi hanya untuk faktur penjualan" }, { status: 400 });
    if (invoice.downPayment <= 0) return NextResponse.json({ error: "Tidak ada DP untuk direklasifikasi" }, { status: 400 });

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));
    const dpAccId = codeMap.get("2-1300");
    if (!dpAccId) return NextResponse.json({ error: "Akun Uang Muka Pelanggan tidak valid" }, { status: 400 });

    // Pendapatan dari total invoice
    const totalRevenue = invoice.subtotal - invoice.discount + invoice.taxAmount;
    const dpAmount = invoice.downPayment;
    const remaining = totalRevenue - dpAmount;

    const lines: { accountId: string; debit: number; credit: number; description?: string }[] = [
      // 1. Reklasifikasi DP → Pendapatan
      { accountId: dpAccId, debit: dpAmount, credit: 0, description: `Reklasifikasi DP ${invoice.number}` },
    ];

    if (remaining > 0 && bankAccountId) {
      // 2. Sisa tagihan → Piutang/Kas
      const bank = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { accountCode: true, name: true } });
      if (bank) {
        const bankAccId = codeMap.get(bank.accountCode);
        if (bankAccId) {
          lines.push({ accountId: bankAccId, debit: remaining, credit: 0, description: `Pelunasan ${invoice.number}` });
        }
      }
    } else if (remaining > 0) {
      // 2b. Sisa → Piutang Usaha
      const arAccId = codeMap.get("1-1300");
      if (arAccId) {
        lines.push({ accountId: arAccId, debit: remaining, credit: 0, description: `Piutang ${invoice.number}` });
      }
    }

    // 3. Total pendapatan (kredit)
    const revAccId = codeMap.get("4-1100") ?? codeMap.get("4-1000");
    if (revAccId) {
      lines.push({ accountId: revAccId, debit: 0, credit: totalRevenue, description: `Pendapatan ${invoice.number}` });
    }

    const today = date ? new Date(date) : new Date();
    const entryNumber = await nextCode(db, "journal", { date: today });

    const result = await db.$transaction(async (tx) => {
      const entry = await createBalancedJournal(tx, {
        entryNumber,
        date: today,
        description: description || `Akui pendapatan + reklasifikasi DP — ${invoice.number}`,
        reference: invoice.number,
        source: "REVENUE_RECOGNITION",
        sourceId: invoice.id,
        userId: user?.id,
        lines,
      });

      // Reset downPayment di invoice (sudah direklasifikasi)
      await tx.invoice.update({
        where: { id },
        data: {
          downPayment: 0,
          downPaymentJournalId: null,
          paidAmount: { increment: dpAmount },
        },
      });

      return entry;
    });

    return NextResponse.json({ journal: result, message: `Pendapatan Rp ${totalRevenue.toLocaleString("id-ID")} diakui (DP ${dpAmount.toLocaleString("id-ID")} + sisa ${remaining.toLocaleString("id-ID")})` });
  } catch (error) {
    console.error("Revenue recognition error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengakui pendapatan" }, { status: 500 });
  }
}
