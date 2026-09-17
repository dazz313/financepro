"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileUp,
  Trash2,
  Loader2,
  FileText,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Money, EmptyState } from "@/components/ui-helpers";
import { cn } from "@/lib/utils";
import { CSV_IMPORT_TYPES, CSV_TYPE_KEYS, type CsvImportType } from "@/lib/csv-import-types";

type PreviewRow = {
  rowIndex: number;
  type: CsvImportType;
  date: string | null;
  description: string;
  reference: string;
  accountCode: string;
  accountName: string | null;
  debit: number;
  credit: number;
  bankAccount: string;
  bankAccountId: string | null;
  bankLabel: string | null;
  contact: string;
  contactId: string | null;
  contactLabel: string | null;
  amount: number;
  direction: "IN" | "OUT" | null;
  valid: boolean;
  errors: string[];
  groupKey: string;
};

type PreviewSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  totalDebit: number;
  totalCredit: number;
  transactions: number;
  groups: { key: string; description: string; date: string; debit: number; credit: number; balanced: boolean; lineCount: number }[];
};

type PreviewResponse = {
  parsed: { headers: string[]; rows: string[][]; delimiter: string };
  type: CsvImportType;
  typeLabel: string;
  rows: PreviewRow[];
  summary: PreviewSummary;
};

const TYPE_ICONS: Record<CsvImportType, React.ElementType> = {
  jurnal: BookOpen,
  penerimaan: ArrowDownToLine,
  pengeluaran: ArrowUpFromLine,
  aruskas: ArrowRightLeft,
};

