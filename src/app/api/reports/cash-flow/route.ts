import { NextRequest, NextResponse } from "next/server";
import { buildCashFlow } from "@/lib/reports";

// GET /api/reports/cash-flow?from=&to=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  const cf = await buildCashFlow(fromDate, toDate);
  return NextResponse.json(cf);
}
