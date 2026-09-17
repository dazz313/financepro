import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

// GET /api/auth/session - ambil user dari cookie
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({ user });
}
