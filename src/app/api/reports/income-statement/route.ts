import { NextResponse } from "next/server";
import { getAccountBalances, buildIncomeStatement } from "@/lib/reports";

// GET /api/reports/income-statement
export async function GET() {
  const accounts = await getAccountBalances();
  const is = buildIncomeStatement(accounts);
  return NextResponse.json(is);
}
