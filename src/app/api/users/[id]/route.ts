import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/types";

// PATCH /api/users/[id] - update user (SUPERADMIN only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getUserFromRequest(req);
  if (!caller || caller.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya Super Admin yang dapat mengubah user" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, email, role, isActive, password } = body;

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (email !== undefined) {
      const newEmail = String(email).toLowerCase().trim();
      if (newEmail !== existing.email) {
        const dup = await db.user.findUnique({ where: { email: newEmail } });
        if (dup) return NextResponse.json({ error: "Email sudah digunakan" }, { status: 409 });
        data.email = newEmail;
      }
    }
    if (role !== undefined && ROLES.includes(role)) data.role = role;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (password && String(password).length >= 8) {
      data.passwordHash = await hashPassword(String(password));
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updated, message: "User berhasil diupdate" });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Gagal mengupdate user" }, { status: 500 });
  }
}

// DELETE /api/users/[id] - nonaktifkan user (SUPERADMIN only, tidak bisa hapus diri sendiri)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getUserFromRequest(req);
  if (!caller || caller.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya Super Admin yang dapat menghapus user" }, { status: 403 });
  }

  const { id } = await params;

  if (caller.id === id) {
    return NextResponse.json({ error: "Tidak bisa menonaktifkan akun sendiri" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  }

  await db.user.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ message: "User berhasil dinonaktifkan" });
}
