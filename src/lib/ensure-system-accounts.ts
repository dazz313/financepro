import { db } from "@/lib/db";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@/lib/seed-data";

// Akun sistem yang wajib ada agar modul (payroll, kasbon, bunga) mencatat
// jurnal dengan klasifikasi akuntansi yang benar. Bila belum ada di CoA
// (mis. DB yang sudah terisi sebelum akun ini diperkenalkan), dibuat otomatis
// tanpa mengubah/menghapus data yang ada.
export const EXTRA_SYSTEM_ACCOUNTS = ["1-1700", "2-1500", "4-2200"] as const;

export async function ensureSystemAccounts(
  codes: readonly string[] = EXTRA_SYSTEM_ACCOUNTS
): Promise<void> {
  const wanted = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => (codes as readonly string[]).includes(a.code));
  if (wanted.length === 0) return;

  const existing = await db.account.findMany({
    where: { code: { in: wanted.map((a) => a.code) } },
    select: { code: true },
  });
  const existingSet = new Set(existing.map((a) => a.code));
  const toCreate = wanted.filter((a) => !existingSet.has(a.code));
  if (toCreate.length === 0) return;

  // Peta parentCode → tersedia (hanya pasang parent yang benar-benar ada)
  const parentCodes = Array.from(new Set(toCreate.filter((a) => a.parentCode).map((a) => a.parentCode!)));
  const parents = parentCodes.length
    ? await db.account.findMany({ where: { code: { in: parentCodes } }, select: { code: true } })
    : [];
  const parentSet = new Set(parents.map((p) => p.code));

  for (const def of toCreate) {
    const parentCode = def.parentCode && parentSet.has(def.parentCode) ? def.parentCode : null;
    await db.account.create({
      data: {
        code: def.code,
        name: def.name,
        type: def.type,
        subtype: def.subtype,
        parentCode,
        isGroup: def.isGroup,
      },
    });
  }
}