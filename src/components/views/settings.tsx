"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";
import {
  Building2,
  Coins,
  Calendar,
  Percent,
  FileText,
  ListTree,
  Palette,
  Lock,
  UserCog,
  Save,
  Loader2,
  CheckCircle2,
  CircleDashed,
  ShieldCheck,
  Eye,
  EyeOff,
  Database,
  Trash2,
  AlertTriangle,
  RefreshCw,
  PiggyBank,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Upload,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/lib/settings-store";
import { renderNumberingTemplate, SERIES_DEFS, SERIES_ORDER, type DocSeries, type NumberingContext } from "@/lib/codegen-shared";
import type { CompanySettings, UserPreferences } from "@/lib/types";
import { formatDate } from "@/lib/accounting";
import { authFetch } from "@/components/auth-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { AccountsView } from "@/components/views/accounts";

// ---------- Constants ----------

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const THOUSAND_OPTIONS = [
  { value: ".", label: "Titik (.)" },
  { value: ",", label: "Koma (,)" },
  { value: " ", label: "Spasi" },
  { value: "none", label: "Tanpa pemisah" },
];

const DECIMAL_OPTIONS = [
  { value: ",", label: "Koma (,)" },
  { value: ".", label: "Titik (.)" },
];

const LOCALE_OPTIONS = [
  { value: "id-ID", label: "Indonesia (id-ID)" },
  { value: "en-US", label: "English (US)" },
];

const TABS = [
  { key: "company", label: "Profil Perusahaan", desc: "Identitas, alamat & kontak", icon: Building2 },
  { key: "opening", label: "Saldo Awal", desc: "Neraca pembukaan", icon: PiggyBank },
  { key: "coa", label: "Bagan Akun", desc: "Chart of accounts", icon: ListTree },
  { key: "currency", label: "Mata Uang & Format", desc: "Simbol & pemisah angka", icon: Coins },
  { key: "fiscal", label: "Tahun Fiskal", desc: "Periode awal pembukuan", icon: Calendar },
  { key: "tax", label: "Pajak", desc: "Tarif PPN default", icon: Percent },
  { key: "documents", label: "Faktur & Jurnal", desc: "Penomoran & tanda tangan", icon: FileText },
  { key: "appearance", label: "Tampilan", desc: "Tema & format tanggal", icon: Palette },
  { key: "users", label: "Pengguna", desc: "Kelola akun & role", icon: UserCog },
  { key: "security", label: "Keamanan", desc: "Ubah password akun", icon: Lock },
  { key: "data", label: "Data", desc: "Backup, restore & reset", icon: Database },
  { key: "logs", label: "Riwayat", desc: "Audit log perubahan", icon: History },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ---------- Helpers ----------

/** Format a number using the company's currency settings (manual, no Intl). */
function formatMoney(
  amount: number,
  opts: {
    symbol: string;
    position: "before" | "after";
    thousandSep: string;
    decimalSep: string;
    decimalPlaces: number;
  }
): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const places = Math.max(0, Math.min(4, opts.decimalPlaces));
  const fixed = abs.toFixed(places);
  const [intPart, fracPart] = fixed.split(".");
  const tSep = opts.thousandSep === "none" ? "" : opts.thousandSep;
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, tSep);
  let body = withThousands;
  if (places > 0 && fracPart) {
    body = `${withThousands}${opts.decimalSep}${fracPart}`;
  }
  const sym = opts.symbol?.trim() ?? "";
  if (!sym) return `${sign}${body}`;
  return opts.position === "after"
    ? `${sign}${body} ${sym}`
    : `${sign}${sym} ${body}`;
}

/** Pad a number to 4 digits, e.g. 6 -> "0006". */
function padNumber(n: number, width = 4): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

/** Ringkas hasil restore dari API menjadi baris pendek. */
function formatBackupSummary(data: any): string {
  if (!data?.counts) return "data dikembalikan";
  const total = Object.values(data.counts).reduce((s: number, v) => s + (Number(v) || 0), 0);
  return `± ${total.toLocaleString("id-ID")} baris (${data.exportedAt?.slice(0, 10) ?? "backup"})`;
}

/** Default money formatting options (before company settings load). */
const DEFAULT_MONEY_OPTS = {
  symbol: "Rp",
  position: "before",
  thousandSep: ".",
  decimalSep: ",",
  decimalPlaces: 0,
} as const;

/** Shallow equal comparing two plain objects by JSON stringify (small forms only). */
function isDirty<T>(a: T, b: T): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ---------- Reusable form-state hook (with .reset and .update + .initial) ----------

