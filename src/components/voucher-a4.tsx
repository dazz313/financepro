"use client";

// Dokumen A4 "surat" untuk Penerimaan (Kuitansi) & Pembayaran (Bukti Pembayaran),
// mirip preview invoice: kop perusahaan, nomor surat, judul dokumen, ukuran A4.

import * as React from "react";
import { Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSettingsStore } from "@/lib/settings-store";
import type { CompanySettings } from "@/lib/types";
import { escapeHtml, printDocumentHTML } from "@/lib/print-a4";

export type VoucherDoc = {
  kind: "receipt" | "payment" | "transfer";
  number: string;
  date: string;
  amount: number;
  contactName: string | null;
  contactAddress?: string | null;
  bankName: string;
  accountCode: string;
  accountName: string;
  reference: string | null;
  invoiceNumber: string | null;
  description: string | null;
  lines?: {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    taxAmount?: number;
  }[];
  footnote?: string | null;
  customTitle?: string | null;
  themeColor?: string | null;
  // Transfer antar akun
  fromName?: string | null;
  toName?: string | null;
  fromCode?: string | null;
  toCode?: string | null;
};

function formatMoney(v: number): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

export function buildVoucherHTML(doc: VoucherDoc, company: CompanySettings | null): string {
  const isReceipt = doc.kind === "receipt";
  const isTransfer = doc.kind === "transfer";
  const defaultTitle = isTransfer ? "Transfer Antar Akun" : isReceipt ? "Penerimaan" : "Pembayaran";
  const docTitle = doc.customTitle || defaultTitle;
  const companyName = company?.legalName || company?.name || "Perusahaan Saya";
  const hasLines = (doc.lines ?? []).length > 0;

  const contactAddress = doc.contactAddress || "";
  const companyAddress = company?.address || "";
  const companyCity = company?.city || "";
  const companyEmail = company?.email || "";

  const headerHTML = isTransfer ? `
    <div class="doc-header">
      ${company?.logoUrl ? `<div class="doc-logo"><img src="${escapeHtml(company.logoUrl)}" alt="Logo" style="height:56px;width:56px;object-fit:contain"/></div>` : ""}
      <div class="left">
        <div class="h-label">Dari</div>
        <div class="h-name">${escapeHtml(doc.fromName || "—")}</div>
        ${doc.fromCode ? `<div class="h-info">${escapeHtml(doc.fromCode)}</div>` : ""}
      </div>
      <div class="center">
        <div class="h-label">Tanggal</div>
        <div class="h-value">${escapeHtml(doc.date)}</div>
        <div class="h-label" style="margin-top:4px">Nomor</div>
        <div class="h-value">${escapeHtml(doc.number)}</div>
      </div>
      <div class="right">
        <div class="h-name">${escapeHtml(companyName)}</div>
        ${companyAddress ? `<div class="h-info">Head Office : ${escapeHtml(companyAddress)}</div>` : ""}
        ${companyCity ? `<div class="h-info">${escapeHtml(companyCity)}</div>` : ""}
        ${companyEmail ? `<div class="h-info">Email : ${escapeHtml(companyEmail)}</div>` : ""}
      </div>
    </div>`
    : `
    <div class="doc-header">
      ${company?.logoUrl ? `<div class="doc-logo"><img src="${escapeHtml(company.logoUrl)}" alt="Logo" style="height:56px;width:56px;object-fit:contain"/></div>` : ""}
      <div class="left">
        <div class="h-name">${escapeHtml(doc.contactName || "—")}</div>
        ${contactAddress ? `<div class="h-info">${escapeHtml(contactAddress)}</div>` : ""}
      </div>
      <div class="center">
        <div class="h-label">Tanggal</div>
        <div class="h-value">${escapeHtml(doc.date)}</div>
        <div class="h-label" style="margin-top:4px">Nomor</div>
        <div class="h-value">${escapeHtml(doc.number)}</div>
      </div>
      <div class="right">
        <div class="h-name">${escapeHtml(companyName)}</div>
        ${companyAddress ? `<div class="h-info">Head Office : ${escapeHtml(companyAddress)}</div>` : ""}
        ${companyCity ? `<div class="h-info">${escapeHtml(companyCity)}</div>` : ""}
        ${companyEmail ? `<div class="h-info">Email : ${escapeHtml(companyEmail)}</div>` : ""}
      </div>
    </div>`;

  const greeting = company?.docGreeting || "Hormat kami,";
  const picName = company?.docPicName || "";
  const picPhone = company?.docPicPhone || "";

  const footerHTML = `
    <div class="doc-footer">
      <div class="row">
        <span><strong>${escapeHtml(companyName)}</strong></span>
        <span>${company?.phone ? "Telp: " + escapeHtml(company.phone) : ""} ${company?.email ? " · " + escapeHtml(company.email) : ""} ${company?.taxId ? " · NPWP: " + escapeHtml(company.taxId) : ""}</span>
      </div>
      <div style="margin-top:4mm;font-size:11px">
        <div>${escapeHtml(greeting)}</div>
        ${picName ? `<div style="margin-top:8mm;border-top:1px solid #999;padding-top:4px;width:200px"><strong>${escapeHtml(picName)}</strong>${picPhone ? `<div style="font-size:10px;color:#555">PIC: ${escapeHtml(picPhone)}</div>` : ""}</div>` : ""}
      </div>
      <div class="row" style="margin-top:6mm;align-items:center;justify-content:center;gap:12px;border-top:1px solid #ccc;padding-top:4px">
        <span style="display:inline-flex;align-items:center;gap:4px"><img src="/sheets/brands/fb.png" alt="FB" style="height:14px;width:14px;object-fit:contain"/> Dastech Group</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><img src="/sheets/brands/gmail.png" alt="Email" style="height:14px;width:14px;object-fit:contain"/> ${escapeHtml(companyEmail || "dastechgroup@gmail.com")}</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><img src="/sheets/brands/ig.png" alt="IG" style="height:14px;width:14px;object-fit:contain"/> @dastechgroup</span>
      </div>
    </div>`;

  const descHTML = doc.description
    ? `<div class="doc-desc">${escapeHtml(doc.description)}</div>`
    : "";

  const accountLabel = isReceipt ? "Akun" : "Akun";
  const tableHTML = isTransfer
    ? `
    <table class="clean-table">
      <thead>
        <tr>
          <th></th>
          <th class="num" style="width:120px">Jumlah</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Dari</strong> — ${escapeHtml(doc.fromName || "—")}${doc.fromCode ? ` (${escapeHtml(doc.fromCode)})` : ""}</td>
          <td rowspan="2" class="num" style="vertical-align:middle"><strong>Rp ${formatMoney(doc.amount)}</strong></td>
        </tr>
        <tr>
          <td><strong>Ke</strong> — ${escapeHtml(doc.toName || "—")}${doc.toCode ? ` (${escapeHtml(doc.toCode)})` : ""}</td>
        </tr>
      </tbody>
    </table>`
    : hasLines
    ? `
    <table class="clean-table">
      <thead>
        <tr>
          <th style="width:32px" class="ctr">No</th>
          <th>Deskripsi</th>
          <th style="width:64px" class="num">Kuantitas</th>
          <th style="width:110px" class="num">Harga Satuan</th>
          <th style="width:120px" class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(doc.lines ?? []).map((l, i) => `
          <tr>
            <td class="ctr">${i + 1}</td>
            <td>${escapeHtml(l.description)}</td>
            <td class="num">${formatMoney(l.quantity)}</td>
            <td class="num">Rp ${formatMoney(l.unitPrice)}</td>
            <td class="num"><strong>Rp ${formatMoney(l.amount + (l.taxAmount ?? 0))}</strong></td>
          </tr>`).join("\n")}
      </tbody>
    </table>`
    : `
    <table class="clean-table">
      <thead>
        <tr>
          <th>${accountLabel}</th>
          <th style="width:140px" class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(doc.accountCode)} - ${escapeHtml(doc.accountName)}${doc.contactName ? ` — ${escapeHtml(doc.contactName)}` : ""}${doc.invoiceNumber ? ` — ${escapeHtml(doc.invoiceNumber)}` : ""}${doc.reference ? ` — ${escapeHtml(doc.reference)}` : ""}</td>
          <td class="num">Rp ${formatMoney(doc.amount)}</td>
        </tr>
      </tbody>
    </table>`;

  const totalsHTML = `
    <div class="clean-totals">
      <table>
        <tr class="t-bold">
          <td class="t-label">Total</td>
          <td class="t-value">Rp ${formatMoney(doc.amount)}</td>
        </tr>
      </table>
    </div>`;

  const noteHTML = doc.footnote
    ? `<div style="margin-top:4mm;font-size:11px;color:#555"><strong>Catatan:</strong> ${escapeHtml(doc.footnote)}</div>`
    : "";

  return `<div class="sheet-content">
    ${headerHTML}
    ${descHTML}
    ${tableHTML}
    ${totalsHTML}
    ${noteHTML}
  </div>
  ${footerHTML}`;
}

