import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/settings/counts - jumlah record per fitur (gaya Manager.io)
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const [accounts, taxRules, invoices, users, preferences, journalEntries, logs] =
    await Promise.all([
      db.account.count(),
      db.taxRule.count(),
      db.invoice.count(),
      db.user.count(),
      db.userPreferences.count(),
      db.journalEntry.count(),
      db.settingsLog.count(),
    ]);
  const opening = await db.journalEntry.count({ where: { source: "OPENING" } });

  return NextResponse.json({
    counts: {
      company: 1,
      opening,
      coa: accounts,
      currency: 1,
      fiscal: 1,
      tax: taxRules,
      documents: invoices,
      appearance: preferences,
      security: users,
      data: journalEntries,
      logs,
    },
  });
}