function useStateWithReset<T extends object>(initialData: T) {
  const [initial, setInitial] = React.useState<T>(initialData);
  const [form, setFormState] = React.useState<T>(initialData);

  // Sync local state to external data when the parent's serialized
  // snapshot changes (e.g. after a query refetch). Does not run on every
  // render because we depend on a string key.
  const initialKey = JSON.stringify(initialData);
  React.useEffect(() => {
    setInitial(initialData);
    setFormState(initialData);
  }, [initialKey]);

  const update = <K extends keyof T>(key: K, value: T[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const reset = (next: T) => {
    setInitial(next);
    setFormState(next);
  };

  return { form, initial, update, reset } as const;
}

// ---------- Shared subcomponents ----------

function DirtyBadge({ dirty }: { dirty: boolean }) {
  if (dirty) {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <CircleDashed className="h-3 w-3" />
        Belum disimpan
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
    >
      <CheckCircle2 className="h-3 w-3" />
      Tersimpan
    </Badge>
  );
}

function SaveFooter({
  dirty,
  pending,
  onSave,
  lastUpdated,
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  lastUpdated?: string;
}) {
  return (
    <CardFooter className="sticky bottom-0 z-10 flex flex-col items-stretch gap-3 border-t bg-card/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <DirtyBadge dirty={dirty} />
        {lastUpdated && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Diperbarui{" "}
            {new Date(lastUpdated).toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <Button
          onClick={onSave}
          disabled={!dirty || pending}
          className="w-full sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Simpan
            </>
          )}
        </Button>
      </div>
    </CardFooter>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-5 p-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {hint && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({hint})
          </span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------- Tab 1: Profil Perusahaan ----------

type CompanyForm = Pick<
  CompanySettings,
  | "name" | "legalName" | "taxId" | "email" | "phone" | "address"
  | "city" | "postalCode" | "country" | "logoUrl"
>;

function CompanyTab({ data }: { data: CompanySettings }) {
  const setCompany = useSettingsStore((s) => s.setCompany);
  const { form, initial, update, reset } = useStateWithReset<CompanyForm>(data);

  const [logoUploading, setLogoUploading] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal upload logo");
      update("logoUrl", json.url as string);
      toast.success("Logo diunggah", { description: "Klik Simpan untuk menerapkan perubahan." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal upload logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar (PNG/JPG/SVG)");
      e.target.value = "";
      return;
    }
    uploadLogo(file);
    e.target.value = "";
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan");
      return json as { settings: CompanySettings };
    },
    onSuccess: (data) => {
      toast.success("Profil perusahaan disimpan");
      setCompany(data.settings);
      reset(data.settings);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = isDirty(form, initial);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Profil Perusahaan</CardTitle>
        <CardDescription>
          Informasi dasar yang tampil pada faktur, laporan, dan dokumen lain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Logo Perusahaan */}
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background">
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt="Logo perusahaan"
                className="h-full w-full object-contain"
              />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Logo Perusahaan</Label>
              <p className="text-xs text-muted-foreground">
                Tampil di kop dokumen cetak (faktur, kuitansi, laporan). Format
                PNG/JPG/SVG, maks. 10 MB.
              </p>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFile}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
              >
                {logoUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {form.logoUrl ? "Ganti Logo" : "Upload Logo"}
              </Button>
              {form.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update("logoUrl", null)}
                  disabled={logoUploading}
                  className="text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </Button>
              )}
            </div>
            {form.logoUrl !== initial.logoUrl && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Logo baru belum tersimpan — klik "Simpan" untuk menerapkan.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Perusahaan" htmlFor="co-name" required>
            <Input
              id="co-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="PT Maju Bersama"
            />
          </Field>
          <Field label="Nama Legal" htmlFor="co-legal">
            <Input
              id="co-legal"
              value={form.legalName ?? ""}
              onChange={(e) => update("legalName", e.target.value)}
              placeholder="PT Maju Bersama Sejahtera Tbk"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="NPWP" htmlFor="co-tax">
            <Input
              id="co-tax"
              value={form.taxId ?? ""}
              onChange={(e) => update("taxId", e.target.value)}
              placeholder="00.000.000.0-000.000"
              className="font-mono"
            />
          </Field>
          <Field label="Negara" htmlFor="co-country">
            <Input
              id="co-country"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              placeholder="Indonesia"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="co-email">
            <Input
              id="co-email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => update("email", e.target.value)}
              placeholder="halo@majubersama.id"
            />
          </Field>
          <Field label="Telepon" htmlFor="co-phone">
            <Input
              id="co-phone"
              value={form.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="021-555-0123"
            />
          </Field>
        </div>

        <Field label="Alamat" htmlFor="co-address">
          <Textarea
            id="co-address"
            rows={2}
            value={form.address ?? ""}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Jl. Sudirman No. 1, Jakarta Pusat"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kota" htmlFor="co-city">
            <Input
              id="co-city"
              value={form.city ?? ""}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Jakarta"
            />
          </Field>
          <Field label="Kode Pos" htmlFor="co-postal">
            <Input
              id="co-postal"
              value={form.postalCode ?? ""}
              onChange={(e) => update("postalCode", e.target.value)}
              placeholder="10210"
              className="font-mono"
            />
          </Field>
        </div>
      </CardContent>
      <SaveFooter
        dirty={dirty}
        pending={mutation.isPending}
        onSave={() => mutation.mutate()}
        lastUpdated={data.updatedAt}
      />
    </Card>
  );
}

// ---------- Tab 2: Mata Uang & Format ----------

type CurrencyForm = Pick<
  CompanySettings,
  | "currencyCode" | "currencySymbol" | "currencyPosition" | "decimalPlaces"
  | "thousandSeparator" | "decimalSeparator" | "locale"
>;

function CurrencyTab({ data }: { data: CompanySettings }) {
  const setCompany = useSettingsStore((s) => s.setCompany);
  const { form, initial, update, reset } = useStateWithReset<CurrencyForm>(data);

  const preview = formatMoney(1234567.89, {
    symbol: form.currencySymbol,
    position: form.currencyPosition,
    thousandSep: form.thousandSeparator,
    decimalSep: form.decimalSeparator,
    decimalPlaces: form.decimalPlaces,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan");
      return json as { settings: CompanySettings };
    },
    onSuccess: (data) => {
      toast.success("Pengaturan mata uang disimpan");
      setCompany(data.settings);
      reset(data.settings);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = isDirty(form, initial);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Mata Uang & Format</CardTitle>
        <CardDescription>
          Konfigurasi simbol mata uang, pemisah ribuan/desimal, dan jumlah desimal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kode Mata Uang" htmlFor="cur-code">
            <Input
              id="cur-code"
              value={form.currencyCode}
              onChange={(e) => update("currencyCode", e.target.value.toUpperCase())}
              placeholder="IDR"
              className="font-mono"
              maxLength={5}
            />
          </Field>
          <Field label="Simbol" htmlFor="cur-symbol">
            <Input
              id="cur-symbol"
              value={form.currencySymbol}
              onChange={(e) => update("currencySymbol", e.target.value)}
              placeholder="Rp"
              maxLength={6}
            />
          </Field>
          <Field label="Posisi Simbol" htmlFor="cur-pos">
            <Select
              value={form.currencyPosition}
              onValueChange={(v) => update("currencyPosition", v as "before" | "after")}
            >
              <SelectTrigger id="cur-pos" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Sebelum angka (Rp 1.000)</SelectItem>
                <SelectItem value="after">Sesudah angka (1.000 Rp)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Jumlah Desimal" htmlFor="cur-decimals">
            <Input
              id="cur-decimals"
              type="number"
              min={0}
              max={4}
              value={form.decimalPlaces}
              onChange={(e) =>
                update("decimalPlaces", Math.max(0, Math.min(4, Number(e.target.value) || 0)))
              }
            />
          </Field>
          <Field label="Pemisah Ribuan" htmlFor="cur-thousand">
            <Select
              value={form.thousandSeparator}
              onValueChange={(v) => update("thousandSeparator", v)}
            >
              <SelectTrigger id="cur-thousand" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THOUSAND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pemisah Desimal" htmlFor="cur-decimal-sep">
            <Select
              value={form.decimalSeparator}
              onValueChange={(v) => update("decimalSeparator", v)}
            >
              <SelectTrigger id="cur-decimal-sep" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECIMAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Locale" htmlFor="cur-locale">
          <Select value={form.locale} onValueChange={(v) => update("locale", v)}>
            <SelectTrigger id="cur-locale" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Live preview */}
        <div className="rounded-lg border border-dashed bg-muted/30 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pratinjau Format
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {preview}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nilai contoh: 1.234.567,89
          </p>
        </div>
      </CardContent>
      <SaveFooter
        dirty={dirty}
        pending={mutation.isPending}
        onSave={() => mutation.mutate()}
        lastUpdated={data.updatedAt}
      />
    </Card>
  );
}

// ---------- Tab 3: Tahun Fiskal ----------

type FiscalForm = Pick<CompanySettings, "fiscalYearStartMonth" | "fiscalYearStartDay">;

function FiscalTab({ data }: { data: CompanySettings }) {
  const setCompany = useSettingsStore((s) => s.setCompany);
  const { form, initial, update, reset } = useStateWithReset<FiscalForm>(data);

  // Compute fiscal year range based on selected start
  const startMonth = form.fiscalYearStartMonth;
  const startDay = form.fiscalYearStartDay;
  const endMonthIdx = (startMonth - 1 + 11) % 12; // 11 months later
  const endMonth = MONTHS_ID[endMonthIdx];
  const endDayLabel = startDay === 1 ? 31 : startDay - 1;
  const rangeLabel = `${startDay} ${MONTHS_ID[startMonth - 1]} – ${endDayLabel} ${endMonth}`;

  const now = new Date();
  const currentYear = now.getFullYear();
  const startDate = new Date(currentYear, startMonth - 1, startDay);
  let fyStartYear = currentYear;
  if (now < startDate) fyStartYear = currentYear - 1;
  const fyEndYear = fyStartYear + 1;
  const fyStartLabel = `${startDay} ${MONTHS_ID[startMonth - 1]} ${fyStartYear}`;
  const fyEndLabel = `${endDayLabel} ${endMonth} ${fyEndYear}`;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan");
      return json as { settings: CompanySettings };
    },
    onSuccess: (data) => {
      toast.success("Pengaturan tahun fiskal disimpan");
      setCompany(data.settings);
      reset(data.settings);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = isDirty(form, initial);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Tahun Fiskal</CardTitle>
        <CardDescription>
          Tentukan awal tahun fiskal perusahaan. Laporan tahunan akan mengikuti periode ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bulan Awal" htmlFor="fy-month">
            <Select
              value={String(startMonth)}
              onValueChange={(v) => update("fiscalYearStartMonth", Number(v))}
            >
              <SelectTrigger id="fy-month" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_ID.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tanggal Awal" htmlFor="fy-day" hint="1 - 31">
            <Input
              id="fy-day"
              type="number"
              min={1}
              max={31}
              value={form.fiscalYearStartDay}
              onChange={(e) =>
                update("fiscalYearStartDay", Math.max(1, Math.min(31, Number(e.target.value) || 1)))
              }
            />
          </Field>
        </div>

        {/* Visual hint */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tahun Fiskal Berjalan
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 rounded-md border bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mulai
              </p>
              <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                {fyStartLabel}
              </p>
            </div>
            <div className="text-center text-muted-foreground">→</div>
            <div className="flex-1 rounded-md border bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Akhir
              </p>
              <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                {fyEndLabel}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Pola tahun fiskal:{" "}
            <span className="font-medium text-foreground">{rangeLabel}</span>
          </p>
        </div>
      </CardContent>
      <SaveFooter
        dirty={dirty}
        pending={mutation.isPending}
        onSave={() => mutation.mutate()}
        lastUpdated={data.updatedAt}
      />
    </Card>
  );
}

// ---------- Tab 4: Pajak ----------

type TaxForm = Pick<CompanySettings, "defaultTaxRate" | "taxIncluded" | "ppnEnabled" | "bpjsEmployerRate">;

function TaxTab({ data }: { data: CompanySettings }) {
  const setCompany = useSettingsStore((s) => s.setCompany);
  const { form, initial, update, reset } = useStateWithReset<TaxForm>(data);

  const examplePrice = 100000;
  const rate = form.ppnEnabled ? form.defaultTaxRate || 0 : 0;

  let exampleText: string;
  let exampleTax: number;
  if (!form.ppnEnabled) {
    exampleText = "PPN dinonaktifkan — faktur baru tidak dikenakan PPN.";
    exampleTax = 0;
  } else if (form.taxIncluded) {
    // PPN included: tax = price - price / (1 + rate/100)
    const net = examplePrice / (1 + rate / 100);
    exampleTax = examplePrice - net;
    exampleText = `Produk Rp ${examplePrice.toLocaleString("id-ID")} (termasuk PPN ${rate}%, PPN = Rp ${exampleTax.toLocaleString("id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`;
  } else {
    exampleTax = examplePrice * (rate / 100);
    exampleText = `Produk Rp ${examplePrice.toLocaleString("id-ID")} → PPN ${rate}% = Rp ${exampleTax.toLocaleString("id-ID")}`;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan");
      return json as { settings: CompanySettings };
    },
    onSuccess: (data) => {
      toast.success("Pengaturan pajak disimpan");
      setCompany(data.settings);
      reset(data.settings);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = isDirty(form, initial);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Pajak</CardTitle>
        <CardDescription>
          Aktifkan/nonaktifkan PPN untuk seluruh faktur. Tarif default dipakai untuk faktur baru.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <Switch
            id="tax-enabled"
            checked={form.ppnEnabled}
            onCheckedChange={(v) => update("ppnEnabled", v)}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="tax-enabled" className="cursor-pointer text-sm font-medium">
              Aktifkan PPN
            </Label>
            <p className="text-xs text-muted-foreground">
              Matikan untuk membuat faktur tanpa PPN. Kolom PPN pada form faktur akan dinonaktifkan
              dan dokumen tidak menyertakan pajak. PPh 23 tetap tersedia untuk pembelian.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tarif PPN Default" htmlFor="tax-rate">
            <div className="relative">
              <Input
                id="tax-rate"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.defaultTaxRate}
                disabled={!form.ppnEnabled}
                onChange={(e) =>
                  update("defaultTaxRate", Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                }
                className={cn("pr-9", !form.ppnEnabled && "bg-muted/40 text-muted-foreground")}
              />
              <Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </Field>
        </div>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <Switch
            id="tax-included"
            checked={form.taxIncluded}
            onCheckedChange={(v) => update("taxIncluded", v)}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="tax-included" className="cursor-pointer text-sm font-medium">
              Harga sudah termasuk pajak
            </Label>
            <p className="text-xs text-muted-foreground">
              Jika aktif, harga produk sudah mengandung PPN. Sistem akan menghitung
              nilai pajak secara terpisah saat membuat faktur.
            </p>
          </div>
        </div>

        {/* Iuran BPJS pemberi kerja (payroll) */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payroll — Iuran BPJS Pemberi Kerja
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Persen dari gaji kotor yang dibiayai perusahaan. Saat penggajian, sistem
            mencatat beban gaji + iuran ini dan mengkredit akun "Hutang BPJS" (bukan
            Hutang Pajak).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Iuran BPJS Pemberi Kerja (%)" htmlFor="bpjs-employer-rate">
              <div className="relative">
                <Input
                  id="bpjs-employer-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.bpjsEmployerRate}
                  onChange={(e) =>
                    update("bpjsEmployerRate", Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="pr-9"
                />
                <Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Field>
          </div>
        </div>

        {/* Example */}
        <div className="rounded-lg border border-dashed bg-muted/30 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contoh Perhitungan
          </p>
          <p className="text-sm font-medium leading-relaxed">{exampleText}</p>
        </div>
      </CardContent>
      <SaveFooter
        dirty={dirty}
        pending={mutation.isPending}
        onSave={() => mutation.mutate()}
        lastUpdated={data.updatedAt}
      />
    </Card>
  );
}

// ---------- Tab 5: Faktur & Jurnal ----------

type DocsFormKey =
  | "companyCode" | "numberingFormat"
  | "invoicePrefix" | "invoiceStartNumber" | "nextInvoiceNumber"
  | "quotePrefix" | "quoteStartNumber" | "nextQuoteNumber"
  | "orderPrefix" | "orderStartNumber" | "nextOrderNumber"
  | "journalPrefix" | "journalStartNumber" | "nextJournalNumber"
  | "openingPrefix" | "openingStartNumber" | "nextOpeningNumber"
  | "receiptPrefix" | "receiptStartNumber" | "nextReceiptNumber"
  | "paymentPrefix" | "paymentStartNumber" | "nextPaymentNumber"
  | "transferPrefix" | "transferStartNumber" | "nextTransferNumber"
  | "payrollPrefix" | "payrollStartNumber" | "nextPayrollNumber"
  | "reimbursementPrefix" | "reimbursementStartNumber" | "nextReimbursementNumber"
  | "loanPrefix" | "loanStartNumber" | "nextLoanNumber"
  | "employeePrefix" | "employeeStartNumber" | "nextEmployeeNumber"
  | "contactPrefix" | "contactStartNumber" | "nextContactNumber"
  | "bankAccountPrefix" | "bankAccountStartNumber" | "nextBankAccountNumber"
  | "fixedAssetPrefix" | "fixedAssetStartNumber" | "nextFixedAssetNumber"
  | "inventoryItemPrefix" | "inventoryItemStartNumber" | "nextInventoryItemNumber"
  | "defaultPaymentTermsDays" | "invoiceSignature" | "invoiceSignatureTitle"
  | "invoiceFooterNote" | "invoiceNote" | "docGreeting" | "docPicName" | "docPicPhone" | "invoiceBankName" | "invoiceBankAccount" | "invoiceBankHolder";

type DocsForm = Pick<CompanySettings, DocsFormKey>;

function DocumentsTab({ data }: { data: CompanySettings }) {
  const setCompany = useSettingsStore((s) => s.setCompany);
  const { form, initial, update, reset } = useStateWithReset<DocsForm>(data);
  const f = form as unknown as Record<string, any>;

  // Preview semua seri penomoran
  const seriesPreview = (series: DocSeries) => {
    const def = SERIES_DEFS[series];
    const prefix: string = f[def.prefix] ?? def.fallback;
    const start = Number(f[def.start] ?? 1) || 1;
    const next = Number(f[def.next] ?? start) || start;
    const context: NumberingContext = {
      prefix,
      company: f.companyCode || "",
      year: new Date().getFullYear().toString(),
      month: String(new Date().getMonth() + 1).padStart(2, "0"),
      seq: padNumber(next),
    };
    return renderNumberingTemplate(f.numberingFormat || "{prefix}-{seq}", context);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan");
      return json as { settings: CompanySettings };
    },
    onSuccess: (data: { settings: CompanySettings; renumber?: Record<string, number> }) => {
      toast.success("Pengaturan faktur & jurnal disimpan");
      const rn = data.renumber;
      if (rn) {
        const total = Object.values(rn).reduce((s, n) => s + n, 0);
        if (total > 0) {
          toast.info(`${total} dokumen dinomori ulang sesuai kode perusahaan`, {
            description: Object.entries(rn)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · "),
          });
        }
      }
      setCompany(data.settings);
      reset(data.settings);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = isDirty(form, initial);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Faktur &amp; Jurnal</CardTitle>
        <CardDescription>
          Penomoran otomatis, jatuh tempo, tanda tangan, catatan kaki, dan akun bank untuk invoice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Penomoran */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Penomoran Otomatis</p>
          <p className="text-xs text-muted-foreground">
            Semua kode dokumen &amp; master data di-generate otomatis dengan acuan di bawah ini.
            Ubah "Awalan", "Nomor Berikutnya", kode perusahaan, dan format template sesuai kebijakan perusahaan. Jika nomor tidak
            diisi manual saat membuat data baru, sistem memakai nomor berikutnya.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kode Perusahaan" htmlFor="doc-company-code" hint="Opsional">
              <Input
                id="doc-company-code"
                value={form.companyCode ?? ""}
                onChange={(e) => update("companyCode", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="ABC"
                className="font-mono"
                maxLength={12}
              />
            </Field>
            <Field label="Format Template" htmlFor="doc-numbering-format" hint="{prefix}-{companyCode}-{year}-{month}-{seq}">
              <Input
                id="doc-numbering-format"
                value={form.numberingFormat ?? ""}
                onChange={(e) => update("numberingFormat", e.target.value)}
                placeholder="{prefix}-{companyCode}-{year}-{month}-{seq}"
                className="font-mono"
                maxLength={80}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Contoh format: <code className="font-mono">INV-FPD-2026-09-0001</code>. Token: <code className="font-mono">{'{prefix}'}, {'{companyCode}'}, {'{year}'}, {'{month}'}, {'{seq}'}</code>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {SERIES_ORDER.map((series) => {
              const def = SERIES_DEFS[series];
              const prefixVal: string = f[def.prefix] ?? def.fallback;
              const startNum = Number(f[def.start] ?? 1) || 1;
              const nextVal = Number(f[def.next] ?? startNum) || startNum;
              return (
                <div key={series} className="rounded-lg border bg-background p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {def.label}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`code-prefix-${series}`} className="text-[10px] text-muted-foreground">Awalan</Label>
                      <Input
                        id={`code-prefix-${series}`}
                        value={prefixVal}
                        onChange={(e) => update(def.prefix as DocsFormKey, e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                        maxLength={8}
                        className="h-8 font-mono"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`code-next-${series}`} className="text-[10px] text-muted-foreground">Nomor Berikutnya</Label>
                      <Input
                        id={`code-next-${series}`}
                        type="number"
                        min={1}
                        value={nextVal}
                        onChange={(e) => update(def.next as DocsFormKey, Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 font-mono text-right"
                      />
                    </div>
                  </div>
                  <p className="mt-2 truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                    Berikutnya: {seriesPreview(series)}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Nomor faktur di-generate otomatis saat membuat dokumen baru (jika nomor tidak diisi manual). Set "Nomor Berikutnya" untuk menentukan nomor yang akan dipakai selanjutnya.
          </p>
        </div>

        <Separator />

        {/* Jatuh tempo default */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jatuh Tempo Default</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Termin Pembayaran (hari)" htmlFor="doc-terms">
              <Input id="doc-terms" type="number" min={0} value={form.defaultPaymentTermsDays ?? ""} onChange={(e) => update("defaultPaymentTermsDays", Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <div className="flex items-end">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Faktur tanpa tanggal jatuh tempo akan otomatis dihitung: <span className="font-semibold text-foreground">{form.defaultPaymentTermsDays} hari</span> setelah tanggal faktur
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Tanda tangan */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tanda Tangan Default</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Penandatangan" htmlFor="doc-sig-name">
              <Input id="doc-sig-name" value={form.invoiceSignature ?? ""} onChange={(e) => update("invoiceSignature", e.target.value)} placeholder="mis. Budi Santoso" />
            </Field>
            <Field label="Jabatan" htmlFor="doc-sig-title">
              <Input id="doc-sig-title" value={form.invoiceSignatureTitle ?? ""} onChange={(e) => update("invoiceSignatureTitle", e.target.value)} placeholder="mis. Direktur Utama" />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Tampil di kolom "Hormat kami" pada dokumen invoice. Bisa disembunyikan per-invoice via opsi tampilan.</p>
        </div>

        <Separator />

        {/* Catatan kaki */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catatan Dokumen</p>
          <Field label="Catatan Invoice" htmlFor="doc-note">
            <Textarea id="doc-note" value={form.invoiceNote ?? ""} onChange={(e) => update("invoiceNote", e.target.value)} placeholder="mis. Barang yang sudah dibeli tidak dapat ditukar/dikembalikan." rows={2} />
          </Field>
          <p className="text-xs text-muted-foreground">
            Tampil sebagai catatan pada dokumen invoice/penawaran/pesanan, diatur via opsi
            "Catatan Invoice" saat pratinjau cetak.
          </p>
          <Field label="Catatan Kaki Invoice" htmlFor="doc-footer">
            <Textarea id="doc-footer" value={form.invoiceFooterNote ?? ""} onChange={(e) => update("invoiceFooterNote", e.target.value)} placeholder="mis. Pembayaran dilakukan via transfer bank dalam waktu 30 hari..." rows={2} />
          </Field>
        </div>

        <Separator />

        {/* Salam Hormat & PIC */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salam Hormat & PIC</p>
          <Field label="Salam Hormat" htmlFor="doc-greeting">
            <Input id="doc-greeting" value={form.docGreeting ?? ""} onChange={(e) => update("docGreeting", e.target.value)} placeholder="mis. Hormat kami," />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama PIC" htmlFor="doc-pic-name">
              <Input id="doc-pic-name" value={form.docPicName ?? ""} onChange={(e) => update("docPicName", e.target.value)} placeholder="mis. Budi Santoso" />
            </Field>
            <Field label="Nomor PIC" htmlFor="doc-pic-phone">
              <Input id="doc-pic-phone" value={form.docPicPhone ?? ""} onChange={(e) => update("docPicPhone", e.target.value)} placeholder="mis. 081234567890" />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Tampil di bagian bawah dokumen sebagai kontak person.</p>
        </div>

        <Separator />

        {/* Akun bank */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Akun Bank Pembayaran</p>
          <p className="text-xs text-muted-foreground">Tampil di bagian bawah invoice untuk instruksi pembayaran.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nama Bank" htmlFor="doc-bank-name">
              <Input id="doc-bank-name" value={form.invoiceBankName ?? ""} onChange={(e) => update("invoiceBankName", e.target.value)} placeholder="mis. Bank BCA" />
            </Field>
            <Field label="Nomor Rekening" htmlFor="doc-bank-acc">
              <Input id="doc-bank-acc" value={form.invoiceBankAccount ?? ""} onChange={(e) => update("invoiceBankAccount", e.target.value)} placeholder="1234567890" className="font-mono" />
            </Field>
            <Field label="Atas Nama" htmlFor="doc-bank-holder">
              <Input id="doc-bank-holder" value={form.invoiceBankHolder ?? ""} onChange={(e) => update("invoiceBankHolder", e.target.value)} placeholder="PT Perusahaan" />
            </Field>
          </div>
        </div>
      </CardContent>
      <SaveFooter
        dirty={dirty}
        pending={mutation.isPending}
        onSave={() => mutation.mutate()}
        lastUpdated={data.updatedAt}
      />
    </Card>
  );
}

// ---------- Tab 6: Tampilan ----------

type AppearanceForm = Pick<UserPreferences, "theme" | "density" | "numberFormat" | "dateFormat">;

function AppearanceTab({ data }: { data: UserPreferences }) {
  const setPreferences = useSettingsStore((s) => s.setPreferences);
  const { setTheme } = useTheme();
  const { form, initial, update, reset } = useStateWithReset<AppearanceForm>(data);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan");
      return json as { preferences: UserPreferences };
    },
    onSuccess: (data) => {
      toast.success("Preferensi tampilan disimpan");
      setPreferences(data.preferences);
      reset(data.preferences);
      // Re-apply theme (covers the case where user reverted before saving)
      setTheme(form.theme);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Live-apply theme on change (instant preview, persisted on Save)
  const handleThemeChange = (value: string) => {
    update("theme", value as AppearanceForm["theme"]);
    setTheme(value as "light" | "dark" | "system");
  };

  const dirty = isDirty(form, initial);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Tampilan</CardTitle>
        <CardDescription>
          Preferensi tampilan per-user: tema, kepadatan, format angka, dan tanggal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tema" htmlFor="app-theme">
            <Select value={form.theme} onValueChange={handleThemeChange}>
              <SelectTrigger id="app-theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Terang</SelectItem>
                <SelectItem value="dark">Gelap</SelectItem>
                <SelectItem value="system">Mengikuti Sistem</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Kepadatan" htmlFor="app-density">
            <Select
              value={form.density}
              onValueChange={(v) => update("density", v as AppearanceForm["density"])}
            >
              <SelectTrigger id="app-density" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Nyaman (lebih renggang)</SelectItem>
                <SelectItem value="compact">Padat (lebih hemat ruang)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Format Angka" htmlFor="app-number">
            <Select
              value={form.numberFormat}
              onValueChange={(v) => update("numberFormat", v as AppearanceForm["numberFormat"])}
            >
              <SelectTrigger id="app-number" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id-ID">Indonesia · 1.000,50</SelectItem>
                <SelectItem value="en-US">English · 1,000.50</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Format Tanggal" htmlFor="app-date">
            <Select
              value={form.dateFormat}
              onValueChange={(v) => update("dateFormat", v as AppearanceForm["dateFormat"])}
            >
              <SelectTrigger id="app-date" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Theme is applied live; show a small note */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Catatan:</span> Perubahan tema
            langsung diterapkan saat dipilih. Preferensi lain akan aktif setelah disimpan.
          </p>
        </div>
      </CardContent>
      <SaveFooter
        dirty={dirty}
        pending={mutation.isPending}
        onSave={() => mutation.mutate()}
        lastUpdated={data.updatedAt}
      />
    </Card>
  );
}

// ---------- Tab 7: Keamanan ----------

function SecurityTab() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const newPasswordValid = newPassword.length >= 6;
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const canSubmit = currentPassword.length > 0 && newPasswordValid && passwordsMatch;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Gagal mengganti password");
      }
      return json;
    },
    onSuccess: () => {
      toast.success("Password berhasil diubah", {
        description: "Gunakan password baru saat login berikutnya.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Keamanan</CardTitle>
        <CardDescription>
          Ubah password akun Anda. Disimpan sebagai hash bcrypt di server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="Password Saat Ini" htmlFor="sec-current">
          <div className="relative">
            <Input
              id="sec-current"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={showCurrent ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Password Baru"
            htmlFor="sec-new"
            hint="Min. 6 karakter"
            error={
              newPassword.length > 0 && !newPasswordValid
                ? "Password minimal 6 karakter"
                : undefined
            }
          >
            <div className="relative">
              <Input
                id="sec-new"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
                aria-invalid={newPassword.length > 0 && !newPasswordValid}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={showNew ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field
            label="Konfirmasi Password Baru"
            htmlFor="sec-confirm"
            error={
              confirmPassword.length > 0 && !passwordsMatch
                ? "Password tidak cocok"
                : undefined
            }
          >
            <div className="relative">
              <Input
                id="sec-confirm"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
                aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={showConfirm ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        {/* Password strength meter */}
        {newPassword.length > 0 && <PasswordStrengthMeter password={newPassword} />}

        {/* Generic note (last login info not exposed via client session) */}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Tips keamanan</p>
            <ul className="ml-3 list-disc space-y-0.5">
              <li>Gunakan kombinasi huruf besar, kecil, angka, dan simbol.</li>
              <li>Jangan gunakan password yang dipakai di layanan lain.</li>
              <li>Ubah password secara berkala untuk keamanan maksimal.</li>
            </ul>
          </div>
        </div>
      </CardContent>
      <CardFooter className="sticky bottom-0 z-10 flex flex-col items-stretch gap-3 border-t bg-card/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Pastikan password baru sudah benar sebelum menyimpan.
          </span>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!canSubmit || mutation.isPending}
          className="w-full sm:w-auto"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Mengubah...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Ubah Password
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: "Min. 6 karakter", ok: password.length >= 6 },
    { label: "Ada huruf besar", ok: /[A-Z]/.test(password) },
    { label: "Ada angka", ok: /[0-9]/.test(password) },
    { label: "Ada simbol", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const scoreLabel = ["Sangat lemah", "Lemah", "Cukup", "Baik", "Kuat"][score];
  const scoreColor = [
    "bg-rose-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-emerald-600",
  ][score];
  const scoreTextColor =
    score >= 3
      ? "text-emerald-600 dark:text-emerald-400"
      : score === 2
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Kekuatan Password
        </p>
        <span className={cn("text-xs font-semibold", scoreTextColor)}>
          {scoreLabel}
        </span>
      </div>
      <div className="mb-3 flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < score ? scoreColor : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5">
            {c.ok ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CircleDashed className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={cn(c.ok ? "text-foreground" : "text-muted-foreground")}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Tab 8: Data ----------

function DataTab() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [backupLoading, setBackupLoading] = React.useState(false);
  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  const downloadBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await authFetch("/api/backup");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Gagal membuat backup");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financepro-backup-${new Date().toISOString().slice(0, 10)}.financepro`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup berhasil diunduh");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat backup");
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/api/backup/restore", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal restore data");
      return json;
    },
    onSuccess: () => {
      toast.success("Restore berhasil", { description: "Seluruh data telah dikembalikan." });
      qc.invalidateQueries();
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Restore akan menimpa seluruh data saat ini. Lanjutkan?")) {
      e.target.value = "";
      return;
    }
    restoreMutation.mutate(file);
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/seed", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menghapus data");
      return json;
    },
    onSuccess: () => {
      toast.success("Semua data transaksi berhasil dihapus", {
        description: "Anda tetap bisa login dengan akun yang sama.",
      });
      setOpen(false);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Manajemen Data</CardTitle>
        <CardDescription>
          Hapus semua data transaksi dan konten untuk memulai dari awal. Akun login dan pengaturan perusahaan tetap dipertahankan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Close Period */}
        <ClosePeriod />

        <Separator />

        {/* Backup & Restore */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Backup & Restore
          </p>
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Backup seluruh data</p>
              <p className="text-xs text-muted-foreground">
                Unduh seluruh data (akun, jurnal, faktur, pegawai, aset, upload dokumen) sebagai file
                backup <code className="font-mono">.financepro</code>.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadBackup} disabled={backupLoading}>
              {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Unduh Backup
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Restore dari backup</p>
              <p className="text-xs text-muted-foreground">
                Upload file backup <code className="font-mono">.financepro</code> untuk mengembalikan data.
                Seluruh data saat ini akan ditimpa.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input ref={restoreInputRef} type="file" accept=".financepro,.gz,.json" className="hidden" onChange={handleRestoreFile} />
              <Button variant="outline" size="sm" onClick={() => restoreInputRef.current?.click()} disabled={restoreMutation.isPending}>
                {restoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Pilih File Backup
              </Button>
            </div>
          </div>
          {(restoreMutation.isPending || restoreMutation.isSuccess || restoreMutation.isError) && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${restoreMutation.isSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-700" : restoreMutation.isError ? "border-rose-200 bg-rose-50 text-rose-700" : "border-muted bg-muted/30"}`}>
              {restoreMutation.isPending && "Restoring data... mohon tunggu."}
              {restoreMutation.isSuccess && `Restore berhasil (${formatBackupSummary(restoreMutation.data)})`}
              {restoreMutation.isError && restoreMutation.error?.message}
            </div>
          )}
        </div>

        <Separator />

        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Peringatan
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Menghapus data transaksi tidak dapat dibatalkan. Anda tetap bisa login dan menggunakan
              aplikasi, namun semua data transaksi akan kosong. Chart of Accounts, pengaturan perusahaan,
              dan akun login tidak akan dihapus.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Yang akan dihapus:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "Transaksi jurnal",
              "Faktur & baris faktur",
              "Kontak (pelanggan & pemasok)",
              "Rekening bank & kas",
              "Karyawan & payroll",
              "Persediaan barang",
              "Penerimaan & pembayaran",
              "Transfer antar rekening",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Trash2 className="h-3 w-3 shrink-0 text-rose-500" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Yang tetap dipertahankan:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "Akun login",
              "Pengaturan perusahaan",
              "Chart of Accounts",
              "Preferensi tampilan",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="sticky bottom-0 z-10 flex flex-col items-stretch gap-3 border-t bg-card/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Anda tetap bisa login dengan akun yang sama setelah reset.
          </span>
        </div>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full sm:w-auto">
              <Trash2 className="h-4 w-4" />
              Hapus Semua Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Semua Data?</AlertDialogTitle>
              <AlertDialogDescription>
                Tindakan ini akan menghapus seluruh data transaksi secara permanen
                dan tidak dapat dibatalkan. Akun login dan pengaturan tidak terpengaruh.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetMutation.isPending}>
                Batal
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                {resetMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Ya, Hapus Semua
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

// ---------- Close Period ----------

function ClosePeriod() {
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = React.useState(false);

  const settingsQuery = useQuery<{ settings: CompanySettings }>({
    queryKey: ["settings", "company"],
    queryFn: async () => {
      const res = await authFetch("/api/settings/company");
      if (!res.ok) throw new Error("Gagal memuat pengaturan");
      return res.json();
    },
  });

  const lockedUntil = (settingsQuery.data?.settings as Record<string, unknown>)?.periodLockedUntil as string | null | undefined;

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLockedUntil: new Date().toISOString() }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Gagal menutup periode");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Periode ditutup", { description: "Jurnal baru tidak boleh sebelum tanggal ini" });
      setShowConfirm(false);
      qc.invalidateQueries({ queryKey: ["settings", "company"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLockedUntil: null }),
      });
      if (!res.ok) throw new Error("Gagal membuka periode");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Periode dibuka", { description: "Jurnal boleh dibuat kapan saja" });
      qc.invalidateQueries({ queryKey: ["settings", "company"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Tutup Periode
      </p>
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Kunci Periode Akuntansi</p>
          <p className="text-xs text-muted-foreground">
            {lockedUntil
              ? `Periode ditutup per ${new Date(lockedUntil).toLocaleDateString("id-ID")}. Jurnal tidak boleh sebelum tanggal ini.`
              : "Belum ada periode yang dikunci. Semua tanggal jurnal diizinkan."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lockedUntil ? (
            <Button variant="outline" size="sm" onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending}>
              Buka Periode
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(true)}>
              Tutup Periode
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tutup Periode?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua jurnal baru tidak boleh di-backdate ke sebelum tanggal ini. Dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              Ya, Tutup Periode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Opening Balance Tab (Manager.io principle) ----------

type OpeningAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  side: "DEBIT" | "CREDIT";
};

type OpeningExisting = {
  id: string;
  entryNumber: string;
  date: string;
  reference: string | null;
  lines: { accountCode: string; accountName: string; debit: number; credit: number; description: string | null }[];
  totalDebit: number;
  totalCredit: number;
};

const SIDE_LABEL: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  DEBIT: { label: "Debit", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: ArrowUpRight },
  CREDIT: { label: "Kredit", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400", icon: ArrowDownRight },
};

const TYPE_HEADER: Record<string, string> = {
  ASSET: "Aset (Debit)",
  LIABILITY: "Kewajiban (Kredit)",
  EQUITY: "Ekuitas (Kredit)",
};

function OpeningBalanceTab() {
  const qc = useQueryClient();
  const [balances, setBalances] = React.useState<Record<string, string>>({});
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const company = useSettingsStore((s) => s.company);
  const moneyOpts = company
    ? {
        symbol: company.currencySymbol ?? "Rp",
        position: (company.currencyPosition ?? "before") as "before" | "after",
        thousandSep: company.thousandSeparator ?? ".",
        decimalSep: company.decimalSeparator ?? ",",
        decimalPlaces: company.decimalPlaces ?? 0,
      }
    : DEFAULT_MONEY_OPTS;

  const { data, isLoading } = useQuery<{
    canPost: boolean;
    otherEntries: number;
    existing: OpeningExisting | null;
    defaultEquityAccountCode: string | null;
    defaultEquityAccountName: string | null;
    accounts: OpeningAccount[];
  }>({
    queryKey: ["opening-balance"],
    queryFn: async () => {
      const res = await authFetch("/api/opening-balance");
      if (!res.ok) throw new Error("Gagal memuat status saldo awal");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const accounts = data?.accounts ?? [];
  const existing = data?.existing ?? null;

  const setBal = (code: string, value: string) =>
    setBalances((prev) => ({ ...prev, [code]: value }));

  const totalDebit = accounts.reduce((s, a) => {
    const v = Math.abs(Number(balances[a.code]) || 0);
    return s + (a.side === "DEBIT" ? v : 0);
  }, 0);
  const totalCredit = accounts.reduce((s, a) => {
    const v = Math.abs(Number(balances[a.code]) || 0);
    return s + (a.side === "CREDIT" ? v : 0);
  }, 0);
  const diff = totalDebit - totalCredit;
  const isBalanced = Math.abs(diff) < 0.01;
  const hasAny = accounts.some((a) => Math.abs(Number(balances[a.code]) || 0) > 0);
  // Selisih debit≠kredit diserap otomatis ke akun ekuitas (3-1000) di sisi server,
  // jadi tidak perlu diblokir saat hanya aset (atau hanya kewajiban) yang diisi.
  const canSubmit = hasAny && !!date;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = accounts
        .map((a) => ({ accountCode: a.code, amount: Math.abs(Number(balances[a.code]) || 0) }))
        .filter((b) => b.amount > 0);
      const res = await authFetch("/api/opening-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, balances: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan saldo awal");
      return json;
    },
    onSuccess: (json) => {
      toast.success("Saldo awal berhasil dicatat", {
        description: diff !== 0 ? `Selisih diserap otomatis (${data?.defaultEquityAccountCode ?? "3-1000"})` : "Jurnal saldo awal dibuat.",
      });
      qc.invalidateQueries({ queryKey: ["opening-balance"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/opening-balance", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menghapus saldo awal");
      return json;
    },
    onSuccess: () => {
      toast.success("Saldo awal dihapus", { description: "Anda dapat mengisi ulang saldo awal." });
      setBalances({});
      qc.invalidateQueries({ queryKey: ["opening-balance"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Card><FormSkeleton /></Card>;
  }

  // Sudah ada saldo awal -> tampilkan ringkasan
  if (existing) {
    const sectionByType: Record<string, { code: string; name: string; debit: number; credit: number }[]> = {};
    for (const l of existing.lines) {
      const key = l.debit > 0 ? "DEBIT" : "CREDIT";
      if (!sectionByType[key]) sectionByType[key] = [];
      sectionByType[key].push({ code: l.accountCode, name: l.accountName, debit: l.debit, credit: l.credit });
    }
    return (
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-base">Saldo Awal Tercatat</CardTitle>
              <CardDescription>
                Jurnal {existing.entryNumber} · {formatDate(existing.date)} — saldo awal tidak dapat diubah lagi
                setelah transaksi berjalan.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className={`rounded-lg border p-4 ${isBalanced ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40" : "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40"}`}>
            <p className="text-sm font-medium">
              {isBalanced ? "Jurnal Balanced ✓" : "Jurnal TIDAK Balanced ✗"} — Debit {formatMoney(existing.totalDebit, moneyOpts)} = Kredit {formatMoney(existing.totalCredit, moneyOpts)}
            </p>
          </div>

          <div className="space-y-4">
            {(["DEBIT", "CREDIT"] as const).map((side) => {
              const lines = sectionByType[side] ?? [];
              if (lines.length === 0) return null;
              const sideConf = SIDE_LABEL[side];
              const Icon = sideConf.icon;
              return (
                <div key={side} className="overflow-hidden rounded-lg border">
                  <div className={`flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold ${sideConf.cls}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {sideConf.label} ({lines.length} akun)
                  </div>
                  <div className="divide-y">
                    {lines.map((l) => (
                      <div key={l.code} className="flex items-center justify-between px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-muted-foreground">{l.code}</code>
                          <span className="text-sm">{l.name}</span>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatMoney(l.debit > 0 ? l.debit : l.credit, moneyOpts)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2.5">
              <span className="text-sm font-medium">Total</span>
              <span className="font-semibold tabular-nums">
                Debit {formatMoney(existing.totalDebit, moneyOpts)} · Kredit {formatMoney(existing.totalCredit, moneyOpts)}
              </span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="sticky bottom-0 z-10 flex justify-end border-t bg-card/95 py-3 backdrop-blur">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
                Hapus Saldo Awal
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus Saldo Awal?</AlertDialogTitle>
                <AlertDialogDescription>
                  Jurnal saldo awal dan seluruh saldonya akan dihapus. Anda bisa mengisi ulang saldo
                  awal hanya jika belum ada transaksi lain.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteMutation.isPending}>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Ya, Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    );
  }

  // Sudah ada transaksi lain -> tidak bisa mengisi saldo awal
  if (!data?.canPost) {
    return (
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="h-5 w-5 text-muted-foreground" /> Saldo Awal
          </CardTitle>
          <CardDescription>
            Saldo awal hanya bisa diisi saat pertama kali aplikasi digunakan, sebelum ada transaksi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Sudah tercatat {data?.otherEntries ?? 0} transaksi jurnal
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Prinsip Manager.io: saldo awal diisi sebelum transaksi pertama. Untuk mengisi saldo awal,
                hapus semua data transaksi terlebih dahulu melalui tab "Data", lalu isi saldo awal lagi.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Form saldo awal
  const groups = ["ASSET", "LIABILITY", "EQUITY"] as const;
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Saldo Awal</CardTitle>
            <CardDescription>
              Isi saldo setiap akun neraca saat pertama kali memulai pembukuan. Selisih otomatis diserap
              ke <code className="font-mono text-xs">{data?.defaultEquityAccountCode ?? "3-1000"}</code>{" "}
              ({data?.defaultEquityAccountName ?? "Modal Pemilik"}).
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="opening-date">Tanggal Saldo Awal</Label>
            <Input
              id="opening-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-52"
            />
          </div>
        </div>

        {groups.map((g) => {
          const list = accounts.filter((a) => a.type === g);
          const anyValue = list.some((a) => Math.abs(Number(balances[a.code]) || 0) > 0);
          if (!anyValue && g !== "ASSET") return null;
          return (
            <div key={g} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {TYPE_HEADER[g]}
              </p>
              <div className="overflow-hidden rounded-lg border">
                {list.map((a) => {
                  const sideConf = SIDE_LABEL[a.side];
                  return (
                    <div key={a.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-muted-foreground">{a.code}</code>
                          <span className="truncate text-sm">{a.name}</span>
                        </div>
                        <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${sideConf.cls}`}>
                          <span className="h-1 w-1 rounded-full" />
                          {sideConf.label}
                        </span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={balances[a.code] ?? ""}
                        onChange={(e) => setBal(a.code, e.target.value)}
                        className="w-36 text-right tabular-nums"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Ringkasan balancing */}
        <div className={`overflow-hidden rounded-lg border ${isBalanced ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40" : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"}`}>
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Aset (Debit)</span>
              <span className="font-semibold tabular-nums">{formatMoney(totalDebit, moneyOpts)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Kewajiban + Ekuitas (Kredit)</span>
              <span className="font-semibold tabular-nums">{formatMoney(totalCredit, moneyOpts)}</span>
            </div>
            <div className="flex items-center justify-between sm:col-span-2 border-t pt-2">
              <span className="text-sm font-medium">Selisih (otomatis → {data?.defaultEquityAccountCode ?? "3-1000"})</span>
              <span className={`font-semibold tabular-nums ${isBalanced ? "text-emerald-600" : "text-amber-600"}`}>
                {isBalanced ? formatMoney(0, moneyOpts) : formatMoney(Math.abs(diff), moneyOpts)}
              </span>
            </div>
          </div>
          <div className={`border-t px-4 py-2 text-xs ${isBalanced ? "text-emerald-700" : "text-amber-700"} dark:text-emerald-300 dark:text-amber-300`}>
            {isBalanced
              ? "✓ Jurnal akan balanced. Selisih tidak diperlukan."
              : diff > 0
                ? `Aset lebih besar ${formatMoney(diff, moneyOpts)} — selisih akan di-kredit ke ${data?.defaultEquityAccountCode ?? "3-1000"} (Modal Pemilik).`
                : `Kewajiban+Ekuitas lebih besar ${formatMoney(Math.abs(diff), moneyOpts)} — selisih akan di-debit ke ${data?.defaultEquityAccountCode ?? "3-1000"} (Modal Pemilik).`}
          </div>
        </div>
      </CardContent>

      <CardFooter className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-card/95 py-3 backdrop-blur">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!canSubmit || saveMutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PiggyBank className="mr-1.5 h-4 w-4" />}
          Catat Saldo Awal
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------- Tab 9: Riwayat Perubahan (Audit Log) ----------

type SettingsLogItem = {
  id: string;
  section: "COMPANY" | "PREFERENCES" | "PASSWORD";
  action: "CREATE" | "UPDATE" | "PASSWORD_CHANGED";
  summary: string;
  changes: { field: string; label: string; before: unknown; after: unknown }[];
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
};

const SECTION_LABEL: Record<string, string> = {
  COMPANY: "Profil Perusahaan",
  PREFERENCES: "Tampilan",
  PASSWORD: "Keamanan",
};

const SECTION_BADGE: Record<string, string> = {
  COMPANY:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  PREFERENCES:
    "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  PASSWORD:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};

function formatLogValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  return String(v);
}

function LogItem({ log }: { log: SettingsLogItem }) {
  const [open, setOpen] = React.useState(false);
  const hasChanges = log.changes.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/20 px-4 py-2.5">
        <Badge variant="outline" className={cn(SECTION_BADGE[log.section])}>
          {SECTION_LABEL[log.section] ?? log.section}
        </Badge>
        <span className="text-sm font-medium">{log.summary}</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>{log.userName ?? log.userEmail ?? "User"}</span>
          <span className="tabular-nums">
            {new Date(log.createdAt).toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {hasChanges && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {open ? "Tutup" : "Detail"}
            </Button>
          )}
        </span>
      </div>
      {hasChanges && open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Kolom</th>
                <th className="px-4 py-2 font-medium">Sebelum</th>
                <th className="px-4 py-2 font-medium">Sesudah</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {log.changes.map((c) => (
                <tr key={c.field}>
                  <td className="px-4 py-2 text-muted-foreground">{c.label}</td>
                  <td className="px-4 py-2 text-muted-foreground line-through decoration-muted-foreground/50">
                    {formatLogValue(c.before)}
                  </td>
                  <td className="px-4 py-2 font-medium">{formatLogValue(c.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsLogTab() {
  const [section, setSection] = React.useState("ALL");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{
    logs: SettingsLogItem[];
  }>({
    queryKey: ["settings", "logs", section],
    queryFn: async () => {
      const qs = section === "ALL" ? "" : `?section=${section}`;
      const res = await authFetch(`/api/settings/logs${qs}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Gagal memuat riwayat");
      }
      return res.json();
    },
    staleTime: 15 * 1000,
  });

  const logs = data?.logs ?? [];

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" /> Riwayat Perubahan Pengaturan
            </CardTitle>
            <CardDescription>
              Catatan audit: siapa mengubah pengaturan, kapan, dan nilai sebelum/sesudahnya.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Bagian</SelectItem>
                <SelectItem value="COMPANY">Profil Perusahaan</SelectItem>
                <SelectItem value="PREFERENCES">Tampilan</SelectItem>
                <SelectItem value="PASSWORD">Keamanan</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Muat Ulang
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <FormSkeleton />
        ) : isError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {error?.message ?? "Gagal memuat riwayat"}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <History className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Belum ada perubahan pengaturan tercatat.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <LogItem key={log.id} log={log} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Grid fitur pengaturan (gaya Manager.io: jumlah record di kiri) ----------

function SettingsFeatureGrid({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (v: TabKey) => void;
}) {
  const { data, isLoading } = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["settings", "counts"],
    queryFn: async () => {
      const res = await authFetch("/api/settings/counts");
      if (!res.ok) throw new Error("Gagal memuat jumlah record");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const counts = data?.counts;

  return (
    <TabsList className="grid h-auto w-full grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {TABS.map((t) => {
        const Icon = t.icon;
        const count = counts?.[t.key];
        return (
          <TabsTrigger
            key={t.key}
            value={t.key}
            className="group h-auto flex-col items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left data-[state=active]:bg-accent data-[state=active]:shadow-none"
          >
            <div className="flex w-full items-start justify-between">
              <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {isLoading ? "…" : (count ?? 0).toLocaleString("id-ID")}
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <span className="text-xs font-semibold leading-tight">{t.label}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              {t.desc}
            </span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

// ---------- Users Tab (SUPERADMIN only) ----------

import { useRole } from "@/components/auth-provider";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/types";

function UsersTab() {
  const { canManageUsers } = useRole();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = React.useState(false);
  const [editUser, setEditUser] = React.useState<{ id: string; name: string; email: string; role: string; isActive: boolean } | null>(null);

  const usersQuery = useQuery<{ users: { id: string; email: string; name: string; role: string; isActive: boolean; lastLoginAt: string | null; createdAt: string }[] }>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await authFetch("/api/users");
      if (!res.ok) throw new Error("Gagal memuat daftar user");
      return res.json();
    },
    enabled: canManageUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Gagal menonaktifkan user");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("User berhasil dinonaktifkan");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!canManageUsers) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Hanya Super Admin yang dapat mengelola pengguna.
        </CardContent>
      </Card>
    );
  }

  const users = usersQuery.data?.users ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Pengelolaan Pengguna</h3>
          <p className="text-sm text-muted-foreground">Buat, ubah, dan nonaktifkan akun pengguna</p>
        </div>
        <Button onClick={() => { setEditUser(null); setShowCreate(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Tambah User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Nama</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Login Terakhir</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === "SUPERADMIN" ? "default" : "secondary"}>
                        {ROLE_LABELS[u.role as Role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.isActive ? "default" : "destructive"}>
                        {u.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("id-ID") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setShowCreate(true); }}>
                        Edit
                      </Button>
                      {u.isActive && (
                        <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => {
                          if (confirm(`Nonaktifkan user ${u.name}?`)) deleteMutation.mutate(u.id);
                        }}>
                          Nonaktifkan
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Belum ada user</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showCreate && (
        <UserDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          editUser={editUser}
          onSaved={() => { setShowCreate(false); setEditUser(null); qc.invalidateQueries({ queryKey: ["users"] }); }}
        />
      )}
    </div>
  );
}

function UserDialog({
  open,
  onOpenChange,
  editUser,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editUser: { id: string; name: string; email: string; role: string; isActive: boolean } | null;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(editUser?.name ?? "");
  const [email, setEmail] = React.useState(editUser?.email ?? "");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<Role>((editUser?.role as Role) ?? "ADMIN");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editUser) {
        const body: Record<string, unknown> = { name, email, role };
        if (password) body.password = password;
        const res = await authFetch(`/api/users/${editUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Gagal mengupdate user");
        }
        toast.success("User berhasil diupdate");
      } else {
        const res = await authFetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, role }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Gagal membuat user");
        }
        toast.success("User berhasil dibuat");
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editUser ? "Edit User" : "Tambah User Baru"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Nama</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-password">{editUser ? "Password Baru (kosongkan jika tidak ubah)" : "Password"}</Label>
            <Input id="u-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!editUser} minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editUser ? "Simpan" : "Buat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main view ----------

export function SettingsView() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("company");

  const companyQuery = useQuery<{ settings: CompanySettings }>({
    queryKey: ["settings", "company"],
    queryFn: async () => {
      const res = await authFetch("/api/settings/company");
      if (!res.ok) throw new Error("Gagal memuat pengaturan perusahaan");
      return res.json();
    },
  });

  const prefsQuery = useQuery<{ preferences: UserPreferences }>({
    queryKey: ["settings", "preferences"],
    queryFn: async () => {
      const res = await authFetch("/api/settings/preferences");
      if (!res.ok) throw new Error("Gagal memuat preferensi");
      return res.json();
    },
  });

  const isLoading = companyQuery.isLoading || prefsQuery.isLoading;
  const company = companyQuery.data?.settings;
  const preferences = prefsQuery.data?.preferences;

  return (
    <div className="space-y-6">
      {/* Top header card */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl">Pengaturan</CardTitle>
              <CardDescription>
                Kelola profil perusahaan, mata uang, pajak, dan preferensi tampilan.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <SettingsFeatureGrid activeTab={activeTab} onTabChange={(v) => setActiveTab(v as TabKey)} />

        {/* Tab contents */}
        <TabsContent value="company" className="mt-4">
          {isLoading || !company ? (
            <Card><FormSkeleton /></Card>
          ) : (
            <CompanyTab data={company} />
          )}
        </TabsContent>

        <TabsContent value="opening" className="mt-4">
          <OpeningBalanceTab />
        </TabsContent>

        <TabsContent value="coa" className="mt-4">
          <AccountsView manageable />
        </TabsContent>

        <TabsContent value="currency" className="mt-4">
          {isLoading || !company ? (
            <Card><FormSkeleton /></Card>
          ) : (
            <CurrencyTab data={company} />
          )}
        </TabsContent>

        <TabsContent value="fiscal" className="mt-4">
          {isLoading || !company ? (
            <Card><FormSkeleton /></Card>
          ) : (
            <FiscalTab data={company} />
          )}
        </TabsContent>

        <TabsContent value="tax" className="mt-4">
          {isLoading || !company ? (
            <Card><FormSkeleton /></Card>
          ) : (
            <TaxTab data={company} />
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {isLoading || !company ? (
            <Card><FormSkeleton /></Card>
          ) : (
            <DocumentsTab data={company} />
          )}
        </TabsContent>

        <TabsContent value="appearance" className="mt-4">
          {isLoading || !preferences ? (
            <Card><FormSkeleton /></Card>
          ) : (
            <AppearanceTab data={preferences} />
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          {/* Security tab doesn't depend on company/prefs data */}
          <SecurityTab />
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <DataTab />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <SettingsLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
