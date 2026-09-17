"use client";

import * as React from "react";
import { Printer, FileDown, Settings2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSettingsStore } from "@/lib/settings-store";
import { toast } from "sonner";
import { printDocumentHTML } from "@/lib/print-a4";

const INVOICE_EXTRA_CSS = `
  .meta-grid { display: grid; grid-template-columns: 1fr auto; gap: 24px; margin-top: 4mm; }
`;

export type InvoicePreviewData = {
  number: string;
  type: string;
  documentType?: string; // QUOTE | ORDER | INVOICE
  date: string;
  dueDate: string | null;
  status: string;
  notes: string | null;
  subtotal: number;
  discount?: number;
  taxRate: number;
  taxAmount: number;
  withholdingRate?: number;
  total: number;
  paidAmount: number;
  payments?: { date: string; amount: number }[];
  footnote?: string | null;
  customTitle?: string | null;
  showDescription?: boolean;
  contact: { name: string; email?: string | null; phone?: string | null; address?: string | null; taxId?: string | null };
  lines: { id: string; description: string; quantity: number; unit?: string | null; unitPrice: number; amount: number }[];
};

function formatMoney(v: number): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

// Format tanggal dokumen: ISO → "dd-MM-yyyy" (mis. 15-04-2026)
function fmtDocDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// Konversi angka ke terbilang Bahasa Indonesia (sederhana, sampai triliun)
function terbilang(n: number): string {
  n = Math.floor(Math.abs(n));
  const bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const konversi = (x: number): string => {
    if (x < 12) return bilangan[x];
    if (x < 20) return bilangan[x - 10] + " belas";
    if (x < 100) return bilangan[Math.floor(x / 10)] + " puluh" + (x % 10 ? " " + bilangan[x % 10] : "");
    if (x < 200) return "seratus" + (x - 100 ? " " + konversi(x - 100) : "");
    if (x < 1000) return bilangan[Math.floor(x / 100)] + " ratus" + (x % 100 ? " " + konversi(x % 100) : "");
    if (x < 2000) return "seribu" + (x - 1000 ? " " + konversi(x - 1000) : "");
    if (x < 1000000) return konversi(Math.floor(x / 1000)) + " ribu" + (x % 1000 ? " " + konversi(x % 1000) : "");
    if (x < 1000000000) return konversi(Math.floor(x / 1000000)) + " juta" + (x % 1000000 ? " " + konversi(x % 1000000) : "");
    if (x < 1000000000000) return konversi(Math.floor(x / 1000000000)) + " miliar" + (x % 1000000000 ? " " + konversi(x % 1000000000) : "");
    return konversi(Math.floor(x / 1000000000000)) + " triliun" + (x % 1000000000000 ? " " + konversi(x % 1000000000000) : "");
  };
  const hasil = konversi(n).trim();
  return hasil.charAt(0).toUpperCase() + hasil.slice(1) + " rupiah";
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "DRAFT",
  SENT: "TERKIRIM",
  PAID: "LUNAS",
  OVERDUE: "JATUH TEMPO",
  CANCELLED: "DIBATALKAN",
};

type DisplayOptions = {
  showLogo: boolean;
  showLetterhead: boolean;
  showDueDate: boolean;
  showTax: boolean;
  showWithholding: boolean;
  showTerbilang: boolean;
  showSignature: boolean;
  showNotes: boolean;
  showBankAccount: boolean;
  showFooterNote: boolean;
};

const DEFAULT_OPTIONS: DisplayOptions = {
  showLogo: true,
  showLetterhead: true,
  showDueDate: true,
  showTax: true,
  showWithholding: true,
  showTerbilang: true,
  showSignature: true,
  showNotes: true,
  showBankAccount: true,
  showFooterNote: true,
};

function OptionRow({
  k,
  label,
  checked,
  onToggle,
}: {
  k: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox id={`opt-${k}`} checked={checked} onCheckedChange={onToggle} />
      <Label htmlFor={`opt-${k}`} className="cursor-pointer text-xs font-normal">{label}</Label>
    </div>
  );
}

