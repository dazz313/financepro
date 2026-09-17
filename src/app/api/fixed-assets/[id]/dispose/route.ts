import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { nextCode } from "@/lib/code-gen";
import { createBalancedJournal } from "@/lib/accounting-engine";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/fixed-assets/[id]/dispose - disposisi (penjualan/penghapusan) aset
// body: { date: "YYYY-MM-DD", disposalPrice: number, bankAccountId?: string, reason?: string }
// Jurnal (balanced):
//   Debit Akumulasi Penyusutan (accumulatedAccountCode)     = akumulasi s.d. saat ini
//   Debit Kas/Bank                                          = hasil jual (disposalPrice)
//   Debit/Kredit Laba/Rugi (bila ada selisih nilai buku vs hasil jual)
//   Kredit Akun Aset (assetAccountCode)                     = harga perolehan
export async function POST(req: NextRequest, ctx: RouteContext) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });

  try {
    const { id } = await ctx.params;
    const body = await req.json();

    const asset = await db.fixedAsset.findUnique({ where: { id } });
    if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
    if (asset.isDisposed) return NextResponse.json({ error: "Aset sudah didisposisi" }, { status: 400 });

    const date = body.date ? new Date(body.date) : new Date();
    const disposalPrice = Number(body.disposalPrice) || 0;
    const bankAccountId = body.bankAccountId || null;
    const reason = body.reason || null;

    // Akumulasi penyusutan sampai saat ini
    const agg = await db.fixedAssetDepreciation.aggregate({
      where: { assetId: id },
      _sum: { expense: true },
    });
    const accumulated = agg._sum.expense ?? 0;
    const bookValueRemaining = Math.max(0, asset.purchasePrice - accumulated);

    const accounts = await db.account.findMany();
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));

    const assetAccId = codeMap.get(asset.assetAccountCode);
    const accumAccId = codeMap.get(asset.accumulatedAccountCode);
    if (!assetAccId || !accumAccId) {
      return NextResponse.json({ error: "Akun aset / akumulasi penyusutan tidak ditemukan di CoA" }, { status: 400 });
    }

    // Akun kas/bank untuk hasil jual (Manager.io: uang masuk → Receipts)
    if (disposalPrice > 0 && !bankAccountId) {
      return NextResponse.json({ error: "Pilih akun kas/bank penerima hasil penjualan aset" }, { status: 400 });
    }
    let cashAccId: string | undefined;
    let bankAccount: { id: string; accountCode: string } | null = null;
    if (bankAccountId) {
      bankAccount = await db.bankAccount.findUnique({ where: { id: bankAccountId }, select: { id: true, accountCode: true } });
      if (!bankAccount) return NextResponse.json({ error: "Akun bank tidak ditemukan" }, { status: 400 });
      cashAccId = codeMap.get(bankAccount.accountCode);
      if (!cashAccId) return NextResponse.json({ error: "Akun kas/bank tidak ditemukan di CoA" }, { status: 400 });
    } else {
      cashAccId = codeMap.get("1-1100");
      if (!cashAccId) return NextResponse.json({ error: "Tentukan akun bank/kas penerima hasil penjualan" }, { status: 400 });
    }

    // Selisih laba/rugi:
    //  laba  = disposalPrice > bookValueRemaining → Kredit Pendapatan Lain-lain (4-2000)
    //  rugi  = disposalPrice < bookValueRemaining → Debit Beban Lain-lain (5-4000)
    const gainLoss = disposalPrice - bookValueRemaining;
    const gainAccountId = codeMap.get("4-2000");
    const lossAccountId = codeMap.get("5-4000");

    const result = await db.$transaction(async (tx) => {
      const entryNumber = await nextCode(tx, "journal", { date });
      const lines: any[] = [];

      // Kredit akun aset sebesar harga perolehan
      lines.push({ accountId: assetAccId, debit: 0, credit: asset.purchasePrice, description: `Disposisi aset ${asset.code}` });

      // Debit akumulasi penyusutan
      if (accumulated > 0) {
        lines.push({ accountId: accumAccId, debit: accumulated, credit: 0, description: `Akumulasi penyusutan aset ${asset.code}` });
      }

      // Debit kas/bank = hasil jual
      if (disposalPrice > 0) {
        lines.push({ accountId: cashAccId!, debit: disposalPrice, credit: 0, bankAccountId: bankAccountId || undefined, description: `Hasil penjualan aset ${asset.code}` });
      }

      // Selisih laba/rugi
      if (Math.abs(gainLoss) > 0.01) {
        if (gainLoss > 0 && gainAccountId) {
          lines.push({ accountId: gainAccountId, debit: 0, credit: gainLoss, description: `Laba penjualan aset ${asset.code}` });
        } else if (gainLoss < 0 && lossAccountId) {
          lines.push({ accountId: lossAccountId, debit: Math.abs(gainLoss), credit: 0, description: `Rugi penjualan aset ${asset.code}` });
        }
      }

      // Balance check
      const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        // Tambah akun laba/rugi bila tidak balance (fallback ke 4-2000)
        const diff = totalCredit - totalDebit;
        if (gainAccountId) {
          if (diff > 0) lines.push({ accountId: gainAccountId, debit: diff, credit: 0, description: `Penyesuaian disposisi aset ${asset.code}` });
          else lines.push({ accountId: gainAccountId, debit: 0, credit: -diff, description: `Penyesuaian disposisi aset ${asset.code}` });
        } else {
          throw new Error("Jurnal disposisi tidak balanced dan tidak ada akun 4-2000");
        }
      }

      const entry = await createBalancedJournal(tx, {
          entryNumber,
          date,
          description: `Disposisi aset ${asset.code} - ${asset.name}`,
          reference: `DISPOSAL-${asset.code}`,
          source: "FIXED_ASSET_DISPOSAL",
          userId: user?.id,
          lines: [...lines],
        });

      const updated = await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { isDisposed: true, disposalDate: date, disposalPrice, notes: reason },
      });

      // Manager.io: hasil penjualan aset tampil di view Penerimaan
      const receiptNumber = disposalPrice > 0 ? await nextCode(tx, "receipt", { date }) : undefined;
      if (disposalPrice > 0 && bankAccountId) {
        await tx.receipt.create({
          data: {
            number: receiptNumber!,
            date,
            amount: disposalPrice,
            fromContactId: null,
            bankAccountId,
            accountCode: asset.assetAccountCode,
            description: `Hasil penjualan aset ${asset.code} - ${asset.name}`,
            reference: `DISPOSAL-${asset.code}`,
            journalEntryId: entry.id,
            source: "FIXED_ASSET_DISPOSAL",
          },
        });
      }

      return { entry, asset: updated };
    });

    return NextResponse.json({
      message: `Aset ${asset.code} didisposisi`,
      asset: result.asset,
      gainLoss,
      bookValueRemaining,
      accumulated,
      journalEntryId: result.entry.id,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal disposisi aset" }, { status: 500 });
  }
}