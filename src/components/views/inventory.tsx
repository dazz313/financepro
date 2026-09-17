"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Search,
  Boxes,
  AlertTriangle,
  Tag,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
  Pencil,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Info,
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState, EmptyState, Money } from "@/components/ui-helpers";
import { formatDate } from "@/lib/accounting";
import { useSettingsStore, previewCode } from "@/lib/settings-store";
import { authFetch } from "@/components/auth-provider";

// ---------- Types ----------
type MovementType = "IN" | "OUT" | "ADJUST";

type InventoryItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  quantityOnHand: number;
  reorderLevel: number;
  inventoryAccountCode: string | null;
  salesAccountCode: string | null;
  cogsAccountCode: string | null;
  division: string | null;
  hideNameOnDocuments: boolean;
  isActive: boolean;
  stockValue: number;
  lowStock: boolean;
  _count: { movements: number };
};

type InventoryMovement = {
  id: string;
  date: string;
  type: MovementType;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  reference: string | null;
  description: string | null;
  itemId: string;
  item: { code: string; name: string; unit: string };
};

type BankAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  accountCode: string;
};

// ---------- Helpers ----------
const UNIT_OPTIONS = ["pcs", "rim", "box", "kg", "dus", "liter"];

function MovementTypeBadge({ type }: { type: MovementType }) {
  const map: Record<
    MovementType,
    { label: string; className: string; icon: React.ElementType }
  > = {
    IN: {
      label: "Masuk",
      className:
        "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      icon: ArrowDownToLine,
    },
    OUT: {
      label: "Keluar",
      className:
        "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
      icon: ArrowUpFromLine,
    },
    ADJUST: {
      label: "Penyesuaian",
      className:
        "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      icon: SlidersHorizontal,
    },
  };
  const conf = map[type];
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", conf.className)}>
      <Icon className="h-3 w-3" />
      {conf.label}
    </Badge>
  );
}

function useBankAccounts() {
  return useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal memuat akun bank");
      return res.json();
    },
    staleTime: 60_000,
  });
}

// ---------- Item Form Dialog (Create / Edit) ----------
const EMPTY_ITEM = {
  code: "",
  name: "",
  description: "",
  category: "",
  unit: "pcs",
  purchasePrice: "",
  salePrice: "",
  quantityOnHand: "",
  reorderLevel: "",
  inventoryAccountCode: "1-1400",
  salesAccountCode: "4-1000",
  cogsAccountCode: "5-2000",
  division: "",
  hideNameOnDocuments: false,
};

type CoaAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  isGroup: boolean;
};

