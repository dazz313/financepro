// Verifikasi JWT ringan untuk middleware (edge/node) — TANPA Prisma/bcrypt.
// Logika secret MIRIP src/lib/auth.ts agar token dari login selalu terverifikasi.
import { jwtVerify } from "jose";

export const AUTH_COOKIE = "financepro_session";
const DEV_FALLBACK_SECRET = "financepro-dev-secret-key-change-in-production-2026";

let _secret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (_secret) return _secret;
  const env = process.env.NEXTAUTH_SECRET;
  if (env && env.trim().length >= 16) {
    _secret = new TextEncoder().encode(env.trim());
    return _secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET belum diset (middleware).");
  }
  _secret = new TextEncoder().encode(DEV_FALLBACK_SECRET);
  return _secret;
}

export type EdgeAuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export async function verifyTokenEdge(token: string): Promise<EdgeAuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as EdgeAuthUser;
  } catch {
    return null;
  }
}

// Baca user dari cookie financepro_session ATAU Authorization: Bearer
export async function getUserFromRequestEdge(req: Request): Promise<EdgeAuthUser | null> {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const user = await verifyTokenEdge(authHeader.slice(7));
    if (user) return user;
  }
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  if (!match) return null;
  return verifyTokenEdge(match[1]);
}