export function InvoicePreviewDialog({
  invoice,
  open,
  onOpenChange,
  onEdit,
}: {
  invoice: InvoicePreviewData | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit?: (inv: InvoicePreviewData) => void;
}) {
  const company = useSettingsStore((s) => s.company);
  const [opts, setOpts] = React.useState<DisplayOptions>(DEFAULT_OPTIONS);
  const printRef = React.useRef<HTMLDivElement>(null);

  // PDF / Cetak: buka window baru, tulis HTML dokumen + CSS inline, lalu print.
  // Pendekatan ini reliable & terisolasi dari Radix Dialog portal (yang sering
  // memblokir window.print() bawaan karena overlay/inert).
  const handlePrint = React.useCallback(() => {
    const node = printRef.current;
    if (!node) return;
    const html = node.innerHTML;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) {
      toast.error("Popup diblokir browser. Izinkan popup untuk mencetak.");
      return;
    }
    w.document.open();
    w.document.write(printDocumentHTML(html, "Invoice", INVOICE_EXTRA_CSS));
    w.document.close();
  }, []);

  const toggle = (k: keyof DisplayOptions) => setOpts((p) => ({ ...p, [k]: !p[k] }));

  if (!invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent><DialogTitle className="sr-only">Invoice</DialogTitle></DialogContent>
      </Dialog>
    );
  }

  const isSales = invoice.type === "SALES";
  const docType = (invoice.documentType || "INVOICE").toUpperCase();
  // Judul dokumen berbeda per jenis: Penawaran / Pesanan / Faktur
  const TITLE_MAP: Record<string, { sales: string; purchase: string }> = {
    QUOTE: { sales: "PENAWARAN PENJUALAN", purchase: "PERMINTAAN PENAWARAN" },
    ORDER: { sales: "PESANAN PENJUALAN", purchase: "PESANAN PEMBELIAN" },
    INVOICE: { sales: "FAKTUR PENJUALAN", purchase: "FAKTUR PEMBELIAN" },
  };
  const docTitle = (TITLE_MAP[docType] ?? TITLE_MAP.INVOICE)[isSales ? "sales" : "purchase"];
  const remaining = invoice.total - invoice.paidAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        <DialogTitle className="sr-only">Pratinjau {docTitle} {invoice.number}</DialogTitle>
        {/* Action bar */}
        <div className="no-print sticky top-0 z-20 flex items-center justify-end border-b bg-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <Settings2 className="mr-2 h-3.5 w-3.5" /> Opsi Tampilan
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-0.5">
                  <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tampilkan / Sembunyikan</p>
                  <OptionRow k="showLogo" label="Logo Perusahaan" checked={opts.showLogo} onToggle={() => toggle("showLogo")} />
                  <OptionRow k="showLetterhead" label="Kop & Info Perusahaan" checked={opts.showLetterhead} onToggle={() => toggle("showLetterhead")} />
                  <OptionRow k="showDueDate" label="Tanggal Jatuh Tempo" checked={opts.showDueDate} onToggle={() => toggle("showDueDate")} />
                  <OptionRow k="showTax" label="PPN (Pajak Pertambahan Nilai)" checked={opts.showTax} onToggle={() => toggle("showTax")} />
                  <OptionRow k="showWithholding" label="PPh (Potongan Pajak Penghasilan)" checked={opts.showWithholding} onToggle={() => toggle("showWithholding")} />
                  <OptionRow k="showTerbilang" label="Terbilang (jumlah huruf)" checked={opts.showTerbilang} onToggle={() => toggle("showTerbilang")} />
                  <OptionRow k="showSignature" label="Kolom Tanda Tangan" checked={opts.showSignature} onToggle={() => toggle("showSignature")} />
                  <OptionRow k="showNotes" label="Catatan Invoice" checked={opts.showNotes} onToggle={() => toggle("showNotes")} />
                  <OptionRow k="showBankAccount" label="Akun Bank Pembayaran" checked={opts.showBankAccount} onToggle={() => toggle("showBankAccount")} />
                  <OptionRow k="showFooterNote" label="Catatan Kaki Default" checked={opts.showFooterNote} onToggle={() => toggle("showFooterNote")} />
                </div>
              </PopoverContent>
            </Popover>
            {onEdit && (
              <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); onEdit(invoice); }}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Sunting
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <FileDown className="mr-2 h-3.5 w-3.5" /> PDF
            </Button>
            <Button size="sm" onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700">
              <Printer className="mr-2 h-3.5 w-3.5" /> Cetak
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          </div>
        </div>

        {/* Printable document — di-render via dangerouslySetInnerHTML agar HTML identik untuk on-screen & print window */}
        <div
          ref={printRef}
          className="invoice-printable bg-white"
          style={{ width: "100%", maxWidth: "180mm", margin: "0 auto" }}
          dangerouslySetInnerHTML={{ __html: buildInvoiceHTML(invoice, company, opts, docTitle, docType, remaining) }}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Helper: build HTML string dokumen invoice ----------
