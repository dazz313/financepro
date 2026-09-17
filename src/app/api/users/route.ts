import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/types";

// GET /api/users - list semua users (SUPERADMIN only)
export async function GET(req: NextRequest) {
  const caller = await getUserFromRequest(req);
  if (!caller || caller.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya Super Admin yang dapat mengelola user" }, { status: 403 });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}

// POST /api/users - buat user baru (SUPERADMIN only)
export async function POST(req: NextRequest) {
  const caller = await getUserFromRequest(req);
  if (!caller || caller.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Hanya Super Admin yang dapat membuat user" }, { status: 403 });
  }

  try {
    const { email, name, password, role } = await req.json();

    if (!email || !name || !password) {
      return NextResponse.json({ error: "Email, nama, dan password wajib diisi" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
    }

    const userRole = ROLES.includes(role as typeof ROLES[number]) ? role : "ADMIN";

    const existing = await db.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: {
        email: String(email).toLowerCase().trim(),
        name: String(name).trim(),
        passwordHash,
        role: userRole,
        isActive: true,
        preferences: { create: {} },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user, message: "User berhasil dibuat" }, { status: 201 });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Gagal membuat user" }, { status: 500 });
  }
}
