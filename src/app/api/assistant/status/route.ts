import { NextResponse } from "next/server";
import { buildActionItems } from "@/lib/assistant-data";
import { getUserFromRequest } from "@/lib/auth";

// GET /api/assistant/status — return count of action items (lightweight, no AI call)
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const items = await buildActionItems();
  return NextResponse.json({ count: items.length });
}