import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  comparePassword,
  createToken,
  buildSetCookieHeader,
  type AuthUser,
} from "@/lib/auth";
import { rateLimitHit, rateLimitClear, rateLimitSweep } from "@/lib/rate-limit";

const ATTEMPT_LIMIT = 5; // gagal maksimal per email per 15 menit
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// POST /api/auth/login - login dengan email + password, set cookie
export async function POST(req: NextRequest) {
  try {
    rateLimitSweep();

    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi" }, { status: 400 });
    }
    const keyEmail = String(email).toLowerCase().trim();

    // Anti brute-force: batasi percobaan gagal per email
    const check = rateLimitHit(keyEmail, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS);
    if (!check.ok) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi nanti." },
        { status: 429, headers: { "Retry-After": String(check.retryAfterSeconds) } }
      );
    }

    const user = await db.user.findUnique({
      where: { email: keyEmail },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
    }

    // Login sukses → reset counter percobaan gagal
    rateLimitClear(keyEmail);

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = await createToken(authUser);
    // Set cookie HttpOnly (untuk same-origin). Token di JSON tetap dikembalikan
    // untuk integrasi cross-origin, namun client default TIDAK menyimpannya.
    const res = NextResponse.json({ user: authUser, token, message: "Login berhasil" });
    res.headers.set("Set-Cookie", buildSetCookieHeader(token));
    return res;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Gagal masuk" }, { status: 500 });
  }
}
