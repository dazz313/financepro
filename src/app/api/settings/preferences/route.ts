import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeChanges, logSettingsChange } from "@/lib/settings-log";

// GET /api/settings/preferences - ambil preferensi user yang login
export async function GET(req: NextRequest) {
  const jwtUser = await getUserFromRequest(req);
  if (!jwtUser) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const dbUser = await db.user.findUnique({ where: { id: jwtUser.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 401 });
  }
  const prefs = await db.userPreferences.upsert({
    where: { userId: dbUser.id },
    update: {},
    create: { userId: dbUser.id },
  });
  return NextResponse.json({ preferences: prefs });
}

// PUT /api/settings/preferences - update preferensi user yang login
export async function PUT(req: NextRequest) {
  const jwtUser = await getUserFromRequest(req);
  if (!jwtUser) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  try {
    const dbUser = await db.user.findUnique({ where: { id: jwtUser.id } });
    if (!dbUser) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 401 });
    }
    const body = await req.json();
    const allowed = ["theme", "density", "numberFormat", "dateFormat"];
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const before = await db.userPreferences.findUnique({ where: { userId: dbUser.id } });
    const prefs = await db.userPreferences.upsert({
      where: { userId: dbUser.id },
      update: data,
      create: { userId: dbUser.id, ...data },
    });

    const changes =
      before && Object.keys(data).length
        ? computeChanges(
            before as unknown as Record<string, unknown>,
            prefs as unknown as Record<string, unknown>
          )
        : [];
    await logSettingsChange(
      jwtUser,
      "PREFERENCES",
      changes.length ? "UPDATE" : "CREATE",
      changes,
      changes.length
        ? `${changes.length} preferensi tampilan diubah`
        : "Preferensi tampilan dibuat"
    );

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memperbarui preferensi" },
      { status: 500 }
    );
  }
}
