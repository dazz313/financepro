import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/settings/logs - riwayat perubahan pengaturan (admin only)
// Query: ?limit=50&section=COMPANY
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
    return NextResponse.json(
      { error: "Hanya admin yang dapat melihat riwayat pengaturan" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(500, Number(searchParams.get("limit")) || 200));
  const section = searchParams.get("section") || undefined;

  const logs = await db.settingsLog.findMany({
    where: section ? { section } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      section: l.section,
      action: l.action,
      summary: l.summary,
      changes: l.changes ? JSON.parse(l.changes) : [],
      createdAt: l.createdAt,
      userName: l.user?.name ?? null,
      userEmail: l.user?.email ?? null,
    })),
    count: logs.length,
  });
}