export function printVoucherHTML(html: string, title: string) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) {
    toast.error("Popup diblokir browser. Izinkan popup untuk mencetak.");
    return;
  }
  w.document.open();
  w.document.write(printDocumentHTML(html, title));
  w.document.close();
}

// Helper cetak untuk DocToolbar: bangun HTML voucher + buka window print.
export function printVoucherDoc(doc: VoucherDoc, company: CompanySettings | null) {
  const kindLabel =
    doc.kind === "transfer" ? "Transfer" : doc.kind === "receipt" ? "Penerimaan" : "Pembayaran";
  printVoucherHTML(buildVoucherHTML(doc, company), `${kindLabel} ${doc.number}`);
}

// Tampilan on-screen A4 (memakai class .invoice-printable dari globals.css)
export function VoucherSheet({ doc, company }: { doc: VoucherDoc; company: CompanySettings | null }) {
  const html = React.useMemo(() => buildVoucherHTML(doc, company), [doc, company]);
  return (
    <div className="invoice-printable bg-white" style={{ width: "100%", maxWidth: "180mm", margin: "0 auto" }} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

// Tombol Cetak/PDF untuk dipakai di detail dialog
export function PrintVoucherButtons({ doc, company }: { doc: VoucherDoc; company: CompanySettings | null }) {
  const title = `${doc.kind === "receipt" ? "Penerimaan" : "Pembayaran"} ${doc.number}`;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => printVoucherHTML(buildVoucherHTML(doc, company), title)}>
        <FileDown className="mr-2 h-3.5 w-3.5" /> PDF
      </Button>
      <Button size="sm" onClick={() => printVoucherHTML(buildVoucherHTML(doc, company), title)} className="bg-emerald-600 hover:bg-emerald-700">
        <Printer className="mr-2 h-3.5 w-3.5" /> Cetak
      </Button>
    </>
  );
}

// Helpers untuk detail dialog: ambil data perusahaan dari store
export function useVoucherCompany() {
  return useSettingsStore((s) => s.company);
}