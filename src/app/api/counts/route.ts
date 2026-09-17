import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/counts - jumlah record per fitur sidebar (gaya Manager.io)
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const [
    bankAccounts,
    receipts,
    payments,
    transfers,
    accounts,
    inventory,
    fixedAssets,
    invoices,
    contacts,
    employees,
    taxRules,
  ] = await Promise.all([
    db.bankAccount.count(),
    db.receipt.count(),
    db.payment.count(),
    db.transfer.count(),
    db.account.count(),
    db.inventoryItem.count(),
    db.fixedAsset.count(),
    db.invoice.count(),
    db.contact.count(),
    db.employee.count(),
    db.taxRule.count(),
  ]);

  return NextResponse.json({
    counts: {
      "bank-accounts": bankAccounts,
      receipts,
      payments,
      transfers,
      accounts,
      inventory,
      "fixed-assets": fixedAssets,
      invoices,
      contacts,
      employees,
      tax: taxRules,
    },
  });
}