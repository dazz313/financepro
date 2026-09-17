"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle2,
  Eye,
  Trash2,
  ShoppingCart,
  TrendingUp,
  Calendar,
  X,
  Receipt,
  Printer,
  ClipboardList,
  Copy,
  Pencil,
  Layers,
  Package,
  PackageX,
  Loader2,
  Percent,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Money, LoadingState, EmptyState } from "@/components/ui-helpers";
import { formatDate } from "@/lib/accounting";
import { InvoicePreviewDialog, type InvoicePreviewData } from "@/components/invoice-preview";
import { authFetch } from "@/components/auth-provider";
import { useSettingsStore } from "@/lib/settings-store";

// ---------- Types ----------
type InvoiceType = "SALES" | "PURCHASE";
type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
type DocType = "QUOTE" | "ORDER" | "INVOICE";
// Opsi tampilan dokumen (arketipe sederhana): standar / tanpa deskripsi / judul kustom
type DocStyle = "STANDARD" | "NO_DESC" | "CUSTOM_TITLE";

type InventoryItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  quantityOnHand: number;
  isActive?: boolean;
};

type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  amount: number;
  itemId?: string | null;
  accountCode?: string | null;
};

type Invoice = {
  id: string;
  number: string;
  type: InvoiceType;
  documentType: DocType;
  parentInvoiceId?: string | null;
  contactId: string;
  contact: { id: string; name: string };
  date: string;
  dueDate: string | null;
  status: InvoiceStatus;
  notes: string | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  withholdingRate: number;
  total: number;
  footnote: string | null;
  customTitle: string | null;
  showLineNumber: boolean;
  paidAmount: number;
  payments?: { date: string; amount: number }[];
  createdAt: string;
  lines: InvoiceLine[];
  balanceDue?: number;
  paymentStatus?: PaymentStatus;
  daysOverdue?: number;
};

type Contact = {
  id: string;
  code: string;
  name: string;
  type: string;
  paymentTermsDays?: number | null;
};

type TypeFilter = "ALL" | "SALES" | "PURCHASE";
// Status turunan (dihitung): Terbuka / Kurang Bayar / Lunas / Jatuh Tempo / Lebih Bayar
type PaymentStatus = "OPEN" | "PARTIAL" | "PAID" | "OVERDUE" | "OVERPAID";
type DocTypeFilter = "ALL" | DocType;

// ---------- Filter config ----------
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "SALES", label: "Penjualan" },
  { key: "PURCHASE", label: "Pembelian" },
];

const DOC_TYPE_TABS: { key: DocTypeFilter; label: string; icon: React.ElementType }[] = [
  { key: "ALL", label: "Semua", icon: Layers },
  { key: "QUOTE", label: "Penawaran", icon: FileText },
  { key: "ORDER", label: "Pesanan", icon: ClipboardList },
  { key: "INVOICE", label: "Faktur", icon: Receipt },
];

const DOC_TYPE_LABEL: Record<DocType, string> = {
  QUOTE: "Penawaran",
  ORDER: "Pesanan",
  INVOICE: "Faktur",
};



// ---------- Badges ----------
function DocTypeBadge({ docType }: { docType: DocType }) {
  const map: Record<DocType, { label: string; className: string; icon: React.ElementType }> = {
    QUOTE: {
      label: "Penawaran",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-transparent",
      icon: FileText,
    },
    ORDER: {
      label: "Pesanan",
      className:
        "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-transparent",
      icon: ClipboardList,
    },
    INVOICE: {
      label: "Faktur",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-transparent",
      icon: Receipt,
    },
  };
  const conf = map[docType] ?? map.INVOICE;
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", conf.className)}>
      <Icon className="h-3 w-3" />
      {conf.label}
    </Badge>
  );
}

function InvoiceTypeBadge({ type }: { type: InvoiceType }) {
  const isSales = type === "SALES";
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent gap-1",
        isSales
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      )}
    >
      {isSales ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <ShoppingCart className="h-3 w-3" />
      )}
      {isSales ? "Penjualan" : "Pembelian"}
    </Badge>
  );
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const map: Record<
    InvoiceStatus,
    { label: string; className: string; icon: React.ElementType }
  > = {
    DRAFT: {
      label: "Draft",
      className: "bg-muted text-muted-foreground border-transparent",
      icon: FileText,
    },
    SENT: {
      label: "Terkirim",
      className:
        "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-transparent",
      icon: Receipt,
    },
    PAID: {
      label: "Lunas",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-transparent",
      icon: CheckCircle2,
    },
    OVERDUE: {
      label: "Jatuh Tempo",
      className:
        "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-transparent",
      icon: Calendar,
    },
    CANCELLED: {
      label: "Dibatalkan",
      className: "bg-muted text-muted-foreground border-transparent",
      icon: X,
    },
  };
  const conf = map[status];
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", conf.className)}>
      <Icon className="h-3 w-3" />
      {conf.label}
    </Badge>
  );
}

// Status hasil pembayaran — tampil 2 saja: Lunas (hijau) / Jatuh Tempo (merah),
// kecuali lebih bayar → langsung tertulis "Lebih Bayar".
function PaymentStatusBadge({ status, daysOverdue }: { status?: PaymentStatus; daysOverdue?: number }) {
  const map: Record<PaymentStatus, { label: string; className: string; icon: React.ElementType }> = {
    OPEN: {
      label: "Terbuka",
      className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-transparent",
      icon: Calendar,
    },
    PARTIAL: {
      label: "Kurang Bayar",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-transparent",
      icon: Calendar,
    },
    PAID: {
      label: "Lunas",
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-transparent",
      icon: CheckCircle2,
    },
    OVERDUE: {
      label: "Jatuh Tempo",
      className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-transparent",
      icon: Calendar,
    },
    OVERPAID: {
      label: "Lebih Bayar",
      className: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-transparent",
      icon: TrendingUp,
    },
  };
  const conf = (status && map[status]) || map.OPEN;
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", conf.className)}>
      <Icon className="h-3 w-3" />
      {conf.label}
      {status === "OVERDUE" && !!daysOverdue && daysOverdue > 0 && (
        <span className="text-[10px] font-normal opacity-80">· {daysOverdue} hr</span>
      )}
      {status === "PARTIAL" && (
        <span className="text-[10px] font-normal opacity-80">· kurang bayar</span>
      )}
    </Badge>
  );
}

// ---------- Date helpers ----------
function todayISO(): string {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}


// ---------- Line Draft ----------
type LineDraft = {
  key: string;
  itemId?: string;   // id InventoryItem jika dari persediaan, kosong = kustom
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

function newLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: "",
    description: "",
    quantity: "1",
    unit: "pcs",
    unitPrice: "0",
  };
}

function computeTotals(
  lines: LineDraft[],
  taxRate: string,
  discount: string,
  withholdingRate: string,
  invoiceType: InvoiceType,
  taxEnabled = true
) {
  const subtotal = lines.reduce((sum, l) => {
    const q = parseFloat(l.quantity) || 0;
    const p = parseFloat(l.unitPrice) || 0;
    return sum + q * p;
  }, 0);
  const discountAmount = Math.min(Math.max(parseFloat(discount) || 0, 0), subtotal);
  const net = subtotal - discountAmount;
  // PPN nonaktif → tarif dianggap 0 (tidak ada pajak).
  const rate = taxEnabled ? (parseFloat(taxRate) || 0) : 0;
  const taxAmount = net * (rate / 100);
  const gross = net + taxAmount;
  const withRate = parseFloat(withholdingRate) || 0;
  const withholdingAmount = invoiceType === "PURCHASE" ? gross * (withRate / 100) : 0;
  const total = gross - withholdingAmount;
  return { subtotal, discountAmount, taxAmount, gross, withholdingAmount, total };
}

