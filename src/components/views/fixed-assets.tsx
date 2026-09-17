"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Search,
  Building2,
  Truck,
  Monitor,
  Cog,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  Scale,
  Pencil,
  Trash2,
  Wallet,
  Layers,
  Landmark,
  Timer,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingState, EmptyState, Money } from "@/components/ui-helpers";
import { formatDate } from "@/lib/accounting";
import { authFetch } from "@/components/auth-provider";
import { monthlyDepreciation, monthsBetween, bookValue, toPeriod } from "@/lib/depreciation";
import { useSettingsStore, previewCode } from "@/lib/settings-store";

// ---------- Types ----------
type DepreciationRecord = {
  id: string;
  period: string;
  date: string;
  expense: number;
  accumulated: number;
  journalEntryId: string | null;
};

type FixedAsset = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  assetAccountCode: string;
  accumulatedAccountCode: string;
  expenseAccountCode: string;
  purchaseDate: string;
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  bankAccountId: string | null;
  isDisposed: boolean;
  disposalDate: string | null;
  disposalPrice: number;
  journalEntryId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  depreciatedToPeriod: string | null;
  latestPeriod: string;
  depreciationCount: number;
  depreciations?: DepreciationRecord[];
};

type BankAccount = {
  id: string;
  code: string;
  name: string;
  accountCode: string;
  type: string;
};

type CoaAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  isGroup: boolean;
};

const CATEGORIES = ["Peralatan", "Kendaraan", "Bangunan", "Mesin", "Komputer", "Lainnya"];

function CategoryIcon({ category, className }: { category: string | null; className?: string }) {
  switch (category) {
    case "Peralatan":
    case "Mesin":
      return <Cog className={className} />;
    case "Kendaraan":
      return <Truck className={className} />;
    case "Bangunan":
      return <Building2 className={className} />;
    case "Komputer":
      return <Monitor className={className} />;
    default:
      return <Package className={className} />;
  }
}

function CategoryBadge({ category }: { category: string | null }) {
  const map: Record<string, string> = {
    Peralatan: "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    Kendaraan: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    Bangunan: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    Mesin: "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    Komputer: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  };
  return (
    <Badge variant="outline" className={cn(map[category ?? ""] ?? "bg-muted")}>
      {category ?? "Lainnya"}
    </Badge>
  );
}

function StatusBadge({ asset }: { asset: FixedAsset }) {
  if (asset.isDisposed) {
    return <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">Disposisi</Badge>;
  }
  return <Badge variant="outline" className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Aktif</Badge>;
}

