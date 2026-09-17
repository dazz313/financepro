import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequestEdge } from "@/lib/auth-edge";

// Proxy (Next.js 16, pengganti middleware): gerbang autentikasi untuk /api/*.
// Endpoint yang memang TIDAK butuh sesi:
// - login/logout (pintu masuk)
// - GET/POST seed (bootstrap pertama kali; DELETE seed tetap butuh ADMIN)
// - POST telegram (webhook dari Telegram, diverifikasi secret token inline)
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const isPublic =
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    (pathname === "/api/seed" && (request.method === "GET" || request.method === "POST")) ||
    (pathname === "/api/telegram" && request.method === "POST");

  if (isPublic) return NextResponse.next();

  const user = await getUserFromRequestEdge(request);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};