// ---------- Shared Line Items Editor ----------
function LineItemsEditor({
  lines,
  updateLine,
  setLine,
  removeLine,
  addLine,
  taxRate,
  setTaxRate,
  discount,
  setDiscount,
  withholdingRate,
  setWithholdingRate,
  computed,
  inventoryItems,
  invoiceType,
  showLineNumber,
  setShowLineNumber,
  taxEnabled,
  applyTax,
  setApplyTax,
  noDescription,
}: {
  lines: LineDraft[];
  updateLine: (key: string, field: keyof LineDraft, value: string) => void;
  setLine: (key: string, patch: Partial<LineDraft>) => void;
  removeLine: (key: string) => void;
  addLine: () => void;
  taxRate: string;
  setTaxRate: (v: string) => void;
  discount: string;
  setDiscount: (v: string) => void;
  withholdingRate: string;
  setWithholdingRate: (v: string) => void;
  computed: { subtotal: number; discountAmount: number; taxAmount: number; gross: number; withholdingAmount: number; total: number };
  inventoryItems: InventoryItem[];
  invoiceType: InvoiceType;
  showLineNumber: boolean;
  setShowLineNumber: (v: boolean) => void;
  taxEnabled?: boolean;
  applyTax?: boolean;
  setApplyTax?: (v: boolean) => void;
  noDescription?: boolean;
}) {
  const activeItems = inventoryItems.filter((i) => i.isActive !== false);
  // Template kolom selaras untuk header & baris item (deskripsi disembunyikan
  // bila opsi "Tanpa Deskripsi" aktif).
  const colClass = noDescription
    ? showLineNumber
      ? "sm:grid-cols-[44px_1.2fr_76px_88px_120px_120px_40px]"
      : "sm:grid-cols-[1.2fr_76px_88px_120px_120px_40px]"
    : showLineNumber
    ? "sm:grid-cols-[44px_1.1fr_1.4fr_76px_88px_120px_120px_40px]"
    : "sm:grid-cols-[1.1fr_1.4fr_76px_88px_120px_120px_40px]";

  const handleItemSelect = (lineKey: string, itemId: string) => {
    if (!itemId) {
      // Reset ke baris kustom (deskripsi tetap manual, tidak diubah)
      setLine(lineKey, { itemId: "", unit: "pcs", unitPrice: "0" });
      return;
    }
    const item = activeItems.find((i) => i.id === itemId);
    if (!item) return;
    const defaultPrice = invoiceType === "SALES" ? item.salePrice : item.purchasePrice;
    // Deskripsi TIDAK ditimpa dari nama item — kolom deskripsi murni isian
    // manual. Item hanya menyumbang satuan & harga standar.
    setLine(lineKey, {
      itemId: item.id,
      unit: item.unit,
      unitPrice: defaultPrice > 0 ? String(defaultPrice) : "0",
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">Baris Item</Label>
          <p className="text-xs text-muted-foreground">
            Pilih barang dari persediaan atau isi deskripsi kustom.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={addLine} type="button">
          <Plus className="h-3.5 w-3.5" />
          Tambah Baris
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-1.5">
          <Checkbox id="inv-show-lineno" checked={showLineNumber} onCheckedChange={setShowLineNumber} />
          Nomor baris
        </label>
        <label className={cn("flex cursor-pointer items-center gap-1.5", taxEnabled === false && "opacity-40")}>
          <Checkbox
            id="inv-apply-tax"
            checked={!!applyTax}
            disabled={taxEnabled === false}
            onCheckedChange={(v) => setApplyTax?.(v === true)}
          />
          Pajak (PPN)
        </label>
        <span className="ml-auto hidden sm:inline">
          {taxEnabled === false
            ? "PPN nonaktif di Pengaturan → Pajak"
            : applyTax
              ? "Pajak dihitung otomatis (sub-total − diskon)"
              : "Dokumen tanpa pajak"}
        </span>
      </div>

      {/* Header kolom (desktop) — selaras dengan grid baris */}
      <div className={cn("hidden gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid", colClass)}>
        {showLineNumber && <span>No</span>}
        <span>Item</span>
        {!noDescription && <span>Deskripsi</span>}
        <span className="text-right">Qty</span>
        <span className="text-center">Satuan</span>
        <span className="text-right">Harga</span>
        <span className="text-right">Jumlah</span>
        <span />
      </div>

      <div className="space-y-2">
        {lines.map((l, idx) => {
          const q = parseFloat(l.quantity) || 0;
          const p = parseFloat(l.unitPrice) || 0;
          const selectedItem = l.itemId ? activeItems.find((i) => i.id === l.itemId) : null;
          const isLowStock = selectedItem && invoiceType === "SALES" && selectedItem.quantityOnHand <= 0;

          return (
            <div
              key={l.key}
              className="rounded-lg border bg-card p-3 space-y-2 shadow-sm"
            >
              {/* Baris: [Item pilihan] [Deskripsi manual] [Qty] [Satuan] [Harga] [Jumlah] [hapus] */}
              <div className={cn("grid gap-2 sm:items-center", colClass)}>
                {showLineNumber && (
                  <div className="hidden h-8 items-center justify-center rounded-md border bg-muted/30 px-1 text-xs font-bold tabular-nums text-muted-foreground sm:flex">
                    {idx + 1}
                  </div>
                )}
                <Select value={l.itemId || ""} onValueChange={(v) => handleItemSelect(l.key, v)}>
                  <SelectTrigger
                    className={cn(
                      "w-full h-8 text-xs",
                      l.itemId
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                        : "border-dashed text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      {l.itemId ? (
                        <Package className="h-3 w-3 shrink-0 text-emerald-600" />
                      ) : (
                        <PackageX className="h-3 w-3 shrink-0" />
                      )}
                      <SelectValue placeholder="— Pilih Item (opsional) —" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      <span className="text-muted-foreground italic text-xs">— Kustom / Non-Persediaan —</span>
                    </SelectItem>
                    {activeItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                          <span>{item.name}</span>
                          <span className={cn(
                            "ml-auto text-xs tabular-nums",
                            item.quantityOnHand <= 0
                              ? "text-rose-500"
                              : item.quantityOnHand <= (item as any).reorderLevel
                              ? "text-amber-500"
                              : "text-emerald-600"
                          )}>
                            Stok: {item.quantityOnHand} {item.unit}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!noDescription && (
                  <Input
                    placeholder="Deskripsi (isi manual)"
                    value={l.description}
                    onChange={(e) => updateLine(l.key, "description", e.target.value)}
                    className="h-8 text-sm"
                  />
                )}
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  value={l.quantity}
                  onChange={(e) => updateLine(l.key, "quantity", e.target.value)}
                  className="h-8 text-right text-sm"
                />
                <Input
                  list="unit-options"
                  placeholder="pcs"
                  value={l.unit}
                  onChange={(e) => updateLine(l.key, "unit", e.target.value)}
                  className="h-8 text-center text-sm"
                />
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={l.unitPrice}
                  onChange={(e) => updateLine(l.key, "unitPrice", e.target.value)}
                  className="h-8 text-right text-sm"
                />
                <div className="flex items-center justify-end rounded-md border border-dashed bg-muted/30 px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
                  <Money value={q * p} zeroDash={false} />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => removeLine(l.key)}
                  disabled={lines.length === 1}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Hapus baris"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Info stok jika item terpilih */}
              {selectedItem && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Package className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {selectedItem.code} · Stok:{" "}
                    <span className={cn(
                      "font-medium",
                      selectedItem.quantityOnHand <= 0
                        ? "text-rose-500"
                        : "text-emerald-600"
                    )}>
                      {selectedItem.quantityOnHand} {selectedItem.unit}
                    </span>
                    {invoiceType === "SALES" && selectedItem.salePrice > 0 && (
                      <> · Harga jual: <span className="font-medium"><Money value={selectedItem.salePrice} /></span></>
                    )}
                    {invoiceType === "PURCHASE" && selectedItem.purchasePrice > 0 && (
                      <> · Harga beli: <span className="font-medium"><Money value={selectedItem.purchasePrice} /></span></>
                    )}
                  </span>
                  {isLowStock && (
                    <span className="font-medium text-rose-500">Stok habis!</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Datalist opsi satuan umum */}
      <datalist id="unit-options">
        <option value="pcs" />
        <option value="unit" />
        <option value="box" />
        <option value="rim" />
        <option value="dus" />
        <option value="kg" />
        <option value="liter" />
        <option value="meter" />
        <option value="set" />
        <option value="paket" />
        <option value="roll" />
        <option value="lot" />
      </datalist>

      <Separator />

      {/* Tax + Diskon + PPh + totals */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="inv-tax">Tarif PPN (%)</Label>
              <Input
                id="inv-tax"
                type="number"
                min="0"
                step="any"
                value={taxRate}
                disabled={!taxEnabled || !applyTax}
                onChange={(e) => setTaxRate(e.target.value)}
                className={cn((!taxEnabled || !applyTax) && "bg-muted/40 text-muted-foreground")}
              />
              <p className="text-xs text-muted-foreground">
                {taxEnabled === false
                  ? "PPN dinonaktifkan di Pengaturan → Pajak."
                  : applyTax
                    ? "PPN standar Indonesia: 11%"
                    : "Pajak nonaktif untuk dokumen ini (centang 'Pajak (PPN)' untuk memakai)."}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-discount">Diskon (Total)</Label>
              <div className="relative">
                <Input
                  id="inv-discount"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="pr-9"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  Rp
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Potongan total sebelum PPN.
              </p>
            </div>
          </div>

          {invoiceType === "PURCHASE" && (
            <div className="grid gap-2">
              <Label htmlFor="inv-withheld">Potongan Pajak Penghasilan (%)</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    id="inv-withheld"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={withholdingRate}
                    onChange={(e) => setWithholdingRate(e.target.value)}
                    className="pr-8"
                  />
                  <Percent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWithholdingRate("2")}
                >
                  PPh 23 · 2%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWithholdingRate("1.5")}
                >
                  PPh 23 · 1,5%
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Dipotong dari total &amp; disetor sebagai PPh 23.
              </p>
            </div>
          )}
        </div>

        <Card className="bg-muted/30">
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">
                <Money value={computed.subtotal} zeroDash={false} />
              </span>
            </div>
            {computed.discountAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Diskon</span>
                <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                  −<Money value={computed.discountAmount} zeroDash={false} />
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                PPN ({parseFloat(taxRate) || 0}%)
              </span>
              <span className="font-medium tabular-nums">
                <Money value={computed.taxAmount} />
              </span>
            </div>
            {invoiceType === "PURCHASE" && computed.withholdingAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  PPh 23 ({parseFloat(withholdingRate) || 0}%)
                </span>
                <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                  −<Money value={computed.withholdingAmount} zeroDash={false} />
                </span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold">Total</span>
              <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                <Money value={computed.total} zeroDash={false} />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- Shared Form Fields ----------
function InvoiceFormFields({
  number,
  setNumber,
  type,
  setType,
  typeDisabled,
  contactId,
  setContactId,
  eligibleContacts,
  hasContacts,
  date,
  setDate,
  dueDate,
  setDueDate,
  taxRate,
  setTaxRate,
  discount,
  setDiscount,
  withholdingRate,
  setWithholdingRate,
  notes,
  setNotes,
  footnote,
  setFootnote,
  customTitle,
  setCustomTitle,
  showCustomTitle,
  setShowCustomTitle,
  showLineNumber,
  setShowLineNumber,
  status,
  setStatus,
  showStatusField,
  documentType,
  setDocumentType,
  showDocTypeField,
  lines,
  updateLine,
  setLine,
  removeLine,
  addLine,
  computed,
  inventoryItems,
  taxEnabled,
  applyTax,
  setApplyTax,
  docStyle,
  setDocStyle,
}: {
  number: string;
  setNumber: (v: string) => void;
  type: InvoiceType;
  setType: (v: InvoiceType) => void;
  typeDisabled?: boolean;
  contactId: string;
  setContactId: (v: string) => void;
  eligibleContacts: Contact[];
  hasContacts: boolean;
  date: string;
  setDate: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  taxRate: string;
  setTaxRate: (v: string) => void;
  discount: string;
  setDiscount: (v: string) => void;
  withholdingRate: string;
  setWithholdingRate: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  footnote: string;
  setFootnote: (v: string) => void;
  customTitle: string;
  setCustomTitle: (v: string) => void;
  showCustomTitle: boolean;
  setShowCustomTitle: (v: boolean) => void;
  showLineNumber: boolean;
  setShowLineNumber: (v: boolean) => void;
  status: InvoiceStatus;
  setStatus: (v: InvoiceStatus) => void;
  showStatusField?: boolean;
  documentType: DocType;
  setDocumentType: (v: DocType) => void;
  showDocTypeField?: boolean;
  lines: LineDraft[];
  updateLine: (key: string, field: keyof LineDraft, value: string) => void;
  setLine: (key: string, patch: Partial<LineDraft>) => void;
  removeLine: (key: string) => void;
  addLine: () => void;
  computed: { subtotal: number; discountAmount: number; taxAmount: number; gross: number; withholdingAmount: number; total: number };
  inventoryItems: InventoryItem[];
  taxEnabled?: boolean;
  applyTax?: boolean;
  setApplyTax?: (v: boolean) => void;
  docStyle: DocStyle;
  setDocStyle: (v: DocStyle) => void;
}) {
  // Pilihan tampilan: STANDARD / NO_DESC / CUSTOM_TITLE
  const onDocStyleChange = (v: DocStyle) => {
    setDocStyle(v);
    setShowCustomTitle(v === "CUSTOM_TITLE");
    if (v !== "CUSTOM_TITLE") setCustomTitle("");
  };
  return (
    <div className="space-y-5 py-1">
      {/* Top grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="inv-number">Nomor Dokumen</Label>
          <Input
            id="inv-number"
            placeholder="otomatis"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="uppercase"
          />
          <p className="text-xs text-muted-foreground">
            Kosongkan untuk men-generate otomatis (QTN-/ORD-/INV-).
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="inv-type">Tipe Transaksi</Label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as InvoiceType)}
            disabled={typeDisabled}
          >
            <SelectTrigger id="inv-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SALES">Penjualan (Sales)</SelectItem>
              <SelectItem value="PURCHASE">Pembelian (Purchase)</SelectItem>
            </SelectContent>
          </Select>
          {typeDisabled && (
            <p className="text-xs text-muted-foreground">
              Tipe transaksi tidak dapat diubah setelah dokumen dibuat.
            </p>
          )}
        </div>

        {showDocTypeField && (
          <div className="grid gap-2">
            <Label htmlFor="inv-doctype">Jenis Dokumen</Label>
            <Select
              value={documentType}
              onValueChange={(v) => setDocumentType(v as DocType)}
            >
              <SelectTrigger id="inv-doctype" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="QUOTE">Penawaran (Quote)</SelectItem>
                <SelectItem value="ORDER">Pesanan (Order)</SelectItem>
                <SelectItem value="INVOICE">Faktur (Invoice)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Penawaran &amp; Pesanan tidak membuat jurnal akuntansi. Hanya
              Faktur yang otomatis posting jurnal.
            </p>
          </div>
        )}

      <div className="grid gap-2">
        <Label htmlFor="inv-style">Judul Dokumen</Label>
        <Select
          value={docStyle === "CUSTOM_TITLE" ? "CUSTOM_TITLE" : "STANDARD"}
          onValueChange={(v) => {
            // 2 pilihan sederhana: Faktur / Invoice.
            // "Invoice" = preset yang otomatis mengisi judul kustom.
            if (v === "CUSTOM_TITLE") {
              setCustomTitle("Invoice");
              setShowCustomTitle(true);
            } else {
              setCustomTitle("");
              setShowCustomTitle(false);
            }
            setDocStyle(v as "STANDARD" | "CUSTOM_TITLE");
          }}
        >
          <SelectTrigger id="inv-style" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STANDARD">Faktur</SelectItem>
            <SelectItem value="CUSTOM_TITLE">Invoice</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {docStyle === "CUSTOM_TITLE"
            ? "Judul dokumen: \u201cInvoice\u201d (bahasa Inggris)."
            : "Judul dokumen: \u201cFaktur\u201d (bahasa Indonesia)."}
        </p>
      </div>

        {showStatusField && (
          <div className="grid gap-2">
            <Label htmlFor="inv-status">Status Dokumen</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as InvoiceStatus)}
            >
              <SelectTrigger id="inv-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENT">Terkirim</SelectItem>
                <SelectItem value="OVERDUE">Jatuh Tempo</SelectItem>
                <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Status &quot;Lunas&quot; hanya dapat diaktifkan via aksi
              &quot;Tandai Lunas&quot;.
            </p>
          </div>
        )}

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="inv-contact">
            Kontak <span className="text-destructive">*</span>
          </Label>
          <Select value={contactId} onValueChange={setContactId}>
            <SelectTrigger id="inv-contact" className="w-full">
              <SelectValue
                placeholder={
                  eligibleContacts.length === 0
                    ? "Tidak ada kontak tersedia"
                    : "Pilih pelanggan / pemasok"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {eligibleContacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.code}
                  </span>{" "}
                  — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {eligibleContacts.length === 0 && hasContacts && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Tidak ada kontak dengan tipe {type === "SALES" ? "Pelanggan" : "Pemasok"}.
              Tambahkan kontak terlebih dahulu di halaman Kontak.
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="inv-desc-goods">Deskripsi Barang</Label>
          <Textarea
            id="inv-desc-goods"
            placeholder="Deskripsi barang/jasa untuk dokumen ini..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {showCustomTitle && (
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="inv-custom-title">Judul Kustom</Label>
            <Input
              id="inv-custom-title"
              placeholder="mis. Invoice, Kwitansi, Laporan..."
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Judul ini menggantikan &quot;Faktur / Penawaran / Pesanan&quot; pada dokumen.
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="inv-date">
            Tanggal <span className="text-destructive">*</span>
          </Label>
          <Input
            id="inv-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="inv-due">Jatuh Tempo</Label>
          <Input
            id="inv-due"
            type="date"
            value={dueDate}
            disabled
            className="bg-muted/40 text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Otomatis mengikuti termin pembayaran kontak / pengaturan.
          </p>
        </div>
      </div>

      <Separator />

      {/* Line items + totals */}
      <LineItemsEditor
        lines={lines}
        updateLine={updateLine}
        setLine={setLine}
        removeLine={removeLine}
        addLine={addLine}
        taxRate={taxRate}
        setTaxRate={setTaxRate}
        discount={discount}
        setDiscount={setDiscount}
        withholdingRate={withholdingRate}
        setWithholdingRate={setWithholdingRate}
        computed={computed}
        inventoryItems={inventoryItems}
        invoiceType={type}
        showLineNumber={showLineNumber}
        setShowLineNumber={setShowLineNumber}
        taxEnabled={taxEnabled}
        applyTax={applyTax}
        setApplyTax={setApplyTax}
        noDescription={docStyle === "NO_DESC"}
      />

      {/* Catatan Kaki */}
      <div className="grid gap-2">
        <Label htmlFor="inv-footnote">Catatan Kaki</Label>
        <Textarea
          id="inv-footnote"
          placeholder="Catatan kaki untuk dokumen ini..."
          value={footnote}
          onChange={(e) => setFootnote(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );
}

// ---------- Create Dialog ----------
function CreateInvoiceDialog({
  open,
  onOpenChange,
  initialDocType = "INVOICE",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialDocType?: DocType;
  onCreated?: (docType: DocType) => void;
}) {
  const qc = useQueryClient();
  const company = useSettingsStore((s) => s.company);
  const taxEnabled = company?.ppnEnabled !== false;

  // Muat pengaturan perusahaan (untuk status PPN aktif/nonaktif)
  React.useEffect(() => {
    if (open) void useSettingsStore.getState().fetchCompany();
  }, [open]);

  // Fetch contacts for the select dropdown
  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: ["contacts", "ALL"],
    queryFn: async () => {
      const res = await authFetch("/api/contacts?type=ALL");
      if (!res.ok) throw new Error("Gagal memuat kontak");
      return res.json();
    },
    enabled: open,
  });
  const contacts = contactsData?.contacts ?? [];

  // Fetch inventory items for the item selector
  const { data: inventoryData } = useQuery<{ items: InventoryItem[] }>({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const res = await authFetch("/api/inventory/items");
      if (!res.ok) throw new Error("Gagal memuat item persediaan");
      return res.json();
    },
    enabled: open,
  });
  const inventoryItems = inventoryData?.items ?? [];

  // Fetch existing invoices to suggest next number
  const { data: existingInvoices } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["invoices", "ALL", "ALL", "ALL"],
    queryFn: async () => {
      const res = await authFetch("/api/invoices?type=ALL&status=ALL");
      if (!res.ok) throw new Error("Gagal memuat dokumen");
      return res.json();
    },
    enabled: open,
  });

  const [number, setNumber] = React.useState("");
  const [type, setType] = React.useState<InvoiceType>("SALES");
  const [documentType, setDocumentType] = React.useState<DocType>(initialDocType);
  const [contactId, setContactId] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [dueDate, setDueDate] = React.useState(addDaysISO(30));
  const [taxRate, setTaxRate] = React.useState("0");
  const [discount, setDiscount] = React.useState("");
  const [withholdingRate, setWithholdingRate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [footnote, setFootnote] = React.useState("");
  const [customTitle, setCustomTitle] = React.useState("");
  const [showCustomTitle, setShowCustomTitle] = React.useState(false);
  const [showLineNumber, setShowLineNumber] = React.useState(false);
  // Pajak opsional per dokumen: dicentang = pakai PPN, dikosongkan = tanpa pajak
  const [applyTax, setApplyTax] = React.useState(true);
  // Tampilan dokumen: standar / tanpa deskripsi / judul kustom
  const [docStyle, setDocStyle] = React.useState<DocStyle>("STANDARD");
  const [lines, setLines] = React.useState<LineDraft[]>([newLine()]);

  // Sync documentType when initialDocType changes / dialog opens
  React.useEffect(() => {
    if (open) {
      setDocumentType(initialDocType);
    }
     
  }, [open, initialDocType]);

  // No client-side number suggestion — backend auto-generates via nextCode

  // Jatuh tempo mengikuti termin pembayaran kontak (diisi saat tambah/sunting kontak).
  // Dipanggil dari event pemilihan kontak, bukan effect.
  const handleSetContact = (v: string) => {
    setContactId(v);
    if (!v) return;
    const c = contacts.find((x) => x.id === v);
    const terms = c?.paymentTermsDays && c.paymentTermsDays > 0 ? c.paymentTermsDays : 30;
    const d = new Date(date);
    d.setDate(d.getDate() + terms);
    const tzOffset = d.getTimezoneOffset() * 60000;
    setDueDate(new Date(d.getTime() - tzOffset).toISOString().slice(0, 10));
  };

  // Jatuh tempo non-editable: otomatis mengikuti termin saat tanggal berubah
  const handleDateChange = (v: string) => {
    setDate(v);
    if (!v) return;
    const c = contacts.find((x) => x.id === contactId);
    const terms = c?.paymentTermsDays && c.paymentTermsDays > 0 ? c.paymentTermsDays : 30;
    const d = new Date(v);
    d.setDate(d.getDate() + terms);
    const tzOffset = d.getTimezoneOffset() * 60000;
    setDueDate(new Date(d.getTime() - tzOffset).toISOString().slice(0, 10));
  };

  // Reset form on close
  React.useEffect(() => {
    if (!open) {
      setNumber("");
      setType("SALES");
      setDocumentType(initialDocType);
      setContactId("");
      setDate(todayISO());
      setDueDate(addDaysISO(30));
      setTaxRate("0");
      setDiscount("");
      setWithholdingRate("");
      setNotes("");
      setFootnote("");
      setCustomTitle("");
      setShowCustomTitle(false);
      setShowLineNumber(false);
      setApplyTax(true);
      setLines([newLine()]);
    }
     
  }, [open]);

  // Pajak efektif = pengaturan global PPN aktif DAN centang "Pajak (PPN)" di dokumen ini
  const effectiveTaxEnabled = taxEnabled && applyTax;

  // Computed totals (live)
  const computed = React.useMemo(
    () => computeTotals(lines, taxRate, discount, withholdingRate, type, effectiveTaxEnabled),
    [lines, taxRate, discount, withholdingRate, type, effectiveTaxEnabled]
  );

  const updateLine = (key: string, field: keyof LineDraft, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
    );
  };

  const setLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) =>
      prev.length > 1 ? prev.filter((l) => l.key !== key) : prev
    );
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);

  const mutation = useMutation({
    mutationFn: async () => {
      // Deskripsi manual; baris yang memakai item boleh dibiarkan kosong → diisi
      // nama item sebagai fallback agar baris tetap valid.
      const cleanLines = lines
        .map((l) => {
          const itemName = inventoryItems.find((i) => i.id === l.itemId)?.name ?? "";
          return {
            description: (l.description.trim() || itemName.trim()) as string,
            quantity: parseFloat(l.quantity) || 0,
            unit: l.unit.trim() || "pcs",
            unitPrice: parseFloat(l.unitPrice) || 0,
            itemId: l.itemId || undefined,
          };
        })
        .filter((l) => l.description !== "");
      if (cleanLines.length === 0) {
        throw new Error("Minimal harus ada satu baris item dengan deskripsi");
      }
      const res = await authFetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: number.trim() || undefined,
          documentType,
          type,
          contactId,
          date,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          taxRate: effectiveTaxEnabled ? parseFloat(taxRate) || 0 : 0,
          discount: parseFloat(discount) || 0,
          withholdingRate: type === "PURCHASE" ? parseFloat(withholdingRate) || 0 : 0,
          footnote: footnote.trim() || undefined,
          customTitle: customTitle.trim() || undefined,
          showLineNumber,
          lines: cleanLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal membuat dokumen");
      return data;
    },
    onSuccess: () => {
      const docLabel = DOC_TYPE_LABEL[documentType];
      const isInvoice = documentType === "INVOICE";
      toast.success(`${docLabel} berhasil dibuat`, {
        description: isInvoice
          ? `${number || "Nomor otomatis"} — jurnal akuntansi otomatis dibuat.`
          : `${number || "Nomor otomatis"} — belum memengaruhi akuntansi.`,
      });
      // Switch to the new docType tab so the user sees the freshly created doc
      if (onCreated) onCreated(documentType);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal membuat dokumen", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!contactId) return toast.error("Pilih kontak terlebih dahulu");
    if (!date) return toast.error("Tanggal dokumen wajib diisi");
    const hasValidLine = lines.some(
      (l) => l.description.trim() !== "" && (parseFloat(l.quantity) || 0) > 0
    );
    if (!hasValidLine)
      return toast.error("Minimal satu baris item dengan deskripsi & kuantitas > 0");
    mutation.mutate();
  };

  // Filter contacts based on type
  const eligibleContacts = contacts.filter((c) => {
    if (c.type === "BOTH") return true;
    if (type === "SALES") return c.type === "CUSTOMER";
    return c.type === "SUPPLIER";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat {DOC_TYPE_LABEL[documentType]} Baru</DialogTitle>
          <DialogDescription>
            {documentType === "INVOICE"
              ? "Faktur penjualan/pembelian. Jurnal akuntansi dibuat otomatis sesuai kaidah berpasangan."
              : documentType === "QUOTE"
              ? "Penawaran harga untuk pelanggan/pemasok. Belum memengaruhi akuntansi."
              : "Pesanan dari penawaran. Belum memengaruhi akuntansi hingga dikonversi menjadi Faktur."}
          </DialogDescription>
        </DialogHeader>

        <InvoiceFormFields
          number={number}
          setNumber={setNumber}
          type={type}
          setType={setType}
          contactId={contactId}
          setContactId={handleSetContact}
          eligibleContacts={eligibleContacts}
          hasContacts={contacts.length > 0}
          date={date}
          setDate={handleDateChange}
          dueDate={dueDate}
          setDueDate={setDueDate}
          taxRate={taxRate}
          setTaxRate={setTaxRate}
          discount={discount}
          setDiscount={setDiscount}
          withholdingRate={withholdingRate}
          setWithholdingRate={setWithholdingRate}
          notes={notes}
          setNotes={setNotes}
          footnote={footnote}
          setFootnote={setFootnote}
          customTitle={customTitle}
          setCustomTitle={setCustomTitle}
          showCustomTitle={showCustomTitle}
          setShowCustomTitle={setShowCustomTitle}
          showLineNumber={showLineNumber}
          setShowLineNumber={setShowLineNumber}
          status="DRAFT"
          setStatus={() => {}}
          documentType={documentType}
          setDocumentType={setDocumentType}
          showDocTypeField
          lines={lines}
          updateLine={updateLine}
          setLine={setLine}
          removeLine={removeLine}
          addLine={addLine}
          computed={computed}
          inventoryItems={inventoryItems}
          taxEnabled={taxEnabled}
          applyTax={applyTax}
          setApplyTax={setApplyTax}
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Menyimpan..." : `Buat ${DOC_TYPE_LABEL[documentType]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit Dialog ----------
function EditInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const company = useSettingsStore((s) => s.company);
  const taxEnabled = company?.ppnEnabled !== false;

  React.useEffect(() => {
    if (open) void useSettingsStore.getState().fetchCompany();
  }, [open]);

  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: ["contacts", "ALL"],
    queryFn: async () => {
      const res = await authFetch("/api/contacts?type=ALL");
      if (!res.ok) throw new Error("Gagal memuat kontak");
      return res.json();
    },
    enabled: open,
  });
  const contacts = contactsData?.contacts ?? [];

  // Fetch inventory items for the item selector
  const { data: inventoryDataEdit } = useQuery<{ items: InventoryItem[] }>({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const res = await authFetch("/api/inventory/items");
      if (!res.ok) throw new Error("Gagal memuat item persediaan");
      return res.json();
    },
    enabled: open,
  });
  const inventoryItems = inventoryDataEdit?.items ?? [];

  const [number, setNumber] = React.useState("");
  const [type, setType] = React.useState<InvoiceType>("SALES");
  const [contactId, setContactId] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [dueDate, setDueDate] = React.useState(addDaysISO(30));
  const [taxRate, setTaxRate] = React.useState("0");
  const [discount, setDiscount] = React.useState("");
  const [withholdingRate, setWithholdingRate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [footnote, setFootnote] = React.useState("");
  const [customTitle, setCustomTitle] = React.useState("");
  const [showCustomTitle, setShowCustomTitle] = React.useState(false);
  const [showLineNumber, setShowLineNumber] = React.useState(false);
  // Pajak opsional per dokumen: diisi dari tarif faktur tersimpan (0 = tanpa pajak)
  const [applyTax, setApplyTax] = React.useState(true);
  const [status, setStatus] = React.useState<InvoiceStatus>("DRAFT");
  const [lines, setLines] = React.useState<LineDraft[]>([newLine()]);

  // Sync form with the invoice prop when dialog opens
  React.useEffect(() => {
    if (open && invoice) {
      setNumber(invoice.number);
      setType(invoice.type);
      setContactId(invoice.contactId);
      setDate(invoice.date ? invoice.date.slice(0, 10) : todayISO());
      setDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : "");
      setTaxRate(String(invoice.taxRate ?? 0));
      setDiscount(String(invoice.discount ?? 0));
      setWithholdingRate(String(invoice.withholdingRate ?? 0));
      setNotes(invoice.notes ?? "");
      setFootnote(invoice.footnote ?? "");
      setCustomTitle(invoice.customTitle ?? "");
      setShowCustomTitle(!!invoice.customTitle);
      setShowLineNumber(invoice.showLineNumber ?? false);
      setApplyTax((invoice.taxRate ?? 0) > 0);
      setStatus(invoice.status);
      setLines(
        invoice.lines.length > 0
          ? invoice.lines.map((l) => ({
              key: Math.random().toString(36).slice(2),
              itemId: l.itemId || "",
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit || "pcs",
              unitPrice: String(l.unitPrice),
            }))
          : [newLine()]
      );
    }
     
  }, [open, invoice]);

  // Jatuh tempo non-editable: otomatis mengikuti termin saat tanggal berubah
  const handleDateChange = (v: string) => {
    setDate(v);
    if (!v) return;
    const c = contacts.find((x) => x.id === contactId);
    const terms = c?.paymentTermsDays && c.paymentTermsDays > 0 ? c.paymentTermsDays : 30;
    const d = new Date(v);
    d.setDate(d.getDate() + terms);
    const tzOffset = d.getTimezoneOffset() * 60000;
    setDueDate(new Date(d.getTime() - tzOffset).toISOString().slice(0, 10));
  };

  // Pajak efektif = pengaturan global PPN aktif DAN centang "Pajak (PPN)"
  const effectiveTaxEnabled = taxEnabled && applyTax;

  const computed = React.useMemo(
    () => computeTotals(lines, taxRate, discount, withholdingRate, type, effectiveTaxEnabled),
    [lines, taxRate, discount, withholdingRate, type, effectiveTaxEnabled]
  );

  const updateLine = (key: string, field: keyof LineDraft, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
    );
  };

  const setLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) =>
      prev.length > 1 ? prev.filter((l) => l.key !== key) : prev
    );
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error("Tidak ada dokumen untuk disimpan");
      const cleanLines = lines
        .map((l) => {
          const itemName = inventoryItems.find((i) => i.id === l.itemId)?.name ?? "";
          return {
            description: (l.description.trim() || itemName.trim()) as string,
            quantity: parseFloat(l.quantity) || 0,
            unit: l.unit.trim() || "pcs",
            unitPrice: parseFloat(l.unitPrice) || 0,
            itemId: l.itemId || undefined,
          };
        })
        .filter((l) => l.description !== "");
      if (cleanLines.length === 0) {
        throw new Error("Minimal harus ada satu baris item dengan deskripsi");
      }
      const res = await authFetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: number.trim() || undefined,
          contactId,
          date,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          taxRate: effectiveTaxEnabled ? parseFloat(taxRate) || 0 : 0,
          discount: parseFloat(discount) || 0,
          withholdingRate: type === "PURCHASE" ? parseFloat(withholdingRate) || 0 : 0,
          footnote: footnote.trim() || undefined,
          customTitle: customTitle.trim() || undefined,
          showLineNumber,
          status,
          lines: cleanLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memperbarui dokumen");
      return data;
    },
    onSuccess: () => {
      toast.success("Dokumen diperbarui", {
        description: `${number} — rincian item & total dihitung ulang otomatis.`,
      });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal memperbarui", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!contactId) return toast.error("Pilih kontak terlebih dahulu");
    if (!date) return toast.error("Tanggal wajib diisi");
    const hasValidLine = lines.some(
      (l) => l.description.trim() !== "" && (parseFloat(l.quantity) || 0) > 0
    );
    if (!hasValidLine)
      return toast.error("Minimal satu baris item dengan deskripsi & kuantitas > 0");
    mutation.mutate();
  };

  if (!invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const eligibleContacts = contacts.filter((c) => {
    if (c.type === "BOTH") return true;
    if (type === "SALES") return c.type === "CUSTOMER";
    return c.type === "SUPPLIER";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit {DOC_TYPE_LABEL[invoice.documentType] ?? "Dokumen"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{invoice.number}</span> — perbarui
            rincian dokumen. Total, PPN, dan sisa pembayaran dihitung ulang
            otomatis.
          </DialogDescription>
        </DialogHeader>

        <InvoiceFormFields
          number={number}
          setNumber={setNumber}
          type={type}
          setType={setType}
          typeDisabled
          contactId={contactId}
          setContactId={setContactId}
          eligibleContacts={eligibleContacts}
          hasContacts={contacts.length > 0}
          date={date}
          setDate={handleDateChange}
          dueDate={dueDate}
          setDueDate={setDueDate}
          taxRate={taxRate}
          setTaxRate={setTaxRate}
          discount={discount}
          setDiscount={setDiscount}
          withholdingRate={withholdingRate}
          setWithholdingRate={setWithholdingRate}
          notes={notes}
          setNotes={setNotes}
          footnote={footnote}
          setFootnote={setFootnote}
          customTitle={customTitle}
          setCustomTitle={setCustomTitle}
          showCustomTitle={showCustomTitle}
          setShowCustomTitle={setShowCustomTitle}
          showLineNumber={showLineNumber}
          setShowLineNumber={setShowLineNumber}
          status={status}
          setStatus={setStatus}
          showStatusField
          documentType={invoice.documentType}
          setDocumentType={() => {}}
          lines={lines}
          updateLine={updateLine}
          setLine={setLine}
          removeLine={removeLine}
          addLine={addLine}
          computed={computed}
          inventoryItems={inventoryItems}
          taxEnabled={taxEnabled}
          applyTax={applyTax}
          setApplyTax={setApplyTax}
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail Dialog ----------
function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
  onPrint,
  onEdit,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPrint: (inv: Invoice) => void;
  onEdit: (inv: Invoice) => void;
}) {
  if (!invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const remaining = invoice.total - invoice.paidAmount;
  const isInvoice = invoice.documentType === "INVOICE";
  const gross = invoice.subtotal - (invoice.discount || 0) + invoice.taxAmount;
  const withheld = gross * ((invoice.withholdingRate || 0) / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="space-y-1.5">
              <DialogTitle className="font-mono">{invoice.number}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <DocTypeBadge docType={invoice.documentType} />
                <InvoiceTypeBadge type={invoice.type} />
                <InvoiceStatusBadge status={invoice.status} />
              </DialogDescription>
              {invoice.parentInvoiceId && (
                <p className="text-xs text-muted-foreground">
                  Disalin dari dokumen sebelumnya (ID: {invoice.parentInvoiceId.slice(0, 8)}…)
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Meta grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Kontak
              </p>
              <p className="font-medium">{invoice.contact.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tanggal
                </p>
                <p className="text-sm font-medium">{formatDate(invoice.date)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Jatuh Tempo
                </p>
                <p className="text-sm font-medium">
                  {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="mb-2 text-sm font-semibold">Rincian Item</p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="pl-4">Deskripsi</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-center">Satuan</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="pr-4 text-right">Jumlah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="pl-4 font-medium">
                        {l.description}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.quantity}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {l.unit || "pcs"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Money value={l.unitPrice} zeroDash={false} />
                      </TableCell>
                      <TableCell className="pr-4 text-right font-medium tabular-nums">
                        <Money value={l.amount} zeroDash={false} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Totals */}
          <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">
                <Money value={invoice.subtotal} zeroDash={false} />
              </span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Diskon</span>
                <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                  −<Money value={invoice.discount} zeroDash={false} />
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                PPN ({invoice.taxRate}%)
              </span>
              <span className="font-medium tabular-nums">
                <Money value={invoice.taxAmount} />
              </span>
            </div>
            {invoice.type === "PURCHASE" && invoice.withholdingRate > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  PPh 23 ({invoice.withholdingRate}%)
                </span>
                <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                  −<Money value={withheld} zeroDash={false} />
                </span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold">Total</span>
              <span className="text-base font-bold tabular-nums">
                <Money value={invoice.total} zeroDash={false} />
              </span>
            </div>
            {isInvoice && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sudah Dibayar</span>
                  <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    <Money value={invoice.paidAmount} />
                  </span>
                </div>
                {remaining > 0 && invoice.status !== "PAID" && (
                  <div className="flex items-center justify-between rounded-md bg-rose-500/5 px-2 py-1.5">
                    <span className="text-muted-foreground">Sisa</span>
                    <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                      <Money value={remaining} zeroDash={false} />
                    </span>
                  </div>
                )}
              </>
            )}
            {!isInvoice && (
              <p className="pt-1 text-xs text-muted-foreground">
                Dokumen ini belum memengaruhi akuntansi. Konversi ke Faktur
                untuk posting jurnal otomatis.
              </p>
            )}
          </div>

          {invoice.notes && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Catatan
                </p>
                <p className="text-sm">{invoice.notes}</p>
              </div>
            </>
          )}
          {invoice.customTitle && (
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Judul Kustom
              </p>
              <p className="text-sm font-medium">{invoice.customTitle}</p>
            </div>
          )}
          {invoice.footnote && (
            <div className="text-xs text-muted-foreground">
              {invoice.footnote}
            </div>
          )}
        </div>

        <DialogFooter>
          {invoice.status !== "PAID" || invoice.paymentStatus === "OVERPAID" ? (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEdit(invoice);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onPrint(invoice);
            }}
          >
            <Printer className="mr-2 h-4 w-4" /> Cetak / PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Stats Header ----------
function InvoiceStats({
  invoices,
  docTypeFilter,
}: {
  invoices: Invoice[];
  docTypeFilter: DocTypeFilter;
}) {
  const totalSales = invoices
    .filter((i) => i.type === "SALES" && i.documentType === "INVOICE")
    .reduce((s, i) => s + i.total, 0);
  const totalPurchase = invoices
    .filter((i) => i.type === "PURCHASE" && i.documentType === "INVOICE")
    .reduce((s, i) => s + i.total, 0);
  // Sisa piutang/hutang (kurang bayar + belum dibayar) — saldo jatuh tempo
  const outstanding = invoices
    .filter((i) => i.documentType === "INVOICE" && (i.balanceDue ?? i.total - i.paidAmount) > 0.005)
    .reduce((s, i) => s + (i.balanceDue ?? i.total - i.paidAmount), 0);
  const totalTax = invoices.reduce((s, i) => s + i.taxAmount, 0);

  // Context-aware labels
  const docLabel =
    docTypeFilter === "ALL"
      ? "Total Dokumen"
      : docTypeFilter === "QUOTE"
      ? "Total Penawaran"
      : docTypeFilter === "ORDER"
      ? "Total Pesanan"
      : "Total Faktur";

  const salesLabel =
    docTypeFilter === "QUOTE"
      ? "Nilai Penawaran (Sales)"
      : docTypeFilter === "ORDER"
      ? "Nilai Pesanan (Sales)"
      : "Nilai Penjualan";

  const purchaseLabel =
    docTypeFilter === "QUOTE"
      ? "Nilai Penawaran (Purchase)"
      : docTypeFilter === "ORDER"
      ? "Nilai Pesanan (Purchase)"
      : "Nilai Pembelian";

  // For non-INVOICE tabs, "Outstanding" doesn't apply; show total PPN instead.
  const fourthCard =
    docTypeFilter === "ALL" || docTypeFilter === "INVOICE"
      ? {
          label: "Outstanding",
          value: <Money value={outstanding} />,
          icon: Receipt,
          accent:
            outstanding > 0
              ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
              : "text-muted-foreground bg-muted",
        }
      : {
          label: "Total PPN",
          value: <Money value={totalTax} />,
          icon: Receipt,
          accent: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
        };

  const stats = [
    {
      label: docLabel,
      value: invoices.length.toString(),
      icon: FileText,
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      label: salesLabel,
      value: <Money value={totalSales} />,
      icon: TrendingUp,
      accent: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
    },
    {
      label: purchaseLabel,
      value: <Money value={totalPurchase} />,
      icon: ShoppingCart,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
    fourthCard,
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
                <p className="text-lg font-bold tabular-nums truncate">
                  {s.value}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Main View ----------
// ---------- Mark Paid Dialog (Manager.io: pelunasan lewat Receipts/Payments) ----------
function MarkPaidDialog({ invoice, open, onOpenChange }: { invoice: Invoice | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [bankAccountId, setBankAccountId] = React.useState("");
  const isSales = invoice?.type === "SALES";

  const { data: banksData } = useQuery<{ bankAccounts: { id: string; code: string; name: string }[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/invoices/${invoice!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID", paidAmount: invoice!.total, bankAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menandai lunas");
      return data;
    },
    onSuccess: () => {
      toast.success("Faktur ditandai lunas", {
        description: `${invoice?.number} — ${isSales ? "Penerimaan" : "Pembayaran"} dicatat otomatis.`,
      });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Tandai Lunas {invoice?.number ?? ""}
          </DialogTitle>
          <DialogDescription>
            {invoice?.type === "SALES"
              ? "Terima pelunasan dari pelanggan — uang masuk tercatat di view Penerimaan."
              : "Bayar faktur ke pemasok — uang keluar tercatat di view Pembayaran."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="mp-bank">
              {isSales ? "Terima ke Akun" : "Bayar dari Akun Kas/Bank"} <span className="text-destructive">*</span>
            </Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger id="mp-bank"><SelectValue placeholder="Pilih akun kas/bank..." /></SelectTrigger>
              <SelectContent>
                {(banksData?.bankAccounts ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !bankAccountId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Tandai Lunas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesView() {
  const qc = useQueryClient();
  const [docTypeFilter, setDocTypeFilter] = React.useState<DocTypeFilter>("ALL");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("ALL");
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createInitialDocType, setCreateInitialDocType] = React.useState<DocType>("INVOICE");
  const [detailInvoice, setDetailInvoice] = React.useState<Invoice | null>(null);
  const [editTarget, setEditTarget] = React.useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Invoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = React.useState<Invoice | null>(null);
  const [paidTarget, setPaidTarget] = React.useState<Invoice | null>(null);

  const { data, isLoading } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["invoices", docTypeFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        type: typeFilter,
      });
      if (docTypeFilter !== "ALL") params.set("documentType", docTypeFilter);
      const res = await authFetch(`/api/invoices?${params.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat dokumen");
      return res.json();
    },
  });

  const invoices = data?.invoices ?? [];

  // Client-side search by number or contact name
  const filtered = React.useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.trim().toLowerCase();
    return invoices.filter(
      (i) =>
        i.number.toLowerCase().includes(q) ||
        i.contact.name.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  // Copy to mutation (Quote→Order, Quote→Invoice, Order→Invoice)
  const copyTo = useMutation({
    mutationFn: async ({
      invoice,
      targetDocType,
    }: {
      invoice: Invoice;
      targetDocType: DocType;
    }) => {
      const res = await authFetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: targetDocType,
          parentInvoiceId: invoice.id,
          type: invoice.type,
          contactId: invoice.contactId,
          date: todayISO(),
          lines: invoice.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit: l.unit || "pcs",
            unitPrice: l.unitPrice,
          })),
          notes: invoice.notes || undefined,
          taxRate: invoice.taxRate,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Gagal menyalin dokumen");
      return { data, targetDocType };
    },
    onSuccess: (_res, { targetDocType }) => {
      toast.success(`Dokumen disalin ke ${DOC_TYPE_LABEL[targetDocType]}`, {
        description: "Nomor baru dibuat otomatis. Tampilan dialihkan ke tab tersebut.",
      });
      // Switch to the target tab so the user sees the new document
      setDocTypeFilter(targetDocType);
      setTypeFilter("ALL");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => {
      toast.error("Gagal menyalin dokumen", { description: err.message });
    },
  });

  // Delete mutation
  const deleteInvoice = useMutation({
    mutationFn: async (invoice: Invoice) => {
      const res = await authFetch(`/api/invoices/${invoice.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menghapus dokumen");
      return data;
    },
    onSuccess: (_data, invoice) => {
      toast.success("Dokumen dihapus", {
        description: `${invoice.number} telah dihapus.`,
      });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast.error("Gagal menghapus dokumen", { description: err.message });
      setDeleteTarget(null);
    },
  });

  const openCreateFor = (docType: DocType) => {
    setCreateInitialDocType(docType);
    setCreateOpen(true);
  };

  // Header label/description depends on active docType tab
  const headerTitle =
    docTypeFilter === "ALL"
      ? "Daftar Dokumen"
      : `Daftar ${DOC_TYPE_LABEL[docTypeFilter]}`;
  const headerDesc =
    docTypeFilter === "INVOICE" || docTypeFilter === "ALL"
      ? "Kelola Penawaran, Pesanan, dan Faktur. Hanya Faktur yang otomatis posting jurnal akuntansi."
      : docTypeFilter === "QUOTE"
      ? "Penawaran harga untuk pelanggan/pemasok. Belum memengaruhi akuntansi hingga dikonversi ke Pesanan atau Faktur."
      : "Pesanan dari penawaran. Belum memengaruhi akuntansi hingga dikonversi menjadi Faktur.";
  const createButtonLabel =
    docTypeFilter === "ALL" || docTypeFilter === "INVOICE"
      ? "Buat Faktur"
      : docTypeFilter === "QUOTE"
      ? "Buat Penawaran"
      : "Buat Pesanan";

  return (
    <div className="space-y-6">
      {/* Document Type Tabs */}
      <Tabs
        value={docTypeFilter}
        onValueChange={(v) => setDocTypeFilter(v as DocTypeFilter)}
        className="w-full"
      >
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto">
          {DOC_TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = docTypeFilter === tab.key;
            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="gap-1.5 px-3 py-1.5"
                aria-label={`Filter ${tab.label}`}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5",
                    isActive
                      ? tab.key === "QUOTE"
                        ? "text-amber-600 dark:text-amber-400"
                        : tab.key === "ORDER"
                        ? "text-sky-600 dark:text-sky-400"
                        : tab.key === "INVOICE"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground"
                      : "text-muted-foreground"
                  )}
                />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{headerTitle}</h2>
          <p className="text-sm text-muted-foreground">{headerDesc}</p>
        </div>
        <Button
          onClick={() => openCreateFor(docTypeFilter === "ALL" ? "INVOICE" : docTypeFilter)}
          className="sm:w-auto w-full"
        >
          <Plus className="h-4 w-4" />
          {createButtonLabel}
        </Button>
      </div>

      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialDocType={createInitialDocType}
        onCreated={(d) => setDocTypeFilter(d)}
      />

      {/* Stats */}
      {!isLoading && invoices.length > 0 && (
        <InvoiceStats invoices={invoices} docTypeFilter={docTypeFilter} />
      )}

      {/* Main card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                {docTypeFilter === "ALL"
                  ? "Dokumen Terdaftar"
                  : `${DOC_TYPE_LABEL[docTypeFilter]} Terdaftar`}
              </CardTitle>
              <CardDescription>
                {filtered.length} dari {invoices.length} dokumen
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari nomor / kontak..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1">
              <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <span className="mr-1 text-xs text-muted-foreground">Tipe:</span>
              {TYPE_FILTERS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={typeFilter === f.key ? "default" : "outline"}
                  onClick={() => setTypeFilter(f.key)}
                  className="h-7 px-3 text-xs"
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState rows={6} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={
                invoices.length === 0
                  ? docTypeFilter === "ALL"
                    ? "Belum ada dokumen"
                    : `Belum ada ${DOC_TYPE_LABEL[docTypeFilter].toLowerCase()}`
                  : "Tidak ada hasil"
              }
              description={
                invoices.length === 0
                  ? docTypeFilter === "QUOTE"
                    ? "Buat penawaran harga pertama Anda. Penawaran belum memengaruhi akuntansi."
                    : docTypeFilter === "ORDER"
                    ? "Buat pesanan pertama Anda. Pesanan belum memengaruhi akuntansi."
                    : "Buat faktur penjualan atau pembelian pertama Anda. Jurnal akuntansi akan dibuat otomatis."
                  : "Coba ubah kata kunci pencarian atau filter tipe/status."
              }
              action={
                invoices.length === 0 ? (
                  <Button
                    onClick={() =>
                      openCreateFor(
                        docTypeFilter === "ALL" ? "INVOICE" : docTypeFilter
                      )
                    }
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    {createButtonLabel}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Nomor</TableHead>
                    <TableHead className="hidden md:table-cell">Tanggal</TableHead>
                    <TableHead className="hidden lg:table-cell">Jatuh Tempo</TableHead>
                    <TableHead>Kontak</TableHead>
                    <TableHead className="hidden xl:table-cell">Deskripsi</TableHead>
                    <TableHead className="hidden sm:table-cell">Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Sisa</TableHead>
                    <TableHead className="pr-6 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const canEdit = inv.paymentStatus === "OVERPAID" || inv.status !== "PAID";
                    const canMarkPaid =
                      inv.documentType === "INVOICE" &&
                      inv.status !== "PAID" &&
                      inv.status !== "CANCELLED";
                    const canCopy = inv.documentType !== "INVOICE";
                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setPreviewInvoice(inv)}>
                        <TableCell className="pl-6">
                          <div className="font-mono text-xs font-semibold">
                            {inv.number}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {formatDate(inv.date)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          {inv.dueDate ? (
                            <span className={cn(inv.paymentStatus === "OVERDUE" ? "font-medium text-rose-600" : "text-muted-foreground")}>
                              {formatDate(inv.dueDate)}
                              {inv.paymentStatus === "OVERDUE" && !!inv.daysOverdue && (
                                <span className="ml-1 text-[10px]">· {inv.daysOverdue} hr</span>
                              )}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate font-medium text-sm">
                          {inv.contact.name}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                          {inv.notes || inv.lines[0]?.description || "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <InvoiceTypeBadge type={inv.type} />
                        </TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={inv.paymentStatus} daysOverdue={inv.daysOverdue} />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          <Money value={inv.total} zeroDash={false} />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                          <Money value={(inv.balanceDue ?? (inv.total - inv.paidAmount))} zeroDash={false} />
                        </TableCell>
<TableCell className="pr-6 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-[11px] font-semibold"
                              title="Tampilkan sheet / pratinjau dokumen"
                              onClick={(e) => { e.stopPropagation(); setPreviewInvoice(inv); }}
                            >
                              <Eye className="h-3 w-3" /> Tampil
                            </Button>
                            {canEdit ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                title="Sunting dokumen ini"
                                onClick={(e) => { e.stopPropagation(); setEditTarget(inv); }}
                              >
                                <Pencil className="h-3 w-3" /> Sunting
                              </Button>
                            ) : null}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Aksi lainnya" onClick={(e) => e.stopPropagation()}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">
                                  {inv.number}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDetailInvoice(inv)}>
                                  <Eye className="h-4 w-4" /> Lihat Detail
                                </DropdownMenuItem>
                                {!canEdit && (
                                  <DropdownMenuItem disabled title="Faktur sudah lunas, tidak dapat diedit">
                                    <Pencil className="h-4 w-4" /> Edit (Lunas)
                                  </DropdownMenuItem>
                                )}
                                {canCopy && (
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <Copy className="h-4 w-4" /> Salin ke
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-44">
                                      {inv.documentType === "QUOTE" && (
                                        <DropdownMenuItem onClick={() => copyTo.mutate({ invoice: inv, targetDocType: "ORDER" })} disabled={copyTo.isPending}>
                                          <ClipboardList className="h-4 w-4" /> Pesanan
                                        </DropdownMenuItem>
                                      )}
                                      {inv.documentType !== "INVOICE" && (
                                        <DropdownMenuItem onClick={() => copyTo.mutate({ invoice: inv, targetDocType: "INVOICE" })} disabled={copyTo.isPending}>
                                          <Receipt className="h-4 w-4" /> Faktur
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                )}
                                <DropdownMenuItem onClick={() => setPreviewInvoice(inv)}>
                                  <Printer className="h-4 w-4" /> Cetak / PDF
                                </DropdownMenuItem>
                                {canMarkPaid && (
                                  <DropdownMenuItem onClick={() => setPaidTarget(inv)}>
                                    <CheckCircle2 className="h-4 w-4" /> Tandai Lunas
                                  </DropdownMenuItem>
                                )}
                                {inv.status === "PAID" && (
                                  <DropdownMenuItem disabled>
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Sudah Lunas
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-rose-600 focus:text-rose-600"
                                  onClick={() => setDeleteTarget(inv)}
                                >
                                  <Trash2 className="h-4 w-4" /> Hapus
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td colSpan={7} className="pl-6 py-4 text-right">Total Kolektif</td>
                    <td className="py-4 text-right tabular-nums">
                      <Money value={filtered.reduce((s, i) => s + i.total, 0)} zeroDash={false} />
                    </td>
                    <td className="py-4 pr-6 text-right tabular-nums text-rose-600 dark:text-rose-400">
                      <Money value={filtered.reduce((s, i) => s + (i.balanceDue ?? (i.total - i.paidAmount)), 0)} zeroDash={false} />
                    </td>
                    <td className="py-4"></td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <InvoiceDetailDialog
        invoice={detailInvoice}
        open={!!detailInvoice}
        onOpenChange={(v) => !v && setDetailInvoice(null)}
        onPrint={(inv) => setPreviewInvoice(inv)}
        onEdit={(inv) => setEditTarget(inv)}
      />

      {/* Edit Dialog */}
      <EditInvoiceDialog
        invoice={editTarget}
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
      />

      {/* Invoice Preview / Print */}
      <InvoicePreviewDialog
        invoice={previewInvoice as unknown as InvoicePreviewData | null}
        open={!!previewInvoice}
        onOpenChange={(v) => !v && setPreviewInvoice(null)}
        onEdit={() => {
          setEditTarget(previewInvoice as unknown as Invoice);
          setPreviewInvoice(null);
        }}
      />

      {/* Mark Paid */}
      {paidTarget && (
        <MarkPaidDialog
          key={paidTarget.id}
          invoice={paidTarget}
          open
          onOpenChange={(v) => !v && setPaidTarget(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Dokumen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen{" "}
              <span className="font-mono font-semibold">
                {deleteTarget?.number}
              </span>{" "}
              untuk <span className="font-semibold">{deleteTarget?.contact.name}</span>{" "}
              akan dihapus permanen. Tindakan ini tidak dapat dibatalkan. Jurnal
              otomatis yang sudah dibuat sebelumnya tidak ikut dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInvoice.isPending}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteInvoice.mutate(deleteTarget)}
              disabled={deleteInvoice.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteInvoice.isPending ? "Menghapus..." : "Hapus Dokumen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
