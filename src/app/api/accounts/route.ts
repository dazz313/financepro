import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccountBalances } from "@/lib/reports";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/accounting";
import { getSystemAccountCodes, SYSTEM_ACCOUNTS } from "@/lib/system-accounts";
import { getUserFromRequest } from "@/lib/auth";

async function requireAdmin(req: NextRequest): Promise<null | NextResponse> {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  return null;
}

// GET /api/accounts - daftar akun + saldo (diurutkan sortOrder manual, lalu kode)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const withBalances = searchParams.get("balances") !== "false";

  const accounts = await db.account.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });

  // Tanda proteksi akun sistem/referensi modul (Manager.io: akun sistem tidak bisa dihapus)
  const systemMap = await getSystemAccountCodes();

  const base = accounts.map((a) => ({
    ...a,
    isSystem: systemMap.has(a.code) || !!SYSTEM_ACCOUNTS[a.code],
    referencedBy: (systemMap.get(a.code) ?? []).slice(0, 3),
  }));

  if (!withBalances) {
    return NextResponse.json({ accounts: base });
  }

  const balances = await getAccountBalances();
  const map = new Map(balances.map((b) => [b.id, b]));
  const result = base.map((a) => {
    const b = map.get(a.id);
    return {
      ...a,
      totalDebit: b?.totalDebit ?? 0,
      totalCredit: b?.totalCredit ?? 0,
      balance: b?.balance ?? 0,
    };
  });
  return NextResponse.json({ accounts: result });
}

// POST /api/accounts/reorder - simpan urutan manual (ala Manager.io reorder)
// body: { orderedIds: string[] } -> sortOrder = index+1 untuk setiap id
export async function PUT(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  try {
    const body = await req.json();
    const orderedIds: string[] = Array.isArray(body.orderedIds) ? body.orderedIds : [];
    if (orderedIds.length === 0) {
      return NextResponse.json({ error: "orderedIds wajib diisi" }, { status: 400 });
    }
    await db.$transaction(
      orderedIds.map((id, idx) =>
        db.account.update({ where: { id }, data: { sortOrder: idx + 1 } })
      )
    );
    return NextResponse.json({ message: `Urutan ${orderedIds.length} akun disimpan` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menyimpan urutan akun" },
      { status: 500 }
    );
  }
}

// POST /api/accounts - buat akun baru
export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  try {
    const body = await req.json();
    const { code, name, type, subtype, parentCode, isGroup, description } = body;

    if (!code || !name || !type) {
      return NextResponse.json({ error: "Code, name, dan type wajib diisi" }, { status: 400 });
    }
    if (!Object.keys(ACCOUNT_TYPES).includes(type)) {
      return NextResponse.json({ error: "Type tidak valid" }, { status: 400 });
    }

    const existing = await db.account.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "Kode akun sudah digunakan" }, { status: 400 });
    }

    // Urutan manual: akun baru diletakkan di akhir grup (sortOrder = max + 1)
    const max = await db.account.aggregate({ _max: { sortOrder: true } });
    const account = await db.account.create({
      data: {
        code,
        name,
        type: type as AccountType,
        subtype: subtype || null,
        parentCode: parentCode || null,
        isGroup: !!isGroup,
        description: description || null,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json({ account });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal membuat akun" },
      { status: 500 }
    );
  }
}
