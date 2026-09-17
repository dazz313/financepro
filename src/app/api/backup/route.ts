import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dumpAll, serializeBackup } from "@/lib/backup";
import { getUserFromRequest } from "@/lib/auth";

// GET /api/backup - unduh backup seluruh data (gzip JSON), download file .financepro
// Hanya admin.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const tables = await dumpAll();
    const buf = serializeBackup(tables);
    const filename = `financepro-backup-${new Date().toISOString().slice(0, 10)}.financepro`;

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal membuat backup" }, { status: 500 });
  }
}