// Opsi reversible ala Manager.io: centang untuk membuka kolom terkait
function RevealOption({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background">
      <label
        htmlFor={id}
        className="flex cursor-pointer select-none items-start gap-3 px-4 py-3"
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5"
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{label}</span>
          {hint && (
            <span className="block text-xs text-muted-foreground">{hint}</span>
          )}
        </span>
      </label>
      {checked && children && (
        <div className="space-y-2 px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

function ItemFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: InventoryItem | null;
}) {
  const qc = useQueryClient();
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);
  const [form, setForm] = React.useState({ ...EMPTY_ITEM });
  const [codeEdited, setCodeEdited] = React.useState(false);
  const [optQty, setOptQty] = React.useState(false);
  const [optIncome, setOptIncome] = React.useState(false);
  const [optExpense, setOptExpense] = React.useState(false);
  const [optLineDesc, setOptLineDesc] = React.useState(false);
  const [optPurchase, setOptPurchase] = React.useState(false);
  const [optSales, setOptSales] = React.useState(false);
  const [optDivision, setOptDivision] = React.useState(false);
  const [optHideName, setOptHideName] = React.useState(false);

  React.useEffect(() => {
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        description: editing.description ?? "",
        category: editing.category ?? "",
        unit: editing.unit,
        purchasePrice: String(editing.purchasePrice || ""),
        salePrice: String(editing.salePrice || ""),
        quantityOnHand: String(editing.quantityOnHand || ""),
        reorderLevel: String(editing.reorderLevel || ""),
        inventoryAccountCode: editing.inventoryAccountCode ?? "1-1400",
        salesAccountCode: editing.salesAccountCode ?? "4-1000",
        cogsAccountCode: editing.cogsAccountCode ?? "5-2000",
        division: editing.division ?? "",
        hideNameOnDocuments: editing.hideNameOnDocuments,
      });
      setCodeEdited(false);
      setOptQty((editing.quantityOnHand ?? 0) > 0);
      setOptIncome(true);
      setOptExpense(true);
      setOptLineDesc(!!editing.description);
      setOptPurchase((editing.purchasePrice ?? 0) > 0);
      setOptSales((editing.salePrice ?? 0) > 0);
      setOptDivision(!!editing.division);
      setOptHideName(editing.hideNameOnDocuments);
    } else {
      // Ambil settings terbaru agar preview nomor berikutnya akurat
      void fetchCompany();
      setForm({ ...EMPTY_ITEM });
      setCodeEdited(false);
      setOptQty(false);
      setOptIncome(false);
      setOptExpense(false);
      setOptLineDesc(false);
      setOptPurchase(false);
      setOptSales(false);
      setOptDivision(false);
      setOptHideName(false);
    }
  }, [editing, open]);

  // Preview nomor berikutnya dari settings (server tetap sumber penomoran auto-increment)
  const effectiveCode = editing
    ? form.code
    : codeEdited
      ? form.code
      : (previewCode(company, "inventoryItem") || "");

  // Akun untuk opsi "Akun Pemasukan/Beban Kustom"
  const { data: accountsData } = useQuery<{ accounts: CoaAccount[] }>({
    queryKey: ["accounts", "item-form"],
    queryFn: async () => {
      const res = await authFetch("/api/accounts?balances=false");
      if (!res.ok) throw new Error("Gagal memuat akun");
      return res.json();
    },
  });
  const revenueAccounts = (accountsData?.accounts ?? []).filter(
    (a) => !a.isGroup && a.type === "REVENUE"
  );
  const expenseAccounts = (accountsData?.accounts ?? []).filter(
    (a) => !a.isGroup && a.type === "EXPENSE"
  );

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: editing ? form.code.trim() : codeEdited ? form.code.trim() : "",
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        unit: form.unit,
        purchasePrice: Number(form.purchasePrice) || 0,
        salePrice: Number(form.salePrice) || 0,
        quantityOnHand: Number(form.quantityOnHand) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        inventoryAccountCode: form.inventoryAccountCode,
        salesAccountCode: form.salesAccountCode,
        cogsAccountCode: form.cogsAccountCode,
        division: form.division.trim() || undefined,
        hideNameOnDocuments: optHideName,
      };
      // Edit currently not supported by API (POST only); editing is via PATCH
      // But API does not expose PATCH for inventory items, so we only support create.
      const res = await authFetch("/api/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan item");
      return data;
    },
    onSuccess: (data: { item?: { code?: string } }) => {
      toast.success("Item persediaan dibuat", {
        description: `${form.name} (${data?.item?.code ?? effectiveCode})`,
      });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      void fetchCompany();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal menyimpan item", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Nama item wajib diisi");
      return;
    }
    mutation.mutate();
  };

  const totalOpeningValue =
    (Number(form.quantityOnHand) || 0) * (Number(form.purchasePrice) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Item Persediaan" : "Tambah Item Persediaan"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Perbarui detail item."
              : "Buat item baru. Stok awal &gt; 0 akan otomatis membuat movement IN dan jurnal saldo awal."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="item-code">Kode / SKU</Label>
              <Input
                id="item-code"
                value={effectiveCode}
                readOnly
                className="bg-muted/40 font-mono uppercase"
              />
              <p className="text-[11px] text-muted-foreground">
                Dibuat otomatis sesuai urutan.
              </p>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="item-name">
                Nama Barang <span className="text-destructive">*</span>
              </Label>
              <Input
                id="item-name"
                placeholder="Kertas A4 80gsm"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item-unit">Satuan</Label>
            <Select value={form.unit} onValueChange={(v) => update("unit", v)}>
              <SelectTrigger id="item-unit" className="w-full sm:w-64">
                <SelectValue placeholder="Pilih satuan" />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <RevealOption
              id="opt-qty"
              label="Jumlah yang diinginkan"
              hint="Stok awal item. Nilai &gt; 0 otomatis membuat movement IN dan jurnal saldo awal."
              checked={optQty}
              onCheckedChange={setOptQty}
            >
              <Input
                id="opt-qty-input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={form.quantityOnHand}
                onChange={(e) => update("quantityOnHand", e.target.value)}
                disabled={!!editing}
              />
            </RevealOption>

            <RevealOption
              id="opt-income"
              label="Akun Pemasukan Kustom"
              hint="Akun pendapatan default saat item dijual (default: 4-1000)."
              checked={optIncome}
              onCheckedChange={setOptIncome}
            >
              <Select
                value={form.salesAccountCode}
                onValueChange={(v) => update("salesAccountCode", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {revenueAccounts.length === 0 ? (
                    <SelectItem value={form.salesAccountCode}>
                      {form.salesAccountCode}
                    </SelectItem>
                  ) : (
                    revenueAccounts.map((a) => (
                      <SelectItem key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </RevealOption>

            <RevealOption
              id="opt-expense"
              label="Akun Beban Kustom"
              hint="Akun beban/HPP default saat item dibeli (default: 5-2000)."
              checked={optExpense}
              onCheckedChange={setOptExpense}
            >
              <Select
                value={form.cogsAccountCode}
                onValueChange={(v) => update("cogsAccountCode", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.length === 0 ? (
                    <SelectItem value={form.cogsAccountCode}>
                      {form.cogsAccountCode}
                    </SelectItem>
                  ) : (
                    expenseAccounts.map((a) => (
                      <SelectItem key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </RevealOption>

            <RevealOption
              id="opt-line-desc"
              label="Isi otomatis — Deskripsi Baris"
              hint="Deskripsi default yang dipakai di tiap baris faktur/kuitansi."
              checked={optLineDesc}
              onCheckedChange={setOptLineDesc}
            >
              <Textarea
                id="opt-line-desc-input"
                placeholder="mis. jasa instalasi, ATK bulanan..."
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={2}
              />
            </RevealOption>

            <RevealOption
              id="opt-purchase"
              label="Isi otomatis — Pembelian — Harga Satuan"
              hint="Harga beli default per satuan."
              checked={optPurchase}
              onCheckedChange={setOptPurchase}
            >
              <Input
                id="opt-purchase-input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={form.purchasePrice}
                onChange={(e) => update("purchasePrice", e.target.value)}
              />
            </RevealOption>

            <RevealOption
              id="opt-sales"
              label="Isi otomatis — Penjualan — Harga Satuan"
              hint="Harga jual default per satuan."
              checked={optSales}
              onCheckedChange={setOptSales}
            >
              <Input
                id="opt-sales-input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={form.salePrice}
                onChange={(e) => update("salePrice", e.target.value)}
              />
            </RevealOption>

            <RevealOption
              id="opt-division"
              label="Isi otomatis — Penjualan — Divisi"
              hint="Divisi yang dipakai sebagai default saat item dijual (opsional)."
              checked={optDivision}
              onCheckedChange={setOptDivision}
            >
              <Input
                id="opt-division-input"
                placeholder="mis. Retail, Online, grosir..."
                value={form.division}
                onChange={(e) => update("division", e.target.value)}
              />
            </RevealOption>

            <RevealOption
              id="opt-hide-name"
              label="Sembunyikan nama item pada dokumen yang dicetak"
              hint="Nama barang tidak tampil pada faktur/kuitansi yang dicetak."
              checked={optHideName}
              onCheckedChange={setOptHideName}
            />
          </div>

          {totalOpeningValue > 0 && !editing && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
              <Info className="h-3.5 w-3.5" />
              Nilai stok awal:{" "}
              <Money value={totalOpeningValue} className="font-semibold" /> —
              jurnal saldo awal otomatis dibuat.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Menyimpan..." : "Simpan Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Movement Form Dialog ----------
function MovementFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: itemsData, isLoading: itemsLoading } = useQuery<{
    items: InventoryItem[];
  }>({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const res = await authFetch("/api/inventory/items?category=ALL");
      if (!res.ok) throw new Error("Gagal memuat item");
      return res.json();
    },
    enabled: open,
  });
  const { data: banksData } = useBankAccounts();

  const items = itemsData?.items ?? [];
  const banks = banksData?.bankAccounts ?? [];

  const [itemId, setItemId] = React.useState("");
  const [type, setType] = React.useState<MovementType>("IN");
  const [date, setDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [quantity, setQuantity] = React.useState("");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState("");

  const selected = items.find((i) => i.id === itemId) || null;

  React.useEffect(() => {
    if (selected && type === "IN") {
      setUnitPrice(String(selected.purchasePrice || ""));
    }
  }, [selected, type]);

  React.useEffect(() => {
    if (!open) {
      setItemId("");
      setType("IN");
      setDate(new Date().toISOString().slice(0, 10));
      setQuantity("");
      setUnitPrice("");
      setReference("");
      setDescription("");
      setBankAccountId("");
    }
  }, [open]);

  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const totalValue = qty * price;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          date,
          type,
          quantity: qty,
          unitPrice: price,
          reference: reference.trim() || undefined,
          description: description.trim() || undefined,
          bankAccountId: bankAccountId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Gagal mencatat pergerakan stok");
      return data;
    },
    onSuccess: (data) => {
      toast.success("Pergerakan stok tercatat", {
        description: `${selected?.name} • ${type} ${qty} ${selected?.unit} • sisa stok: ${data.newQuantity ?? "-"}`,
      });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal mencatat pergerakan", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!itemId || !date || !type || !qty) {
      toast.error("Item, tanggal, tipe, dan jumlah wajib diisi");
      return;
    }
    if (type === "OUT" && selected && qty > selected.quantityOnHand) {
      toast.error(
        `Stok tidak cukup. Tersedia ${selected.quantityOnHand} ${selected.unit}.`
      );
      return;
    }
    if (type === "IN" && !bankAccountId) {
      toast.error("Pilih akun kas/bank pembayaran (uang keluar harus tampil di Pembayaran)");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Catat Pergerakan Stok</DialogTitle>
          <DialogDescription>
            Penerimaan (IN), pengeluaran (OUT), atau penyesuaian (ADJUST).
            Setiap pergerakan otomatis membuat jurnal akuntansi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="mv-item">Barang</Label>
            <Select
              value={itemId}
              onValueChange={setItemId}
              disabled={itemsLoading}
            >
              <SelectTrigger id="mv-item" className="w-full">
                <SelectValue
                  placeholder={
                    itemsLoading ? "Memuat..." : "Pilih barang"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {items.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Belum ada item.
                  </div>
                ) : (
                  items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      <span className="font-mono text-xs">{i.code}</span> —{" "}
                      {i.name} (stok: {i.quantityOnHand} {i.unit})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mv-type">Tipe</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as MovementType)}
              >
                <SelectTrigger id="mv-type" className="w-full">
                  <SelectValue placeholder="Pilih tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">
                    <span className="flex items-center gap-1.5">
                      <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                      Masuk (IN)
                    </span>
                  </SelectItem>
                  <SelectItem value="OUT">
                    <span className="flex items-center gap-1.5">
                      <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-600" />
                      Keluar (OUT)
                    </span>
                  </SelectItem>
                  <SelectItem value="ADJUST">
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-amber-600" />
                      Penyesuaian (ADJUST)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-date">Tanggal</Label>
              <Input
                id="mv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mv-qty">
                Jumlah {selected ? `(${selected.unit})` : ""}
              </Label>
              <Input
                id="mv-qty"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-price">
                Harga Satuan (Rp)
                {type === "OUT" && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (HPP)
                  </span>
                )}
              </Label>
              <Input
                id="mv-price"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
          </div>

          {type === "IN" && (
            <div className="grid gap-2">
              <Label htmlFor="mv-bank">Bayar dari Akun Kas/Bank <span className="text-destructive">*</span></Label>
              <Select
                value={bankAccountId}
                onValueChange={setBankAccountId}
              >
                <SelectTrigger id="mv-bank" className="w-full">
                  <SelectValue placeholder="Pilih akun..." />
                </SelectTrigger>
                <SelectContent>
                  {banks.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Belum ada akun kas/bank.
                    </div>
                  ) : (
                    banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="font-mono text-xs">{b.code}</span> —{" "}
                        {b.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Wajib diisi: pembelian stok tercatat otomatis di view Pembayaran.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mv-ref">Referensi</Label>
              <Input
                id="mv-ref"
                placeholder="PO/2024/001"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-desc">Keterangan</Label>
              <Input
                id="mv-desc"
                placeholder="Catatan"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {totalValue > 0 && (
            <div
              className={cn(
                "rounded-lg border p-3",
                type === "IN" && "bg-emerald-500/5",
                type === "OUT" && "bg-rose-500/5",
                type === "ADJUST" && "bg-amber-500/5"
              )}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Nilai</span>
                <Money
                  value={totalValue}
                  className={cn(
                    "font-bold",
                    type === "IN" && "text-emerald-600 dark:text-emerald-400",
                    type === "OUT" && "text-rose-600 dark:text-rose-400",
                    type === "ADJUST" && "text-amber-600 dark:text-amber-400"
                  )}
                />
              </div>
              {selected && type === "OUT" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sisa stok setelah transaksi:{" "}
                  <span className="font-medium">
                    {Math.max(0, selected.quantityOnHand - qty)}{" "}
                    {selected.unit}
                  </span>
                </p>
              )}
              {selected && type === "IN" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Stok setelah transaksi:{" "}
                  <span className="font-medium">
                    {selected.quantityOnHand + qty} {selected.unit}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Memproses..." : "Catat Pergerakan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Stats ----------
function InventoryStats({ items }: { items: InventoryItem[] }) {
  const totalValue = items.reduce((s, i) => s + i.stockValue, 0);
  const lowStockCount = items.filter((i) => i.lowStock).length;
  const categories = new Set(
    items.map((i) => i.category).filter(Boolean)
  ).size;

  const stats = [
    {
      label: "Total Item",
      value: (
        <span className="text-xl font-bold tabular-nums">{items.length}</span>
      ),
      icon: Package,
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      label: "Total Nilai Stok",
      value: <Money value={totalValue} className="text-xl font-bold" />,
      icon: Boxes,
      accent: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
    },
    {
      label: "Stok Menipis",
      value: (
        <span
          className={cn(
            "text-xl font-bold tabular-nums",
            lowStockCount > 0
              ? "text-rose-600 dark:text-rose-400"
              : "text-muted-foreground"
          )}
        >
          {lowStockCount}
        </span>
      ),
      icon: AlertTriangle,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
    {
      label: "Kategori",
      value: (
        <span className="text-xl font-bold tabular-nums">{categories}</span>
      ),
      icon: Tag,
      accent: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  s.accent
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </p>
                <div className="mt-0.5">{s.value}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Items Tab ----------
function ItemsTab({
  items,
  isLoading,
}: {
  items: InventoryItem[];
  isLoading: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("ALL");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InventoryItem | null>(null);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [moveItem, setMoveItem] = React.useState<InventoryItem | null>(null);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set).sort();
  }, [items]);

  const filtered = React.useMemo(() => {
    let list = items;
    if (categoryFilter !== "ALL")
      list = list.filter((i) => i.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, categoryFilter, search]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setFormOpen(true);
  };
  const openMovement = (item: InventoryItem) => {
    setMoveItem(item);
    setMoveOpen(true);
  };

  return (
    <>
      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
      <MovementFormDialog open={moveOpen} onOpenChange={setMoveOpen} />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Daftar Barang</CardTitle>
              <CardDescription>
                {filtered.length} dari {items.length} item
              </CardDescription>
            </div>
            <Button onClick={openCreate} className="sm:w-auto w-full">
              <Plus className="h-4 w-4" />
              Tambah Barang
            </Button>
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nama / kode / kategori..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[180px]">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Kategori</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState rows={6} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title={
                items.length === 0 ? "Belum ada item" : "Tidak ada hasil"
              }
              description={
                items.length === 0
                  ? "Tambahkan item persediaan pertama untuk mulai melacak stok."
                  : "Coba ubah filter atau kata kunci pencarian."
              }
              action={
                items.length === 0 ? (
                  <Button onClick={openCreate} size="sm">
                    <Plus className="h-4 w-4" />
                    Tambah Barang
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Kode / SKU</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Harga Beli</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead className="text-center">Stok</TableHead>
                    <TableHead className="text-right">Nilai Stok</TableHead>
                    <TableHead className="pr-6 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="pl-6 font-mono text-xs font-medium">
                        {i.code}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{i.name}</span>
                          {i.description && (
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {i.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {i.category ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-muted text-xs text-muted-foreground"
                          >
                            <Tag className="h-3 w-3" />
                            {i.category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {i.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={i.purchasePrice} className="text-xs" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={i.salePrice} className="text-xs" />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          <span
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              i.lowStock &&
                                "text-rose-600 dark:text-rose-400"
                            )}
                          >
                            {i.quantityOnHand} {i.unit}
                          </span>
                          {i.lowStock && (
                            <Badge
                              variant="outline"
                              className="mt-0.5 gap-1 border-transparent bg-rose-100 px-1.5 py-0 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Menipis
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Money
                          value={i.stockValue}
                          className="text-xs font-semibold"
                        />
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => openMovement(i)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline ml-1">
                              Pergerakan
                            </span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => openEdit(i)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
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
    </>
  );
}

// ---------- Movements Tab ----------
function MovementsTab() {
  const { data, isLoading } = useQuery<{ movements: InventoryMovement[] }>({
    queryKey: ["inventory-movements"],
    queryFn: async () => {
      const res = await authFetch("/api/inventory/movements?limit=100");
      if (!res.ok) throw new Error("Gagal memuat pergerakan stok");
      return res.json();
    },
  });

  const [open, setOpen] = React.useState(false);
  const movements = data?.movements ?? [];

  return (
    <>
      <MovementFormDialog open={open} onOpenChange={setOpen} />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Pergerakan Stok</CardTitle>
              <CardDescription>
                {movements.length} entri terbaru
              </CardDescription>
            </div>
            <Button onClick={() => setOpen(true)} className="sm:w-auto w-full">
              <ArrowRightLeft className="h-4 w-4" />
              Catat Pergerakan
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState rows={6} />
            </div>
          ) : movements.length === 0 ? (
            <EmptyState
              icon={<ArrowRightLeft className="h-5 w-5" />}
              title="Belum ada pergerakan stok"
              description="Catat penerimaan, pengeluaran, atau penyesuaian stok pertama Anda."
              action={
                <Button onClick={() => setOpen(true)} size="sm">
                  <Plus className="h-4 w-4" />
                  Catat Pergerakan
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Tanggal</TableHead>
                    <TableHead>Barang</TableHead>
                    <TableHead className="text-center">Tipe</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Total Nilai</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead className="pr-6">Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="pl-6 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(m.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {m.item.name}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {m.item.code}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <MovementTypeBadge type={m.type} />
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {m.quantity} {m.item.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={m.unitPrice} className="text-xs" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money
                          value={m.totalValue}
                          className={cn(
                            "text-xs font-semibold",
                            m.type === "IN" &&
                              "text-emerald-600 dark:text-emerald-400",
                            m.type === "OUT" &&
                              "text-rose-600 dark:text-rose-400",
                            m.type === "ADJUST" &&
                              "text-amber-600 dark:text-amber-400"
                          )}
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.reference ? (
                          <span className="font-mono text-muted-foreground">
                            {m.reference}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-xs text-muted-foreground">
                        {m.description || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------- Main View ----------
export function InventoryView() {
  const [tab, setTab] = React.useState("items");

  const { data, isLoading } = useQuery<{ items: InventoryItem[] }>({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const res = await authFetch("/api/inventory/items?category=ALL");
      if (!res.ok) throw new Error("Gagal memuat item persediaan");
      return res.json();
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Persediaan Barang</h2>
        <p className="text-sm text-muted-foreground">
          Kelola item persediaan dan pergerakan stok. Setiap transaksi stok
          otomatis membuat jurnal akuntansi.
        </p>
      </div>

      {/* Stats */}
      {!isLoading && items.length > 0 && <InventoryStats items={items} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Daftar Barang</span>
            <span className="sm:hidden">Barang</span>
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-1.5">
            <ArrowRightLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Pergerakan Stok</span>
            <span className="sm:hidden">Pergerakan</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <ItemsTab items={items} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <MovementsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
