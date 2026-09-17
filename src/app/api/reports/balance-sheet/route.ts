import { NextResponse } from "next/server";
import { getAccountBalances, buildBalanceSheet } from "@/lib/reports";

// GET /api/reports/balance-sheet
export async function GET() {
  const accounts = await getAccountBalances();
  const bs = buildBalanceSheet(accounts);
  return NextResponse.json(bs);
}
