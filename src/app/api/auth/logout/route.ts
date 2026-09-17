import { NextResponse } from "next/server";
import { buildClearCookieHeader } from "@/lib/auth";

// POST /api/auth/logout - hapus cookie session
export async function POST() {
  const res = NextResponse.json({ message: "Berhasil keluar" });
  res.headers.set("Set-Cookie", buildClearCookieHeader());
  return res;
}
