import { NextResponse } from "next/server";
import { getAccountBalances, buildTrialBalance } from "@/lib/reports";

// GET /api/reports/trial-balance
export async function GET() {
  const accounts = await getAccountBalances();
  const trial = buildTrialBalance(accounts);
  return NextResponse.json(trial);
}
