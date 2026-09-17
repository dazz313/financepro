import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeChanges, logSettingsChange } from "@/lib/settings-log";
import { renumberDocuments } from "@/lib/renumber-documents";

// GET /api/settings/company - ambil company settings
export async function GET() {
  const settings = await db.companySettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  return NextResponse.json({ settings });
}

// PUT /api/settings/company - update company settings (admin only)
export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Hanya admin yang dapat mengubah pengaturan perusahaan" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const allowed = [
      "name", "legalName", "taxId", "email", "phone", "address", "city", "postalCode", "country",
      "currencyCode", "currencySymbol", "currencyPosition", "decimalPlaces", "thousandSeparator",
      "decimalSeparator", "locale", "fiscalYearStartMonth", "fiscalYearStartDay",
      "defaultTaxRate", "taxIncluded", "ppnEnabled", "bpjsEmployerRate", "logoUrl", "companyCode", "numberingFormat", "invoicePrefix", "invoiceStartNumber",
      "nextInvoiceNumber", "quotePrefix", "quoteStartNumber", "nextQuoteNumber",
      "orderPrefix", "orderStartNumber", "nextOrderNumber",
      "defaultPaymentTermsDays", "invoiceSignature", "invoiceSignatureTitle",
      "invoiceFooterNote", "docGreeting", "docPicName", "docPicPhone", "invoiceBankName", "invoiceBankAccount", "invoiceBankHolder", "invoiceNote",
      "journalPrefix", "journalStartNumber", "nextJournalNumber",
      "openingPrefix", "openingStartNumber", "nextOpeningNumber",
      "receiptPrefix", "receiptStartNumber", "nextReceiptNumber",
      "paymentPrefix", "paymentStartNumber", "nextPaymentNumber",
      "transferPrefix", "transferStartNumber", "nextTransferNumber",
      "payrollPrefix", "payrollStartNumber", "nextPayrollNumber",
      "reimbursementPrefix", "reimbursementStartNumber", "nextReimbursementNumber",
      "loanPrefix", "loanStartNumber", "nextLoanNumber",
      "employeePrefix", "employeeStartNumber", "nextEmployeeNumber",
      "contactPrefix", "contactStartNumber", "nextContactNumber",
      "bankAccountPrefix", "bankAccountStartNumber", "nextBankAccountNumber",
      "fixedAssetPrefix", "fixedAssetStartNumber", "nextFixedAssetNumber",
      "inventoryItemPrefix", "inventoryItemStartNumber", "nextInventoryItemNumber",
    ];
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const before = await db.companySettings.findUnique({ where: { id: "default" } });
    const settings = await db.companySettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    const changes =
      before && Object.keys(data).length
        ? computeChanges(
            before as unknown as Record<string, unknown>,
            settings as unknown as Record<string, unknown>
          )
        : [];
    await logSettingsChange(
      user,
      "COMPANY",
      changes.length ? "UPDATE" : "CREATE",
      changes,
      changes.length
        ? `${changes.length} pengaturan perusahaan diubah`
        : "Pengaturan perusahaan dibuat"
    );

    // Kode perusahaan berubah → nomor dokumen lama ikut dinomori ulang
    // (invoice, penerimaan, pembayaran, transfer, payroll, reimburse, kasbon,
    // dan nomor jurnal). Idempotent: bolak-balik ke kode awal akan mengembalikan
    // nomor seperti semula.
    let renumber: Record<string, number> | undefined;
    if (
      before &&
      body.companyCode !== undefined &&
      String(before.companyCode ?? "") !== String(body.companyCode)
    ) {
      try {
        renumber = await renumberDocuments(
          String(before.companyCode ?? ""),
          String(body.companyCode),
          before.numberingFormat || "{prefix}-{companyCode}-{year}-{month}-{seq}"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gagal menomori ulang dokumen";
        console.error("Renumber error:", message);
        return NextResponse.json(
          { settings, renumberError: message, error: `Kode disimpan, tetapi penomoran ulang gagal: ${message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ settings, renumber });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memperbarui pengaturan" },
      { status: 500 }
    );
  }
}
