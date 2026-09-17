"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Percent,
  Plus,
  Search,
  ShieldCheck,
  Layers,
  BadgeCheck,
  RotateCcw,
  Trash2,
  Pencil,
  Landmark,
  Building2,
  ReceiptText,
  Split,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authFetch } from "@/components/auth-provider";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { LoadingState, EmptyState } from "@/components/ui-helpers";
import { TAX_CATEGORY_LABEL, TAX_CATEGORIES, TAX_APPLIES_LABEL, type TaxBracket } from "@/lib/tax-utils";

// ---------- Types ----------
type TaxRule = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  rate: number;
  brackets: TaxBracket[] | null;
  appliesTo: string;
  accountCode: string;
  isActive: boolean;
  isSystem: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type TaxDraft = {
  code: string;
  name: string;
  description: string;
  category: string;
  rate: string;
  brackets: string; // JSON string dari editor progresif
  appliesTo: string;
  accountCode: string;
  notes: string;
};

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { className: string; icon: React.ElementType }> = {
    PPN: { className: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", icon: ReceiptText },
    PPH21: { className: "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300", icon: BadgeCheck },
    PPH23: { className: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", icon: BadgeCheck },
    PPH42: { className: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300", icon: BadgeCheck },
    PPH22: { className: "border-transparent bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", icon: BadgeCheck },
    PPH26: { className: "border-transparent bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300", icon: BadgeCheck },
    UMKM: { className: "border-transparent bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300", icon: Split },
    PPHBADAN: { className: "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300", icon: Building2 },
    PBB: { className: "border-transparent bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300", icon: Landmark },
    BPJS: { className: "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300", icon: ShieldCheck },
    OTHER: { className: "border-transparent bg-muted text-muted-foreground", icon: Layers },
  };
  const conf = map[category] ?? map.OTHER;
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", conf.className)}>
      <Icon className="h-3 w-3" />
      {TAX_CATEGORY_LABEL[category] ?? category}
    </Badge>
  );
}

function AppliesBadge({ appliesTo }: { appliesTo: string }) {
  const map: Record<string, string> = {
    SALES: "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    PURCHASE: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    PAYROLL: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    BOTH: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  };
  return (
    <Badge variant="outline" className={cn(map[appliesTo] ?? map.BOTH)}>
      {TAX_APPLIES_LABEL[appliesTo] ?? appliesTo}
    </Badge>
  );
}

function RateCell({ rate, brackets }: { rate: number; brackets: TaxBracket[] | null }) {
  if (brackets && brackets.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
        <Split className="h-3 w-3 text-muted-foreground" />
        Progresif
        <span className="text-muted-foreground">({brackets.map((b) => `${b[2]}%`).join("→")})</span>
      </span>
    );
  }
  return <span className="tabular-nums font-medium">{rate}%</span>;
}

function defaultDraft(): TaxDraft {
  return {
    code: "",
    name: "",
    description: "",
    category: "PPN",
    rate: "0",
    brackets: "[]",
    appliesTo: "BOTH",
    accountCode: "2-1200",
    notes: "",
  };
}

// ---------- Tax Rule Form Dialog (create + edit) ----------
function TaxRuleDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TaxRule | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState<TaxDraft>(() =>
    editing
      ? {
          code: editing.code,
          name: editing.name,
          description: editing.description ?? "",
          category: editing.category,
          rate: String(editing.rate ?? 0),
          brackets: JSON.stringify(editing.brackets ?? []),
          appliesTo: editing.appliesTo,
          accountCode: editing.accountCode,
          notes: editing.notes ?? "",
        }
      : defaultDraft()
  );
  const [bracketRows, setBracketRows] = React.useState<TaxBracket[]>(editing?.brackets ?? []);

  const set = <K extends keyof TaxDraft>(key: K, value: TaxDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateBracket = (idx: number, field: number, value: string) => {
    setBracketRows((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next: TaxBracket = [...r] as TaxBracket;
        if (field === 0) next[0] = Number(value) || 0;
        if (field === 1) next[1] = value === "" ? null : Number(value) || 0;
        if (field === 2) next[2] = Number(value) || 0;
        return next;
      })
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        rate: Number(form.rate) || 0,
        brackets: bracketRows.length > 0 ? bracketRows : undefined,
        appliesTo: form.appliesTo,
        accountCode: form.accountCode.trim() || "2-1200",
        notes: form.notes.trim() || undefined,
      };
      const url = editing ? `/api/tax/${editing.id}` : "/api/tax";
      const res = await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan aturan pajak");
      return data;
    },
    onSuccess: () => {
      toast.success(editing ? "Aturan pajak diperbarui" : "Aturan pajak ditambahkan", {
        description: `${form.name} siap dipakai.`,
      });
      qc.invalidateQueries({ queryKey: ["tax"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const useProgressive = bracketRows.length > 0;

  const onSubmit = () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Kode dan nama wajib diisi");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-emerald-600" />
            {editing ? "Perbarui Aturan Pajak" : "Tambah Aturan Pajak"}
          </DialogTitle>
          <DialogDescription>
            Konfigurasi jenis pajak/potongan yang berlaku (PPN, PPh, BPJS, dll).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tax-code">
                Kode <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tax-code"
                placeholder="PPN"
                className="uppercase font-mono"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                disabled={!!editing?.isSystem}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tax-name">
                Nama <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tax-name"
                placeholder="Pajak Pertambahan Nilai"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tax-category">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)} disabled={!!editing?.isSystem}>
                <SelectTrigger id="tax-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{TAX_CATEGORY_LABEL[c] ?? c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tax-applies">Berlaku Untuk</Label>
              <Select value={form.appliesTo} onValueChange={(v) => set("appliesTo", v)} disabled={!!editing?.isSystem}>
                <SelectTrigger id="tax-applies"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOTH">Semua</SelectItem>
                  <SelectItem value="SALES">Penjualan</SelectItem>
                  <SelectItem value="PURCHASE">Pembelian</SelectItem>
                  <SelectItem value="PAYROLL">Gaji</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!useProgressive && (
            <div className="grid gap-2">
              <Label htmlFor="tax-rate">Tarif (%)</Label>
              <div className="relative">
                <Input
                  id="tax-rate"
                  type="number"
                  min={0}
                  step="0.1"
                  className="pr-10 text-right tabular-nums"
                  value={form.rate}
                  onChange={(e) => set("rate", e.target.value)}
                />
                <Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Editor tarif progresif */}
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Split className="h-3.5 w-3.5 text-muted-foreground" /> Tarif Progresif (PPh 21)
              </Label>
              <Badge variant="outline" className={useProgressive ? "" : "text-muted-foreground"}>
                {useProgressive ? "Aktif" : "Nonaktif"}
              </Badge>
            </div>
            {useProgressive && (
              <div className="space-y-1.5">
                {bracketRows.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_36px] items-center gap-1.5">
                    <Input type="number" className="h-8 text-xs" value={b[0] || ""} placeholder="min" onChange={(e) => updateBracket(i, 0, e.target.value)} />
                    <Input type="number" className="h-8 text-xs" value={b[1] ?? ""} placeholder="max" onChange={(e) => updateBracket(i, 1, e.target.value)} />
                    <Input type="number" className="h-8 text-xs" value={b[2] || ""} placeholder="%" onChange={(e) => updateBracket(i, 2, e.target.value)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setBracketRows((r) => r.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setBracketRows(useProgressive ? [] : [[0, 60000000, 5]])}
              >
                {useProgressive ? "Gunakan Tarif Flat" : "Tambahkan Tarif Progresif"}
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-account">Akun Hutang Pajak (CoA)</Label>
            <Input
              id="tax-account"
              className="font-mono"
              placeholder="2-1200"
              value={form.accountCode}
              onChange={(e) => set("accountCode", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-desc">Deskripsi</Label>
            <Textarea
              id="tax-desc"
              rows={2}
              placeholder="Penjelasan singkat tentang pajak ini"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tax-notes">Dasar Hukum / Catatan</Label>
            <Input
              id="tax-notes"
              placeholder="mis. UU HPP No. 7/2021"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={onSubmit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editing ? "Simpan Perubahan" : "Tambah Aturan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- KPI cards ----------
function TaxStats({ rules, loading }: { rules: TaxRule[]; loading: boolean }) {
  const active = rules.filter((r) => r.isActive).length;
  const progressive = rules.filter((r) => (r.brackets?.length ?? 0) > 0).length;
  const categories = new Set(rules.map((r) => r.category)).size;
  const rows = [
    { label: "Total Aturan", value: String(rules.length), icon: Layers, accent: "bg-emerald-500/10 text-emerald-600", hint: "Pajak & potongan" },
    { label: "Aturan Aktif", value: String(active), icon: BadgeCheck, accent: "bg-sky-500/10 text-sky-600", hint: "Dipakai di sistem" },
    { label: "Tarif Progresif", value: String(progressive), icon: Split, accent: "bg-amber-500/10 text-amber-600", hint: "PPh 21 bertingkat" },
    { label: "Kategori", value: String(categories), icon: ShieldCheck, accent: "bg-violet-500/10 text-violet-600", hint: "Jenis pajak" },
  ];
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
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
                <p className="text-xl font-bold leading-tight">{r.value}</p>
                <p className="truncate text-[10px] text-muted-foreground">{r.hint}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Main View ----------
export function TaxRulesView() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TaxRule | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<TaxRule | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);

  const { data, isLoading } = useQuery<{ rules: TaxRule[] }>({
    queryKey: ["tax"],
    queryFn: async () => {
      const res = await authFetch("/api/tax");
      if (!res.ok) throw new Error("Gagal memuat aturan pajak");
      return res.json();
    },
  });
  const rules = data?.rules ?? [];

  const filtered = rules.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.category || "").toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q)
    );
  });

  const toggleActive = useMutation({
    mutationFn: async (rule: TaxRule) => {
      const res = await authFetch(`/api/tax/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal mengubah status");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (rule: TaxRule) => {
      const res = await authFetch(`/api/tax/${rule.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menghapus aturan pajak");
      return data;
    },
    onSuccess: () => {
      toast.success("Aturan pajak dihapus");
      qc.invalidateQueries({ queryKey: ["tax"] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/tax", { method: "PUT" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal reset aturan pajak");
      return data;
    },
    onSuccess: () => {
      toast.success("Aturan pajak dikembalikan ke default", {
        description: "Kembali ke tarif resmi yang berlaku.",
      });
      qc.invalidateQueries({ queryKey: ["tax"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      setResetOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Pusat Pajak</h2>
          <p className="text-sm text-muted-foreground">
            Kelola semua jenis pajak & potongan yang berlaku di Indonesia.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetOpen(true)}
            disabled={resetMutation.isPending}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset Default
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah Aturan
          </Button>
        </div>
      </div>

      <TaxStats rules={rules} loading={isLoading} />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Daftar Aturan Pajak</CardTitle>
              <CardDescription>
                {rules.length} jenis pajak/potongan terdaftar.
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-full pl-9 sm:w-60"
                placeholder="Cari pajak..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingState rows={5} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Percent className="h-6 w-6" />}
              title="Tidak ada aturan pajak"
              description={search ? "Coba kata kunci lain." : "Tambahkan aturan pajak pertama Anda."}
              action={<Button size="sm" onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-1.5 h-4 w-4" /> Tambah Aturan</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 pr-2">Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Tarif</TableHead>
                    <TableHead className="hidden md:table-cell">Berlaku Untuk</TableHead>
                    <TableHead className="hidden lg:table-cell">Akun Pajak</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="pr-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/40">
                      <TableCell className="pl-4 pr-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{r.code}</code>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          {r.description && (
                            <p className="truncate text-xs text-muted-foreground max-w-56">{r.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><CategoryBadge category={r.category} /></TableCell>
                      <TableCell><RateCell rate={r.rate} brackets={r.brackets} /></TableCell>
                      <TableCell className="hidden md:table-cell"><AppliesBadge appliesTo={r.appliesTo} /></TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <code className="font-mono text-xs text-muted-foreground">{r.accountCode}</code>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.isActive}
                            disabled={toggleActive.isPending && toggleActive.variables?.id === r.id}
                            onCheckedChange={() => toggleActive.mutate(r)}
                          />
                          <span className="text-xs text-muted-foreground">{r.isActive ? "Aktif" : "Nonaktif"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => { setEditing(r); setEditOpen(true); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!r.isSystem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteTarget(r)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
        Aturan bawaan sistem tidak dapat dihapus — cukup nonaktifkan. Mengubah tarif PPN otomatis menyinkronkan
        tarif default di modul Faktur.
      </p>

      <TaxRuleDialog
        key={createOpen ? "create" : "create-closed"}
        open={createOpen}
        onOpenChange={setCreateOpen}
        editing={null}
      />
      <TaxRuleDialog
        key={editOpen ? editing?.id ?? "edit" : "edit-closed"}
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={editing}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus aturan pajak ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Aturan <span className="font-semibold">{deleteTarget?.code}</span> ({deleteTarget?.name}) akan dihapus
              permanen. Tindakan ini tidak dapat dibatalkan.
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

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Reset aturan pajak ke default?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Semua aturan pajak kustom akan dihapus dan dikembalikan ke daftar resmi bawaan sistem
              (PPN 11%, PPh 21, PPh 23, PPh 4(2), PPh 22, PPh 26, UMKM 0,5%, PPh Badan 22%, PBB, BPJS).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetOpen(false)}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
              {resetMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Reset Default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}