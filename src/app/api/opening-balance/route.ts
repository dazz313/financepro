import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { NORMAL_BALANCE } from "@/lib/accounting";
import { nextCode } from "@/lib/code-gen";

const OPENING_SOURCE = "OPENING";
const BS_TYPES = ["ASSET", "LIABILITY", "EQUITY"] as const;

// GET /api/opening-balance - status saldo awal + daftar akun neraca
// mengikuti prinsip Manager.io: saldo awal diisi SEKALI sebelum transaksi pertama.
export async function GET() {
  const openingEntry = await db.journalEntry.findFirst({
    where: { source: OPENING_SOURCE },
    orderBy: { date: "desc" },
    include: { lines: { include: { account: true } } },
  });

  const otherCount = await db.journalEntry.count({ where: { source: { not: OPENING_SOURCE } } });

  const accountsRaw = await db.account.findMany({
    where: { isGroup: false, type: { in: [...BS_TYPES] } },
    orderBy: { code: "asc" },
  });
  const accounts = accountsRaw.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype ?? null,
    side: NORMAL_BALANCE[a.type as keyof typeof NORMAL_BALANCE] ?? "DEBIT",
  }));

  // Akun ekuitas default untuk menyerap selisih otomatis
  const equityAcc =
    accounts.find((a) => a.code === "3-1000") ?? accounts.find((a) => a.type === "EQUITY") ?? null;

  const existing =
    openingEntry
      ? {
          id: openingEntry.id,
          entryNumber: openingEntry.entryNumber,
          date: openingEntry.date,
          reference: openingEntry.reference,
          lines: openingEntry.lines.map((l) => ({
            accountCode: l.account.code,
            accountName: l.account.name,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
          totalDebit: openingEntry.lines.reduce((s, l) => s + l.debit, 0),
          totalCredit: openingEntry.lines.reduce((s, l) => s + l.credit, 0),
        }
      : null;

  return NextResponse.json({
    canPost: !openingEntry && otherCount === 0,
    otherEntries: otherCount,
    existing,
    defaultEquityAccountCode: equityAcc?.code ?? null,
    defaultEquityAccountName: equityAcc?.name ?? null,
    accounts,
  });
}

// POST /api/opening-balance - catat saldo awal (hanya saat pertama kali digunakan)
// body: { date: "YYYY-MM-DD", balances: [{ accountCode, amount }] }
// Sisi debit/kredit otomatis mengikuti normal balance akun.
// Selisih (Aset != Kewajiban+Ekuitas) otomatis diserap ke akun ekuitas default (Modal Pemilik).
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { date, balances } = body;

    if (!date) {
      return NextResponse.json({ error: "Tanggal saldo awal wajib diisi" }, { status: 400 });
    }
    if (!Array.isArray(balances) || balances.length === 0) {
      return NextResponse.json({ error: "Minimal satu akun dengan saldo wajib diisi" }, { status: 400 });
    }

    // Hanya boleh sekali & sebelum transaksi lain
    const existing = await db.journalEntry.findFirst({ where: { source: OPENING_SOURCE } });
    if (existing) {
      return NextResponse.json({ error: "Saldo awal sudah dicatat. Hapus terlebih dahulu untuk mengisi ulang." }, { status: 400 });
    }
    const otherCount = await db.journalEntry.count({ where: { source: { not: OPENING_SOURCE } } });
    if (otherCount > 0) {
      return NextResponse.json(
        { error: "Saldo awal hanya bisa diisi saat pertama kali aplikasi digunakan, sebelum ada transaksi." },
        { status: 400 }
      );
    }

    // Ambil akun & tentukan sisi berdasarkan normal balance
    const codes = balances.map((b: { accountCode: string }) => b.accountCode);
    const accounts = await db.account.findMany({ where: { code: { in: codes }, isGroup: false } });
    if (accounts.length !== codes.length) {
      return NextResponse.json({ error: "Ada kode akun yang tidak ditemukan" }, { status: 400 });
    }
    const accountMap = new Map(accounts.map((a) => [a.code, a]));

    // Peta rekening utama per akun kas/bank (rekening pertama dibuat). Digunakan
    // agar baris saldo awal kas/bank tertaut rekening (bankAccountId), sehingga
    // saldo rekening & akun CoA selalu konsisten (tidak "yatim").
    const cashBankAccounts = accounts.filter((a) => a.type === "ASSET" && ["Cash", "Bank"].includes(a.subtype ?? ""));
    const banks = cashBankAccounts.length
      ? await db.bankAccount.findMany({
          where: { accountCode: { in: cashBankAccounts.map((a) => a.code) } },
          orderBy: [{ createdAt: "asc" }, { code: "asc" }],
        })
      : [];
    const primaryBankByCode = new Map<string, string>();
    for (const b of banks) {
      if (!primaryBankByCode.has(b.accountCode)) primaryBankByCode.set(b.accountCode, b.id);
    }

    const journalLines: { code: string; debit: number; credit: number }[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const b of balances) {
      const amount = Math.abs(Number(b.amount) || 0);
      if (amount <= 0) continue;
      const acc = accountMap.get(b.accountCode);
      if (!acc) continue;
      const side = NORMAL_BALANCE[acc.type as keyof typeof NORMAL_BALANCE] ?? "DEBIT";
      if (side === "DEBIT") {
        journalLines.push({ code: acc.code, debit: amount, credit: 0 });
        totalDebit += amount;
      } else {
        journalLines.push({ code: acc.code, debit: 0, credit: amount });
        totalCredit += amount;
      }
    }

    if (journalLines.length === 0) {
      return NextResponse.json({ error: "Tidak ada saldo yang diisi" }, { status: 400 });
    }

    // Auto-balance: selisih diserap ke akun ekuitas default (Modal Pemilik)
    const diff = totalDebit - totalCredit;
    let autoLine: { code: string; debit: number; credit: number } | null = null;
    if (Math.abs(diff) > 0.01) {
      const equityRaw = await db.account.findFirst({
        where: { code: "3-1000", isGroup: false },
      });
      const equity = equityRaw ?? (await db.account.findFirst({ where: { type: "EQUITY", isGroup: false } }));
      if (!equity) {
        return NextResponse.json({ error: "Tidak ada akun ekuitas untuk menyerap selisih" }, { status: 400 });
      }
      if (diff > 0) {
        autoLine = { code: equity.code, debit: 0, credit: diff };
        totalCredit += diff;
      } else {
        autoLine = { code: equity.code, debit: -diff, credit: 0 };
        totalDebit += -diff;
      }
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        { error: `Saldo tidak balanced. Debit ${totalDebit} ≠ Kredit ${totalCredit}` },
        { status: 400 }
      );
    }

    // Buat jurnal saldo awal (nomor & prefix dari Pengaturan Perusahaan)
    const entryNumber = await nextCode(db, "opening", { date });

    const entry = await db.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(date),
        description: "Saldo Awal (Opening Balance)",
        reference: "OPENING",
        source: OPENING_SOURCE,
        lines: {
          create: [...journalLines, ...(autoLine ? [autoLine] : [])].map((l) => ({
            account: { connect: { code: l.code } },
            debit: l.debit,
            credit: l.credit,
            description: l.debit > 0 ? "Saldo awal - debit" : "Saldo awal - kredit",
            ...(primaryBankByCode.has(l.code) ? { bankAccountId: primaryBankByCode.get(l.code)! } : {}),
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });

    return NextResponse.json({
      message: "Saldo awal berhasil dicatat",
      entry: {
        id: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        totalDebit,
        totalCredit,
        autoBalance: autoLine,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menyimpan saldo awal" },
      { status: 500 }
    );
  }
}

// DELETE /api/opening-balance - hapus saldo awal (untuk mengisi ulang)
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  try {
    const entry = await db.journalEntry.findFirst({ where: { source: OPENING_SOURCE } });
    if (!entry) {
      return NextResponse.json({ error: "Saldo awal belum dicatat" }, { status: 404 });
    }
    await db.journalLine.deleteMany({ where: { entryId: entry.id } });
    await db.journalEntry.delete({ where: { id: entry.id } });
    return NextResponse.json({ message: "Saldo awal dihapus" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menghapus saldo awal" },
      { status: 500 }
    );
  }
}