export function CsvUploadView() {
  const qc = useQueryClient();
  const [type, setType] = React.useState<CsvImportType>("jurnal");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const meta = CSV_IMPORT_TYPES[type];
  const TypeIcon = TYPE_ICONS[type];

  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("type", type);
      const res = await fetch("/api/csv/preview", { method: "POST", body: fd });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Gagal memproses CSV");
      }
      return res.json() as Promise<PreviewResponse>;
    },
    onSuccess: (data) => {
      setPreview(data);
      toast.success(`CSV berhasil dibaca`, { description: `${data.summary.totalRows} baris, ${data.summary.transactions} transaksi` });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setPreview(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: async (rows: PreviewRow[]) => {
      const res = await fetch("/api/csv/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          rows: rows.map((r) => ({
            type: r.type,
            date: r.date,
            description: r.description,
            reference: r.reference,
            accountCode: r.accountCode,
            debit: r.debit,
            credit: r.credit,
            amount: r.amount,
            direction: r.direction,
            bankAccountId: r.bankAccountId,
            contactId: r.contactId,
          })),
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Gagal import");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Import berhasil!", {
        description: type === "jurnal" ? `${data.imported} jurnal dibuat` : `${data.receipts ?? 0} penerimaan & ${data.payments ?? 0} pengeluaran dibuat`,
      });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setPreview(null);
      setFile(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleTypeChange = (v: CsvImportType) => {
    setType(v);
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    const isCsv = f.name.endsWith(".csv") || f.type === "text/csv";
    if (!isCsv) {
      toast.error("File harus berformat CSV");
      return;
    }
    setFile(f);
    setPreview(null);
    previewMutation.mutate(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const allValid = preview?.summary.invalidRows === 0 && preview?.summary.groups.every((g) => g.balanced);
  const canImport = preview && allValid;

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Pilih Jenis Impor:</p>
                  <Select value={type} onValueChange={(v) => handleTypeChange(v as CsvImportType)}>
                    <SelectTrigger className="h-8 w-[230px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CSV_TYPE_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          <span className="flex items-center gap-2">
                            <TypeIconFallback type={k} className="h-3.5 w-3.5" />
                            {CSV_IMPORT_TYPES[k].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {meta.columns.map((c) => (
                    <Badge key={c.role} variant={c.required ? "default" : "outline"} className="text-[10px] font-normal">
                      {c.label}
                      {c.required ? "" : " (opsional)"}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <a href={`/api/csv/template?type=${type}`} download>
                <Download className="mr-2 h-3.5 w-3.5" /> Unduh Template {meta.shortLabel}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Drop zone */}
      {!preview && (
        <Card>
          <CardContent className="p-6">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                {previewMutation.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <FileUp className="h-6 w-6" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {previewMutation.isPending ? "Memproses..." : "Tarik & lepas file CSV di sini"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  atau <span className="text-primary font-medium underline">klik untuk pilih file</span>
                </p>
              </div>
              {file && !previewMutation.isPending && (
                <p className="text-xs text-muted-foreground">File: {file.name}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview & validation */}
      {preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total Baris</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{preview.summary.totalRows}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Transaksi</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{preview.summary.transactions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Valid
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{preview.summary.validRows}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Bermasalah
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{preview.summary.invalidRows}</div>
              </CardContent>
            </Card>
          </div>

          {/* Balance status per group (jurnal saja) */}
          {preview.type === "jurnal" && preview.summary.groups.some((g) => !g.balanced) && (
            <Card className="border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                      {preview.summary.groups.filter((g) => !g.balanced).length} transaksi tidak balanced
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Total debit & kredit tiap transaksi harus sama. Perbaiki CSV sebelum mengimpor.
                    </p>
                    <div className="mt-2 space-y-1">
                      {preview.summary.groups.filter((g) => !g.balanced).slice(0, 5).map((g, i) => (
                        <div key={i} className="text-xs text-muted-foreground">
                          • {g.description || "(tanpa deskripsi)"} — Debit: <span className="font-mono">{g.debit.toLocaleString("id-ID")}</span> / Kredit: <span className="font-mono">{g.credit.toLocaleString("id-ID")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{file?.name}</span>
              <Badge variant="outline" className="text-[10px]">Delimiter: {preview.parsed.delimiter === "\t" ? "TAB" : preview.parsed.delimiter}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Reset
              </Button>
              <Button
                size="sm"
                disabled={!canImport || importMutation.isPending}
                onClick={() => importMutation.mutate(preview.rows.filter((r) => r.valid))}
              >
                {importMutation.isPending ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Mengimpor...</>
                ) : (
                  <><Upload className="mr-2 h-3.5 w-3.5" /> Impor {preview.summary.transactions} {meta.shortLabel}</>
                )}
              </Button>
            </div>
          </div>

          {canImport && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm text-emerald-700 dark:text-emerald-400">
                {preview.type === "jurnal"
                  ? "Semua transaksi valid & balanced. Siap diimpor."
                  : "Semua baris valid. Siap diimpor (jurnal otomatis akan dibuat)."}
              </span>
            </div>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview Data CSV</CardTitle>
              <CardDescription>
                Header: {preview.parsed.headers.join(", ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="w-28">Tanggal</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="hidden md:table-cell w-24">Referensi</TableHead>
                      {preview.type !== "jurnal" && <TableHead className="hidden lg:table-cell w-32">Kas/Bank</TableHead>}
                      {preview.type !== "jurnal" && <TableHead className="hidden xl:table-cell w-32">Kontak</TableHead>}
                      <TableHead className="w-28">Akun{preview.type !== "jurnal" ? " (Lawan)" : ""}</TableHead>
                      {preview.type === "jurnal" ? (
                        <>
                          <TableHead className="text-right w-28">Debit</TableHead>
                          <TableHead className="text-right w-28">Kredit</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="text-right w-28">Jumlah</TableHead>
                          <TableHead className="w-24 text-center">{preview.type === "aruskas" ? "Arah" : ""}</TableHead>
                        </>
                      )}
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => (
                      <TableRow key={r.rowIndex} className={!r.valid ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{r.rowIndex}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.date ? new Date(r.date).toLocaleDateString("id-ID") : "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={r.description}>{r.description}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
                        {preview.type !== "jurnal" && (
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{r.bankLabel ?? "—"}</TableCell>
                        )}
                        {preview.type !== "jurnal" && (
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">{r.contactLabel ?? "—"}</TableCell>
                        )}
                        <TableCell className="font-mono text-xs">{r.accountCode}</TableCell>
                        {preview.type === "jurnal" ? (
                          <>
                            <TableCell className="text-right text-xs tabular-nums">{r.debit > 0 ? <Money value={r.debit} zeroDash={false} /> : "—"}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{r.credit > 0 ? <Money value={r.credit} zeroDash={false} /> : "—"}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right text-xs tabular-nums">{r.amount > 0 ? <Money value={r.amount} zeroDash={false} /> : "—"}</TableCell>
                            <TableCell className="text-center text-xs">
                              {r.direction === "IN" ? (
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">MASUK</Badge>
                              ) : r.direction === "OUT" ? (
                                <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-600/30">KELUAR</Badge>
                              ) : null}
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          {r.valid ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-600/30" title={r.errors.join(", ")}>
                              <AlertCircle className="mr-1 h-3 w-3" /> Error
                            </Badge>
                          )}
                          {!r.valid && (
                            <div className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 max-w-[200px]">
                              {r.errors.join("; ")}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!preview && !file && (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<TypeIcon className="h-5 w-5" />}
              title="Belum ada file CSV"
              description={`Pilih jenis impor lalu unggah file CSV ${meta.shortLabel.toLowerCase()} untuk dipratinjau dan divalidasi sebelum diimpor.`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TypeIconFallback({ type, className }: { type: CsvImportType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return <Icon className={className} />;
}