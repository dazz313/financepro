// Auth berbasis cookie + JWT sederhana (tanpa next-auth, kompatibel Next.js 16 + React 19)
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const DEV_FALLBACK_SECRET = "financepro-dev-secret-key-change-in-production-2026";

export function getAuthSecret(): Uint8Array {
  const env = process.env.NEXTAUTH_SECRET;
  if (env && env.trim().length >= 16) {
    return new TextEncoder().encode(env.trim());
  }
  if (process.env.NODE_ENV === "production") {
    // Fail-closed: tanpa secret yang kuat, produksi menolak membuat/verifikasi token.
    throw new Error(
      "NEXTAUTH_SECRET belum diset. Wajib set NEXTAUTH_SECRET (min. 16 karakter) sebelum deploy."
    );
  }
  console.warn(
    "[auth] NEXTAUTH_SECRET belum diset — memakai fallback DEV-only. Jangan deploy tanpa secret nyata."
  );
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

const SECRET = getAuthSecret();
const COOKIE_NAME = "financepro_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 hari (detik)
// Hanya sertakan Secure di produksi (HTTP lokal/dev tetap berfungsi)
const COOKIE_SECURE = process.env.NODE_ENV === "production" ? " Secure" : "";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

// Buat JWT token
export async function createToken(user: AuthUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(SECRET);
}

// Verifikasi JWT token
export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Bandingkan password
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Ambil user dari request cookie ATAU Authorization header (server-side)
// Mendukung 2 cara auth: cookie (default) atau Bearer token (untuk cross-origin/gateway)
export async function getUserFromRequest(req: Request): Promise<AuthUser | null> {
  // 1. Cek Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = await verifyToken(token);
    if (user) return user;
  }
  // 2. Cek cookie
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifyToken(match[1]);
}

// Helper untuk set cookie header
export function buildSetCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax;${COOKIE_SECURE} Max-Age=${SESSION_MAX_AGE}`;
}

// Helper untuk clear cookie header
export function buildClearCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax;${COOKIE_SECURE} Max-Age=0`;
}

export const AUTH_COOKIE = COOKIE_NAME;