// ---------- Create Asset Dialog ----------
function CreateAssetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);
  const [code, setCode] = React.useState("");
  const [codeEdited, setCodeEdited] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("Peralatan");
  const [purchaseDate, setPurchaseDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [purchasePrice, setPurchasePrice] = React.useState("");
  const [residualValue, setResidualValue] = React.useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = React.useState("60");
  const [assetAccountCode, setAssetAccountCode] = React.useState("1-2100");
  const [accumulatedAccountCode, setAccumulatedAccountCode] = React.useState("1-2900");
  const [expenseAccountCode, setExpenseAccountCode] = React.useState("5-3000");
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const { data: banksData } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal memuat akun bank");
      return res.json();
    },
  });

  const { data: accountsData } = useQuery<{ accounts: CoaAccount[] }>({
    queryKey: ["accounts", "fixed-assets-form"],
    queryFn: async () => {
      const res = await authFetch("/api/accounts?balances=false");
      if (!res.ok) throw new Error("Gagal memuat akun");
      return res.json();
    },
  });

  const price = Number(purchasePrice) || 0;
  const residual = Number(residualValue) || 0;
  const months = Number(usefulLifeMonths) || 0;
  const monthly = monthlyDepreciation(price, residual, months);
  const monthsElapsed = purchaseDate ? monthsBetween(purchaseDate, new Date().toISOString()) : 0;
  const projectedAccum = monthly * Math.min(monthsElapsed, months);

  const activeAccounts = (accountsData?.accounts ?? []).filter(
    (a) => !a.isGroup && (a.type === "ASSET" || a.type === "EXPENSE")
  );

  const reset = () => {
    setCode(""); setCodeEdited(false); setName(""); setDescription(""); setCategory("Peralatan");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchasePrice(""); setResidualValue(""); setUsefulLifeMonths("60");
    setAssetAccountCode("1-2100"); setAccumulatedAccountCode("1-2900"); setExpenseAccountCode("5-3000");
    setBankAccountId(""); setNotes("");
  };

  // Tampilkan preview nomor berikutnya; server tetap sumber penomoran (auto-increment)
  const effectiveCode = codeEdited ? code : previewCode(company, "fixedAsset");

  // Prefill kode aset otomatis sesuai Pengaturan Perusahaan
  React.useEffect(() => {
    if (!open) return;
    void fetchCompany();
    setCode("");
    setCodeEdited(false);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/fixed-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeEdited ? code.trim().toUpperCase() : "",
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          purchaseDate,
          purchasePrice: price,
          residualValue: residual,
          usefulLifeMonths: months,
          assetAccountCode,
          accumulatedAccountCode,
          expenseAccountCode,
          bankAccountId: bankAccountId || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal membuat aset");
      return data;
    },
    onSuccess: () => {
      toast.success("Aset tetap berhasil ditambahkan", { description: "Pembayaran & jurnal pembelian auto-post." });
      qc.invalidateQueries({ queryKey: ["fixed-assets"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      void fetchCompany();
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!name.trim()) {
      toast.error("Nama aset wajib diisi");
      return;
    }
    if (months <= 0) {
      toast.error("Umur ekonomis (bulan) wajib > 0");
      return;
    }
    if (price > 0 && !bankAccountId) {
      toast.error("Pilih akun kas/bank (uang keluar harus tercatat di Pembayaran)");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" /> Tambah Aset Tetap
          </DialogTitle>
          <DialogDescription>
            Perolehan aset akan otomatis mencatat pembayaran (view Pembayaran) dan jurnal (Debit Aset, Kredit Kas/Bank).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="fa-code">Kode Aset</Label>
              <Input id="fa-code" className="uppercase font-mono" placeholder="FA-001 (otomatis)" value={effectiveCode} onChange={(e) => { setCode(e.target.value); setCodeEdited(true); }} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fa-name">Nama Aset <span className="text-destructive">*</span></Label>
              <Input id="fa-name" placeholder="Laptop Dell XPS" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="fa-category">Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="fa-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fa-date">Tanggal Perolehan</Label>
              <Input id="fa-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="fa-price">Harga Perolehan (Rp)</Label>
              <Input id="fa-price" type="number" min={0} value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className="text-right tabular-nums" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fa-residual">Nilai Sisa (Rp)</Label>
              <Input id="fa-residual" type="number" min={0} value={residualValue} onChange={(e) => setResidualValue(e.target.value)} className="text-right tabular-nums" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fa-life">Umur Ekonomis (bulan)</Label>
              <Input id="fa-life" type="number" min={1} value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} className="text-right tabular-nums" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fa-bank">Bayar dari Akun Kas/Bank {price > 0 && <span className="text-destructive">*</span>}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger id="fa-bank"><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
              <SelectContent>
                {(banksData?.bankAccounts ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!bankAccountId && price > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Wajib diisi: pembelian tercatat otomatis di view Pembayaran.
              </p>
            )}
          </div>

          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Akun Akuntansi</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Akun Aset</Label>
                <Select value={assetAccountCode} onValueChange={setAssetAccountCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.filter((a) => a.type === "ASSET").map((a) => (
                      <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Akumulasi</Label>
                <Select value={accumulatedAccountCode} onValueChange={setAccumulatedAccountCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.filter((a) => a.type === "ASSET").map((a) => (
                      <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Beban Penyusutan</Label>
                <Select value={expenseAccountCode} onValueChange={setExpenseAccountCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.filter((a) => a.type === "EXPENSE").map((a) => (
                      <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {price > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Penyusutan Straight-Line</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                <span>Per bulan: <Money value={monthly} /></span>
                <span>Setahun: <Money value={monthly * 12} /></span>
              </div>
              {monthsElapsed > 0 && (
                <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-500">
                  Proyeksi akumulasi s.d. bulan ini ({monthsElapsed} bulan): <Money value={projectedAccum} />
                </p>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="fa-desc">Deskripsi</Label>
            <Textarea id="fa-desc" rows={2} placeholder="Spesifikasi / lokasi aset" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fa-notes">Catatan</Label>
            <Input id="fa-notes" placeholder="Nomor seri, garansi, dll." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Tambah Aset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Depreciation Run Dialog ----------
function DepreciateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [period, setPeriod] = React.useState(toPeriod(new Date().toISOString()));
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/fixed-assets/depreciate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menjalankan penyusutan");
      return data;
    },
    onSuccess: (data) => {
      const count = (data.entries ?? []).filter((e: any) => e.status !== "SKIP").length;
      toast.success(`Penyusutan ${period} selesai`, {
        description: count > 0 ? `${count} aset disusutkan · total ${new Intl.NumberFormat("id-ID").format(data.totalExpense ?? 0)}` : "Tidak ada aset yang perlu disusutkan",
      });
      qc.invalidateQueries({ queryKey: ["fixed-assets"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-emerald-600" /> Jalankan Penyusutan
          </DialogTitle>
          <DialogDescription>
            Hitung penyusutan straight-line untuk semua aset aktif pada periode terpilih.
            Jurnal akan dibuat otomatis (Debit Beban Penyusutan, Kredit Akumulasi Penyusutan).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="dep-period">Periode (YYYY-MM)</Label>
            <Input id="dep-period" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-01" className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dep-date">Tanggal Jurnal</Label>
            <Input id="dep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Aset yang sudah disusutkan pada periode sama tidak akan diproses dua kali.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <TrendingDown className="mr-1.5 h-4 w-4" />}
            Jalankan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Dispose Dialog ----------
function DisposeDialog({ asset, open, onOpenChange }: { asset: FixedAsset | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [disposalPrice, setDisposalPrice] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [reason, setReason] = React.useState("");

  const { data: banksData } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  const bookValueRemaining = asset ? asset.bookValue : 0;
  const price = Number(disposalPrice) || 0;
  const gainLoss = price - bookValueRemaining;

  const mutation = useMutation({
    mutationFn: async () => {
      if (price > 0 && !bankAccountId) {
        throw new Error("Pilih akun kas/bank penerima hasil penjualan (uang masuk harus tampil di Penerimaan)");
      }
      const res = await authFetch(`/api/fixed-assets/${asset!.id}/dispose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, disposalPrice: price, bankAccountId: bankAccountId || undefined, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal disposisi aset");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Aset ${asset?.code} didisposisi`, {
        description: data.gainLoss > 0 ? `Laba ${new Intl.NumberFormat("id-ID").format(data.gainLoss)}` : data.gainLoss < 0 ? `Rugi ${new Intl.NumberFormat("id-ID").format(Math.abs(data.gainLoss))}` : "Tidak ada laba/rugi",
      });
      qc.invalidateQueries({ queryKey: ["fixed-assets"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-600" /> Disposisi Aset {asset?.code}
          </DialogTitle>
          <DialogDescription>
            Keluarkan aset dari pembukuan. Hasil penjualan dicatat ke kas/bank, selisih nilai buku
            menjadi laba/rugi disposisi.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Harga perolehan</span>
              <span className="font-semibold"><Money value={asset?.purchasePrice ?? 0} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Akumulasi penyusutan</span>
              <span className="font-semibold"><Money value={asset?.accumulatedDepreciation ?? 0} /></span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t pt-1">
              <span className="font-medium">Nilai buku</span>
              <span className="font-semibold"><Money value={bookValueRemaining} /></span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="disp-date">Tanggal</Label>
              <Input id="disp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="disp-price">Harga Jual (Rp)</Label>
              <Input id="disp-price" type="number" min={0} value={disposalPrice} onChange={(e) => setDisposalPrice(e.target.value)} className="text-right tabular-nums" />
            </div>
          </div>

          {price > 0 && (
            <div className={`rounded-lg border p-3 text-xs ${gainLoss >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40"}`}>
              {gainLoss >= 0 ? "Laba penjualan" : "Rugi penjualan"}: <Money value={Math.abs(gainLoss)} />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="disp-bank">Hasil Jual ke Akun {price > 0 && <span className="text-destructive">*</span>}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger id="disp-bank"><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
              <SelectContent>
                {(banksData?.bankAccounts ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {price > 0 && !bankAccountId && <p className="text-[10px] text-muted-foreground">Wajib diisi: hasil jual tercatat otomatis di view Penerimaan.</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="disp-reason">Alasan / Catatan</Label>
            <Input id="disp-reason" placeholder="Dijual / rusak / dihapus" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="bg-rose-600 hover:bg-rose-700">
            {mutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
            Disposisi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- KPI ----------
function AssetsStats({ assets, loading }: { assets: FixedAsset[]; loading: boolean }) {
  const active = assets.filter((a) => !a.isDisposed);
  const totalCost = active.reduce((s, a) => s + a.purchasePrice, 0);
  const totalAccum = active.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const totalBook = active.reduce((s, a) => s + a.bookValue, 0);
  const disposedCount = assets.filter((a) => a.isDisposed).length;

  const rows = [
    { label: "Nilai Perolehan", value: <Money value={totalCost} />, icon: Wallet, accent: "bg-sky-500/10 text-sky-600", hint: `${active.length} aset aktif` },
    { label: "Akumulasi Penyusutan", value: <Money value={totalAccum} />, icon: TrendingDown, accent: "bg-amber-500/10 text-amber-600", hint: "Total disusutkan" },
    { label: "Nilai Buku Bersih", value: <Money value={totalBook} />, icon: Scale, accent: "bg-emerald-500/10 text-emerald-600", hint: "Perolehan - akumulasi" },
    { label: "Disposisi", value: String(disposedCount), icon: Trash2, accent: "bg-rose-500/10 text-rose-600", hint: "Terjual / dihapus" },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <Card key={r.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", r.accent)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{r.label}</p>
                <p className="text-lg font-bold leading-tight">{r.value}</p>
                <p className="truncate text-[10px] text-muted-foreground">{r.hint}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Detail Dialog ----------
function AssetDetailDialog({ asset, open, onOpenChange }: { asset: FixedAsset | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!asset) return null;
  const deps = asset.depreciations ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CategoryIcon category={asset.category} className="h-5 w-5 text-emerald-600" />
            {asset.code} — {asset.name}
          </DialogTitle>
          <DialogDescription>
            {asset.description || "Tidak ada deskripsi"} · dibeli {formatDate(asset.purchaseDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Perolehan</p>
            <p className="text-base font-bold"><Money value={asset.purchasePrice} /></p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Akumulasi</p>
            <p className="text-base font-bold text-amber-600"><Money value={asset.accumulatedDepreciation} /></p>
          </div>
          <div className="rounded-lg border bg-emerald-500/10 p-3">
            <p className="text-[10px] uppercase text-emerald-600">Nilai Buku</p>
            <p className="text-base font-bold text-emerald-600"><Money value={asset.bookValue} /></p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">Kategori</p>
            <CategoryBadge category={asset.category} />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">Umur Ekonomis</p>
            <p className="flex items-center gap-1 font-medium"><Timer className="h-3.5 w-3.5 text-muted-foreground" />{asset.usefulLifeMonths} bulan</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">Penyusutan/bulan</p>
            <p className="font-medium"><Money value={asset.monthlyDepreciation} /></p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">Metode</p>
            <p className="font-medium">Straight-Line</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Akun Akuntansi</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <code className="rounded bg-muted px-1.5 py-0.5">Aset: {asset.assetAccountCode}</code>
            <code className="rounded bg-muted px-1.5 py-0.5">Akumulasi: {asset.accumulatedAccountCode}</code>
            <code className="rounded bg-muted px-1.5 py-0.5">Beban: {asset.expenseAccountCode}</code>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Riwayat Penyusutan ({deps.length})
          </p>
          {deps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada penyusutan tercatat.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Beban</TableHead>
                    <TableHead className="text-right">Akumulasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deps.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.period}</TableCell>
                      <TableCell className="text-xs">{formatDate(d.date)}</TableCell>
                      <TableCell className="text-right tabular-nums"><Money value={d.expense} /></TableCell>
                      <TableCell className="text-right tabular-nums"><Money value={d.accumulated} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main View ----------
export function FixedAssetsView() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [depOpen, setDepOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState("assets");
  const [detail, setDetail] = React.useState<FixedAsset | null>(null);
  const [disposeTarget, setDisposeTarget] = React.useState<FixedAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<FixedAsset | null>(null);

  const { data, isLoading } = useQuery<{ assets: FixedAsset[] }>({
    queryKey: ["fixed-assets"],
    queryFn: async () => {
      const res = await authFetch("/api/fixed-assets");
      if (!res.ok) throw new Error("Gagal memuat aset tetap");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
  const assets = data?.assets ?? [];

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q);
  });

  const deleteMutation = useMutation({
    mutationFn: async (asset: FixedAsset) => {
      const res = await authFetch(`/api/fixed-assets/${asset.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal menghapus aset");
      return json;
    },
    onSuccess: () => {
      toast.success("Aset dihapus");
      qc.invalidateQueries({ queryKey: ["fixed-assets"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Aset Tetap</h2>
          <p className="text-sm text-muted-foreground">
            Register aset dengan penyusutan otomatis straight-line ala Manager.io.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDepOpen(true)}>
            <TrendingDown className="mr-1.5 h-4 w-4 text-emerald-600" />
            Jalankan Penyusutan
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah Aset
          </Button>
        </div>
      </div>

      <AssetsStats assets={assets} loading={isLoading} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="assets" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Daftar Aset</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Jadwal Penyusutan</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-4">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">Register Aset Tetap</CardTitle>
                  <CardDescription>{assets.length} aset terdaftar.</CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="w-full pl-9 sm:w-60" placeholder="Cari aset..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4"><LoadingState rows={5} /></div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Package className="h-6 w-6" />}
                  title="Belum ada aset tetap"
                  description={search ? "Coba kata kunci lain." : "Tambahkan aset pertama Anda."}
                  action={<Button size="sm" onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-1.5 h-4 w-4" /> Tambah Aset</Button>}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Aset</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="hidden md:table-cell">Perolehan</TableHead>
                        <TableHead className="hidden lg:table-cell">Akumulasi</TableHead>
                        <TableHead>Nilai Buku</TableHead>
                        <TableHead className="hidden lg:table-cell">Peny./bulan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="pr-4 text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((a) => {
                        return (
                          <TableRow key={a.id} className="hover:bg-muted/40">
                            <TableCell className="pl-4">
                              <button className="text-left" onClick={() => setDetail(a)}>
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                    <CategoryIcon category={a.category} className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{a.name}</p>
                                    <p className="font-mono text-[10px] text-muted-foreground">{a.code} · {formatDate(a.purchaseDate)}</p>
                                  </div>
                                </div>
                              </button>
                            </TableCell>
                            <TableCell><CategoryBadge category={a.category} /></TableCell>
                            <TableCell className="hidden md:table-cell tabular-nums"><Money value={a.purchasePrice} /></TableCell>
                            <TableCell className="hidden lg:table-cell tabular-nums text-amber-600"><Money value={a.accumulatedDepreciation} /></TableCell>
                            <TableCell className="tabular-nums font-semibold"><Money value={a.bookValue} /></TableCell>
                            <TableCell className="hidden lg:table-cell tabular-nums text-muted-foreground"><Money value={a.monthlyDepreciation} /></TableCell>
                            <TableCell><StatusBadge asset={a} /></TableCell>
                            <TableCell className="pr-4">
                              <div className="flex items-center justify-end gap-0.5">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetail(a)} title="Detail">
                                  <Layers className="h-3.5 w-3.5" />
                                </Button>
                                {!a.isDisposed && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setDisposeTarget(a)} title="Disposisi">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(a)} title="Hapus">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader className="border-b">
              <div className="space-y-1">
                <CardTitle className="text-base">Jadwal Penyusutan</CardTitle>
                <CardDescription>
                  Penyusutan per periode per aset. Jalankan via tombol "Jalankan Penyusutan".
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4"><LoadingState rows={5} /></div>
              ) : assets.length === 0 ? (
                <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Belum ada aset" description="Tambahkan aset terlebih dahulu." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Aset</TableHead>
                        <TableHead>Perolehan</TableHead>
                        <TableHead>Umur</TableHead>
                        <TableHead className="hidden md:table-cell">Peny./bulan</TableHead>
                        <TableHead className="hidden lg:table-cell">Tersusut s.d.</TableHead>
                        <TableHead className="text-right pr-4">Sisa Disusutkan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assets.map((a) => {
                        const monthsElapsed = monthsBetween(a.purchaseDate, new Date().toISOString());
                        const maxDep = Math.max(0, a.purchasePrice - a.residualValue);
                        const totalPossible = Math.min(maxDep, (a.monthlyDepreciation || 0) * a.usefulLifeMonths);
                        const remaining = Math.max(0, totalPossible - a.accumulatedDepreciation);
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="pl-4">
                              <div className="flex items-center gap-2">
                                <CategoryIcon category={a.category} className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="text-sm font-medium">{a.name}</p>
                                  <p className="font-mono text-[10px] text-muted-foreground">{a.code}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums"><Money value={a.purchasePrice} /></TableCell>
                            <TableCell>{a.usefulLifeMonths} bln ({Math.floor(a.usefulLifeMonths / 12)} thn)</TableCell>
                            <TableCell className="hidden md:table-cell tabular-nums"><Money value={a.monthlyDepreciation} /></TableCell>
                            <TableCell className="hidden lg:table-cell font-mono text-xs">{a.depreciatedToPeriod ?? "—"}</TableCell>
                            <TableCell className="text-right pr-4 tabular-nums"><Money value={remaining} /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateAssetDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DepreciateDialog open={depOpen} onOpenChange={setDepOpen} />
      {detail && <AssetDetailDialog asset={detail} open={!!detail} onOpenChange={(v) => !v && setDetail(null)} />}
      {disposeTarget && <DisposeDialog asset={disposeTarget} open={!!disposeTarget} onOpenChange={(v) => !v && setDisposeTarget(null)} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus aset ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Aset <span className="font-semibold">{deleteTarget?.code}</span> ({deleteTarget?.name}) beserta
              riwayat penyusutannya akan dihapus permanen. Jurnal pembelian tidak ikut dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}