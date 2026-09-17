import { NextResponse } from "next/server";
import { buildDashboardKPIs } from "@/lib/reports";

// GET /api/dashboard
export async function GET() {
  try {
    const kpis = await buildDashboardKPIs();
    return NextResponse.json(kpis);
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memuat dashboard" },
      { status: 500 }
    );
  }
}