// HTML ini dipakai untuk tampilan on-screen (div.dangerouslySetInnerHTML) DAN
// untuk window print baru. CSS ada di globals.css (.invoice-printable) dan
// di-inline di handlePrint untuk window baru.
function buildInvoiceHTML(
  invoice: InvoicePreviewData,
  company: ReturnType<typeof useSettingsStore.getState>["company"],
  opts: DisplayOptions,
  docTitle: string,
  docType: string,
  remaining: number
): string {
  const isSales = invoice.type === "SALES";
  const companyName = company?.legalName || company?.name || "Perusahaan Saya";
  const docTitleFinal = invoice.customTitle || docTitle;
  const statusLabel = STATUS_LABEL[invoice.status] ?? invoice.status;

  const contactAddress = invoice.contact.address || "";
  const companyAddress = company?.address || "";
  const companyCity = company?.city || "";
  const companyEmail = company?.email || "";

  const headerHTML = `
    <div class="doc-header">
      ${opts.showLogo && company?.logoUrl ? `<div class="doc-logo"><img src="${escapeHtml(company.logoUrl)}" alt="Logo" style="height:56px;width:56px;object-fit:contain"/></div>` : ""}
      <div class="left">
        <div class="h-name">${escapeHtml(invoice.contact.name)}</div>
        ${contactAddress ? `<div class="h-info">${escapeHtml(contactAddress)}</div>` : ""}
        ${invoice.contact.phone ? `<div class="h-info">Telp: ${escapeHtml(invoice.contact.phone)}</div>` : ""}
        ${invoice.contact.email ? `<div class="h-info">${escapeHtml(invoice.contact.email)}</div>` : ""}
      </div>
      <div class="center">
        <div class="h-label">Tanggal Faktur</div>
        <div class="h-value">${escapeHtml(invoice.date)}</div>
        ${docType !== "QUOTE" && opts.showDueDate && invoice.dueDate ? `
        <div class="h-label" style="margin-top:4px">Tanggal Jatuh Tempo</div>
        <div class="h-value">${escapeHtml(invoice.dueDate)}</div>` : ""}
        <div class="h-label" style="margin-top:4px">Nomor Invoice</div>
        <div class="h-value">${escapeHtml(invoice.number)}</div>
      </div>
      <div class="right">
        ${opts.showLetterhead ? `
        <div class="h-name">${escapeHtml(companyName)}</div>
        ${companyAddress ? `<div class="h-info">Head Office : ${escapeHtml(companyAddress)}</div>` : ""}
        ${companyCity ? `<div class="h-info">${escapeHtml(companyCity)}</div>` : ""}
        ${companyEmail ? `<div class="h-info">Email : ${escapeHtml(companyEmail)}</div>` : ""}
        ` : `<div class="h-name">&nbsp;</div>`}
      </div>
    </div>`;

  // Deskripsi invoice selalu tampil di atas tabel (kolom "Deskripsi Barang").
  // Opsi "Tanpa Deskripsi" menyembunyikannya beserta isi kolom deskripsi baris.
  const showDesc = invoice.showDescription !== false;
  const descHTML = showDesc && invoice.notes
    ? `<div class="doc-desc">${escapeHtml(invoice.notes)}</div>`
    : "";

  const itemRows = invoice.lines.map((l, i) => `
    <tr>
      <td>${showDesc ? escapeHtml(l.description) : "&nbsp;"}</td>
      <td>${escapeHtml((l as Record<string, unknown>).accountName as string || "—")}</td>
      <td class="num">${l.quantity}</td>
      <td class="num">Rp ${formatMoney(l.unitPrice)}</td>
      <td class="num"><strong>Rp ${formatMoney(l.amount)}</strong></td>
    </tr>`).join("");

  const emptyRows = invoice.lines.length < 4
    ? Array.from({ length: 4 - invoice.lines.length }).map(() => `
      <tr style="color:#ccc">
        <td>&nbsp;</td><td></td><td></td><td></td><td></td>
      </tr>`).join("")
    : "";

  const tableHTML = `
    <table class="clean-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Akun</th>
          <th style="width:64px" class="num">Kuantitas</th>
          <th style="width:110px" class="num">Harga Satuan</th>
          <th style="width:120px" class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}${emptyRows}
      </tbody>
    </table>`;

  const isInvoice = docType === "INVOICE";
  // Rincian perhitungan ala Manager.io: Subtotal → Diskon → PPN → PPh 23 → Total.
  const grossBeforeWithhold = invoice.subtotal - (invoice.discount ?? 0) + invoice.taxAmount;
  const withholdingRate = invoice.withholdingRate ?? 0;
  const withholdingAmount =
    withholdingRate > 0 ? (grossBeforeWithhold * withholdingRate) / 100 : 0;
  const breakdownRows = `
    <tr>
      <td colspan="4" class="t-label">Subtotal</td>
      <td class="t-value">Rp ${formatMoney(invoice.subtotal)}</td>
    </tr>
    ${(invoice.discount ?? 0) > 0 ? `
    <tr>
      <td colspan="4" class="t-label">Diskon</td>
      <td class="t-value">- Rp ${formatMoney(invoice.discount ?? 0)}</td>
    </tr>` : ""}
    ${opts.showTax && invoice.taxRate > 0 ? `
    <tr>
      <td colspan="4" class="t-label">PPN ${invoice.taxRate}%</td>
      <td class="t-value">Rp ${formatMoney(invoice.taxAmount)}</td>
    </tr>` : ""}
    ${opts.showWithholding && withholdingAmount > 0 ? `
    <tr>
      <td colspan="4" class="t-label">PPh 23 ${withholdingRate}%</td>
      <td class="t-value">- Rp ${formatMoney(withholdingAmount)}</td>
    </tr>` : ""}
  `;
  // Riwayat pembayaran ("-Pembayaran"/"-Penerimaan" per tanggal) sehingga saldo
  // jatuh tempo otomatis menjadi 0 saat lunas. Fallback ke paidAmount + tanggal invoice.
  const paymentLabel = isSales ? "Penerimaan" : "Pembayaran";
  const paymentList: { date: string; amount: number }[] =
    invoice.payments && invoice.payments.length > 0
      ? invoice.payments
      : invoice.paidAmount > 0
      ? [{ date: invoice.date, amount: invoice.paidAmount }]
      : [];
  const paymentRows = paymentList
    .map(
      (p) => `
    <tr>
      <td colspan="4" class="t-label">${paymentLabel} — ${fmtDocDate(p.date)}</td>
      <td class="t-value">- Rp ${formatMoney(p.amount)}</td>
    </tr>`
    )
    .join("");
  const paidRows = isInvoice ? `
    ${breakdownRows}
    <tr class="t-bold">
      <td colspan="4" class="t-label">Total</td>
      <td class="t-value"><strong>Rp ${formatMoney(invoice.total)}</strong></td>
    </tr>
    ${paymentRows}
    ${remaining <= 0 ? `
    <tr>
      <td colspan="4" class="t-label t-bold">Saldo Jatuh Tempo</td>
      <td class="t-value t-bold">Rp 0.00</td>
    </tr>` : `
    <tr>
      <td colspan="4" class="t-label t-bold">Saldo Jatuh Tempo</td>
      <td class="t-value t-bold">Rp ${formatMoney(remaining)}</td>
    </tr>`}
  ` : `
    ${breakdownRows}
    <tr class="t-bold">
      <td colspan="4" class="t-label">Total</td>
      <td class="t-value">Rp ${formatMoney(invoice.total)}</td>
    </tr>`;

  const totalsHTML = `
    <div class="clean-totals">
      <table>
        ${paidRows}
      </table>
    </div>`;

  const statusHTML = isInvoice && remaining <= 0
    ? `<div class="clean-status"><span>LUNAS</span></div>`
    : "";

  // Opsi dokumen ala Manager.io. Konten ini dibuat & diedit di Pengaturan →
  // Faktur & Jurnal (terbilang, akun bank, catatan invoice, catatan kaki, tanda tangan, PIC).
  const terbilangHTML = opts.showTerbilang
    ? `<div style="margin-top:4mm;font-size:11px"><strong>Terbilang:</strong> ${terbilang(invoice.total)}</div>`
    : "";
  // Catatan Invoice: teks terpisah dari deskripsi, dikelola di Pengaturan
  // (mis. kebijakan retur). Opsi "Catatan Invoice" mengontrol tampil/tidaknya.
  const invoiceNoteHTML = opts.showNotes && company?.invoiceNote
    ? `<div style="margin-top:4mm;font-size:11px"><strong>Catatan:</strong> ${escapeHtml(company.invoiceNote)}</div>`
    : "";
  const bankHTML = opts.showBankAccount && (company?.invoiceBankName || company?.invoiceBankAccount || company?.invoiceBankHolder)
    ? `<div style="margin-top:4mm;font-size:11px">
        <strong>Pembayaran Via Transfer:</strong><br/>
        ${company.invoiceBankName ? escapeHtml(company.invoiceBankName) : ""}
        ${company.invoiceBankAccount ? ` &nbsp;·&nbsp; ${escapeHtml(company.invoiceBankAccount)}` : ""}
        ${company.invoiceBankHolder ? ` &nbsp;a.n. ${escapeHtml(company.invoiceBankHolder)}` : ""}
      </div>`
    : "";
  const footerNoteHTML = opts.showFooterNote && company?.invoiceFooterNote
    ? `<div style="margin-top:4mm;font-size:11px;color:#555"><strong>Catatan Kaki:</strong> ${escapeHtml(company.invoiceFooterNote)}</div>`
    : "";

  const greeting = company?.docGreeting || "Hormat kami,";
  const picName = company?.docPicName || "";
  const picPhone = company?.docPicPhone || "";

  // Kolom tanda tangan diletakkan di akhir isi dokumen (bukan di footer band).
  const signatureHTML = opts.showSignature
    ? `<div style="margin-top:8mm;font-size:11px">
        <div>${escapeHtml(greeting)}</div>
        ${picName ? `<div style="margin-top:8mm;border-top:1px solid #999;padding-top:4px;width:200px"><strong>${escapeHtml(picName)}</strong>${picPhone ? `<div style="font-size:10px;color:#555">PIC: ${escapeHtml(picPhone)}</div>` : ""}</div>` : ""}
      </div>`
    : "";

  const footerHTML = `
    <div class="doc-footer">
      <div class="row">
        <span><strong>${escapeHtml(companyName)}</strong></span>
        <span>${company?.phone ? "Telp: " + escapeHtml(company.phone) : ""} ${company?.email ? " · " + escapeHtml(company.email) : ""} ${company?.taxId ? " · NPWP: " + escapeHtml(company.taxId) : ""}</span>
      </div>
      <div class="row" style="margin-top:6mm;align-items:center;justify-content:center;gap:12px;border-top:1px solid #ccc;padding-top:4px">
        <span style="display:inline-flex;align-items:center;gap:4px"><img src="/sheets/brands/fb.png" alt="FB" style="height:14px;width:14px;object-fit:contain"/> Dastech Group</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><img src="/sheets/brands/gmail.png" alt="Email" style="height:14px;width:14px;object-fit:contain"/> ${escapeHtml(companyEmail || "dastechgroup@gmail.com")}</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><img src="/sheets/brands/ig.png" alt="IG" style="height:14px;width:14px;object-fit:contain"/> @dastechgroup</span>
      </div>
    </div>`;

  return `<div class="sheet-content">
    ${headerHTML}
    ${descHTML}
    ${tableHTML}
    ${totalsHTML}
    ${terbilangHTML}
    ${invoiceNoteHTML}
    ${bankHTML}
    ${footerNoteHTML}
    ${statusHTML}
    ${signatureHTML}
  </div>
  ${footerHTML}`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
