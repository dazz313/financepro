import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { clearAllData, restoreFromTables, parseBackup } from "@/lib/backup";

// POST /api/backup/restore - restore dari file backup (multipart "file")
// PERINGATAN: menghapus semua data yang ada lalu membuat ulang dari backup.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "File backup wajib diisi" }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file maksimal 50 MB" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const backup = parseBackup(buf); // throws bila format tidak valid
    const counts = Object.entries(backup.tables).reduce<Record<string, number>>((acc, [k, v]) => {
      acc[k] = Array.isArray(v) ? v.length : 0;
      return acc;
    }, {});

    await db.$transaction(async (tx) => {
      await clearAllData(tx);
      await restoreFromTables(backup.tables, tx);
    });

    return NextResponse.json({
      message: "Restore berhasil",
      exportedAt: backup.exportedAt,
      counts,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal restore data" }, { status: 500 });
  }
}