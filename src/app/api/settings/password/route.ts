import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { logSettingsChange } from "@/lib/settings-log";

// PATCH /api/settings/password - ganti password user yang sedang login
// Body: { currentPassword: string, newPassword: string }
export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 }
    );
  }
  const userId = user.id;

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = body ?? {};

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "currentPassword dan newPassword wajib diisi" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password baru minimal 6 karakter" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Password saat ini salah" },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await logSettingsChange(user, "PASSWORD", "PASSWORD_CHANGED", [], "Password akun diubah");

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal mengganti password" },
      { status: 500 }
    );
  }
}
