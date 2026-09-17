import { NextRequest, NextResponse } from "next/server";
import { buildTemplateCSV, type CsvImportType } from "@/lib/csv-import-types";

// GET /api/csv/template?type=jurnal|penerimaan|pengeluaran|aruskas - download template CSV
export async function GET(req: NextRequest) {
  const typeRaw = new URL(req.url).searchParams.get("type") ?? "jurnal";
  const type: CsvImportType = typeRaw === "jurnal" || typeRaw === "penerimaan" || typeRaw === "pengeluaran" || typeRaw === "aruskas" ? typeRaw : "jurnal";
  const csv = buildTemplateCSV(type);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="template-${type}.csv"`,
    },
  });
}