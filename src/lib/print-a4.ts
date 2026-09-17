"use client";

// Template A4 seragam untuk SEMUA dokumen cetak (invoice/kuitansi/bukti pembayaran,
// penawaran/pesanan/faktur). Fungsionalitas: header perusahaan, judul, nomor dokumen,
// tanda tangan, footer, dan CSS @page A4 — dipakai bersama agar hasil print konsisten.

export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const PRINT_BASE_CSS = `
  @page { size: A4; margin: 12mm 15mm 18mm 15mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 0; background: #fff; }
  .sheet { width: 100%; max-width: 180mm; min-height: 267mm; margin: 0 auto; padding: 0; display: flex; flex-direction: column; }
  .sheet-content { flex: 1; }
  .doc-title { font-size: 22px; font-weight: 700; margin-bottom: 5mm; }
  .doc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0; margin-bottom: 6mm; position: relative; }
  .doc-header .left { flex: 1; }
  .doc-header .center { flex: 0 0 auto; padding: 0 20px; border-left: 1px solid #ccc; border-right: 1px solid #ccc; }
  .doc-header .right { flex: 1; text-align: right; padding-top: 60px; }
  .doc-logo { position: absolute; right: 0; top: 0; }
  .doc-header .h-name { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
  .doc-header .h-info { font-size: 11px; color: #444; line-height: 1.5; }
  .doc-header .h-label { font-size: 11px; font-weight: 700; margin-bottom: 1px; }
  .doc-header .h-value { font-size: 11px; }
  .doc-desc { font-size: 12px; font-weight: 600; margin-bottom: 4mm; }
  table.clean-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4mm; }
  table.clean-table th, table.clean-table td { border: 1px solid #111; padding: 6px 10px; }
  table.clean-table th { font-weight: 700; text-align: left; }
  table.clean-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  table.clean-table .ctr { text-align: center; }
  .clean-totals { display: flex; justify-content: flex-end; margin-top: 4mm; }
  .clean-totals table { font-size: 12px; }
  .clean-totals td { padding: 3px 10px; }
  .clean-totals .t-label { text-align: right; }
  .clean-totals .t-value { text-align: right; font-variant-numeric: tabular-nums; }
  .clean-totals .t-bold { font-weight: 700; border-top: 2px solid #111; }
  .clean-status { text-align: center; margin-top: 8mm; }
  .clean-status span { display: inline-block; border: 2px solid #047857; color: #047857; font-size: 14px; font-weight: 700; padding: 4px 16px; letter-spacing: 0.05em; }
  .doc-footer { border-top: 2px solid #047857; background: #ecfdf5; padding: 6px 12px; font-size: 10px; color: #555; }
  .doc-footer .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .doc-footer .copy { text-align: center; font-size: 9px; color: #999; margin-top: 4px; }
  @media screen { body { background: #e5e7eb; padding: 16px; } }
`;

// Buka window print berisi sheet A4. Semua panggilan cetak lewat helper ini agar seragam.
export function printDocumentHTML(html: string, title: string, extraCss = ""): string {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title><style>${PRINT_BASE_CSS}${extraCss}</style>
</head>
<body><div class="sheet">${html}</div>
<script>
  window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };
</script>
</body></html>`;
}