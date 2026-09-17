"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  ArrowDownToLine,
  Wallet,
  TrendingUp,
  Calendar,
  Link2,
  Loader2,
  Eye,
  Pencil,
  Trash2,
  Package,
  PackageX,
  Rows3,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Money, EmptyState } from "@/components/ui-helpers";
import { formatDate } from "@/lib/accounting";
import { cn } from "@/lib/utils";
import { authFetch } from "@/components/auth-provider";
import { DocToolbar } from "@/components/ui/doc-actions";
import { VoucherSheet, printVoucherDoc, useVoucherCompany, type VoucherDoc } from "@/components/voucher-a4";

type Contact = { id: string; code: string; name: string; type: string };
type BankAccount = { id: string; code: string; name: string; type: string };
type Invoice = { id: string; number: string; type: string; total: number; paidAmount: number; status: string; contactId: string };
type Account = { id: string; code: string; name: string; type: string; isGroup: boolean };
type TaxRule = { id: string; code: string; name: string; rate: number; appliesTo: string; accountCode: string };
type InventoryItem = {
  id: string; code: string; name: string; unit: string;
  purchasePrice: number; salePrice: number; quantityOnHand: number;
  reorderLevel?: number; isActive?: boolean;
};

type ReceiptLine = {
  id: string;
  accountCode: string;
  accountName?: string;
  itemId?: string | null;
  item?: { id: string; code: string; name: string } | null;
  description: string;
  quantity: number;
  unit: string;
  discount: number;
  unitPrice: number;
  amount: number;
  taxCode?: string | null;
  taxRate: number;
  taxAmount: number;
};

type Receipt = {
  id: string;
  number: string;
  date: string;
  amount: number;
  fromContactId: string | null;
  contact: { id: string; code: string; name: string } | null;
  bankAccountId: string;
  bankAccount: { id: string; code: string; name: string };
  accountCode: string;
  accountName?: string;
  allocateInvoice?: string | null;
  allocateToInvoiceId: string | null;
  description: string | null;
  reference: string | null;
  subtotal?: number;
  discount?: number;
  taxAmount?: number;
  footnote?: string | null;
  customTitle?: string | null;
  customTheme?: boolean;
  themeColor?: string;
  amountExcludesTax?: boolean;
  fixedAmount?: boolean;
  showLineNumber?: boolean;
  showDescription?: boolean;
  showQuantity?: boolean;
  showDiscount?: boolean;
  showTaxColumn?: boolean;
  lines?: ReceiptLine[];
  journalEntryId: string | null;
};

// ---------- Date helper ----------
function todayISO(): string {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

// ---------- Line draft ----------
type LineDraft = {
  key: string;
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  accountCode: string;
  taxCode: string;
};

const DEFAULT_LINE_ACCOUNT = "1-1300"; // akun baris default untuk penerimaan (piutang)

function newLine(accountCode: string): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: "",
    description: "",
    quantity: "1",
    unitPrice: "0",
    discount: "0",
    accountCode,
    taxCode: "",
  };
}

function toNumber(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function taxRateOf(rules: TaxRule[], code: string): number {
  return rules.find((r) => r.code === code)?.rate ?? 0;
}

function computeLine(l: LineDraft, rules: TaxRule[], amountExcludesTax: boolean) {
  const q = toNumber(l.quantity);
  const p = toNumber(l.unitPrice);
  const gross = q * p;
  const dct = Math.min(Math.max(toNumber(l.discount), 0), 100);
  const disc = gross * (dct / 100);
  const rate = taxRateOf(rules, l.taxCode);
  let net: number;
  let tax: number;
  if (rate > 0 && !amountExcludesTax) {
    const full = gross - disc;
    net = full / (1 + rate / 100);
    tax = full - net;
  } else {
    net = gross - disc;
    tax = net * (rate / 100);
  }
  return { gross, disc, net, tax, rate };
}

function computeSummary(lines: LineDraft[], rules: TaxRule[], amountExcludesTax: boolean) {
  const valid = lines.filter((l) => toNumber(l.quantity) > 0);
  const rows = valid.map((l) => computeLine(l, rules, amountExcludesTax));
  return {
    subtotal: rows.reduce((s, r) => s + r.gross, 0),
    discount: rows.reduce((s, r) => s + r.disc, 0),
    taxAmount: rows.reduce((s, r) => s + r.tax, 0),
    total: rows.reduce((s, r) => s + r.net + r.tax, 0),
  };
}

// ---------- Receipt Entry (catat & sunting, ala Manager.io) ----------
type ColumnOpts = {
  showLineNumber: boolean;
  showDescription: boolean;
  showQuantity: boolean;
  showDiscount: boolean;
  showTaxColumn: boolean;
};

function buildColumns(opts: ColumnOpts): string[] {
  const cols: string[] = [];
  if (opts.showLineNumber) cols.push("no");
  cols.push("item", "account");
  if (opts.showDescription) cols.push("desc");
  if (opts.showQuantity) cols.push("qty");
  if (opts.showDiscount) cols.push("dct");
  cols.push("price", "tax");
  if (opts.showTaxColumn) cols.push("taxAmt");
  cols.push("total");
  return cols;
}

const COL_TEMPLATE: Record<string, string> = {
  no: "36px",
  item: "minmax(100px,0.7fr)",
  account: "minmax(130px,0.85fr)",
  desc: "minmax(150px,1.25fr)",
  qty: "72px",
  dct: "80px",
  price: "112px",
  tax: "108px",
  taxAmt: "88px",
  total: "112px",
  del: "44px",
};

const COL_LABELS: Record<string, string> = {
  no: "No",
  item: "Item",
  account: "Akun",
  desc: "Deskripsi",
  qty: "Kuantitas",
  dct: "Diskon",
  price: "Harga",
  tax: "Kode Pajak",
  taxAmt: "Jumlah Pajak",
  total: "Total",
};

// ---------- Receipt Entry (catat & sunting, ala Manager.io) ----------
function ReceiptEntryDialog({
  open,
  onOpenChange,
  receipt,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  receipt?: Receipt | null;
  initial?: Receipt | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!receipt;
  const prefill = initial ?? receipt;

  const [date, setDate] = React.useState(() => (prefill ? prefill.date.slice(0, 10) : todayISO()));
  const [reference, setReference] = React.useState(() => prefill?.reference ?? "");
  const [bankAccountId, setBankAccountId] = React.useState(() => prefill?.bankAccountId ?? "");
  const [fromContactId, setFromContactId] = React.useState(() => prefill?.fromContactId ?? "");
  const [accountCode, setAccountCode] = React.useState(() => prefill?.accountCode ?? "1-1300");
  const [description, setDescription] = React.useState(() => prefill?.description ?? "");
  const [allocateToInvoiceId, setAllocateToInvoiceId] = React.useState(() => prefill?.allocateToInvoiceId ?? "");

  // Baris item
  const [lines, setLines] = React.useState<LineDraft[]>(() => {
    if (prefill && prefill.lines && prefill.lines.length > 0) {
      return prefill.lines.map((l) => ({
        key: Math.random().toString(36).slice(2),
        itemId: l.itemId ?? "",
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        discount: String(l.discount),
        accountCode: l.accountCode,
        taxCode: l.taxCode ?? "",
      }));
    }
    return [{
      ...newLine(prefill?.accountCode ?? DEFAULT_LINE_ACCOUNT),
      description: prefill?.description ?? "",
      unitPrice: String(prefill?.amount ?? 0),
    }];
  });

  // Opsi kolom & dokumen
  const [showLineNumber, setShowLineNumber] = React.useState(() => prefill?.showLineNumber ?? false);
  const [showDescription, setShowDescription] = React.useState(() => prefill?.showDescription ?? true);
  const [showQuantity, setShowQuantity] = React.useState(() => prefill?.showQuantity ?? true);
  const [showDiscount, setShowDiscount] = React.useState(() => prefill?.showDiscount ?? false);
  const [showTaxColumn, setShowTaxColumn] = React.useState(() => prefill?.showTaxColumn ?? true);
  const [amountExcludesTax, setAmountExcludesTax] = React.useState(() => prefill?.amountExcludesTax ?? true);
  const [fixedAmount, setFixedAmount] = React.useState(() => prefill?.fixedAmount ?? false);
  const [fixedValue, setFixedValue] = React.useState(() => (prefill?.fixedAmount ? String(prefill.amount) : ""));
  const [customTheme, setCustomTheme] = React.useState(() => prefill?.customTheme ?? false);
  const [themeColor, setThemeColor] = React.useState(() => prefill?.themeColor || "#047857");
  const [customTitle, setCustomTitle] = React.useState<boolean>(() => !!prefill?.customTitle);
  const [customTitleValue, setCustomTitleValue] = React.useState(() => prefill?.customTitle ?? "");
  const [showFootnote, setShowFootnote] = React.useState<boolean>(() => !!prefill?.footnote);
  const [footnote, setFootnote] = React.useState(() => prefill?.footnote ?? "");

  const contactsData = useQuery<{ contacts?: Contact[] }>({
    queryKey: ["contacts-receipt"],
    queryFn: async () => {
      const res = await authFetch("/api/contacts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });
  const banksData = useQuery<{ bankAccounts?: BankAccount[] }>({
    queryKey: ["bank-accounts-receipt"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });
  const accountsData = useQuery<{ accounts?: Account[] }>({
    queryKey: ["accounts-receipt"],
    queryFn: async () => {
      const res = await authFetch("/api/accounts?balances=false");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });
  const taxData = useQuery<{ rules?: TaxRule[] }>({
    queryKey: ["tax-receipt"],
    queryFn: async () => {
      const res = await authFetch("/api/tax");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });
  const itemsData = useQuery<{ items?: InventoryItem[] }>({
    queryKey: ["inventory-items-receipt"],
    queryFn: async () => {
      const res = await authFetch("/api/inventory/items");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });
  const invoicesData = useQuery<{ invoices?: Invoice[] }>({
    queryKey: ["invoices-receipt-allocation"],
    queryFn: async () => {
      const res = await authFetch("/api/invoices?type=SALES&status=SENT");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });

  const contacts = contactsData.data?.contacts ?? [];
  const banks = banksData.data?.bankAccounts ?? [];
  const accounts = accountsData.data?.accounts ?? [];
  const taxRules = taxData.data?.rules ?? [];
  const inventoryItems = itemsData.data?.items ?? [];
  const invoices = invoicesData.data?.invoices ?? [];

  const salesTax = taxRules.filter((r) => r.appliesTo === "SALES" || r.appliesTo === "BOTH");
  const outstandingInvoices = invoices.filter((i) => !fromContactId || i.contactId === fromContactId);
  const summary = React.useMemo(
    () => computeSummary(lines, taxRules, amountExcludesTax),
    [lines, taxRules, amountExcludesTax]
  );
  const displayTotal = fixedAmount ? toNumber(fixedValue) : summary.total;

  const updateLine = (key: string, field: keyof LineDraft, value: string) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  };
  const patchLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };
  const addLine = () => setLines((prev) => {
    const first = prev[0];
    return [...prev, {
      ...newLine(first?.accountCode ?? DEFAULT_LINE_ACCOUNT),
      taxCode: first?.taxCode ?? "",
    }];
  });

  const handleItemSelect = (key: string, itemId: string) => {
    const item = inventoryItems.find((i) => i.id === itemId);
    if (!item) {
      patchLine(key, { itemId: "", quantity: "1", unitPrice: "0" });
      return;
    }
    // Deskripsi tetap manual (tidak diisi otomatis dari nama item).
    patchLine(key, {
      itemId: item.id,
      quantity: "1",
      unitPrice: String(item.salePrice > 0 ? item.salePrice : item.purchasePrice || 0),
    });
  };

  const toggleFixed = () => {
    if (!fixedAmount) setFixedValue(String(Math.round(summary.total)));
    setFixedAmount(!fixedAmount);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const cleanLines = lines
        .filter((l) => l.description.trim() !== "")
        .map((l) => ({
          itemId: l.itemId || undefined,
          accountCode: l.accountCode.trim() || accountCode,
          description: l.description.trim(),
          quantity: toNumber(l.quantity),
          unitPrice: toNumber(l.unitPrice),
          discount: Math.min(Math.max(toNumber(l.discount), 0), 100),
          taxCode: l.taxCode || undefined,
        }));
      const payload = {
        date,
        bankAccountId,
        fromContactId: fromContactId || null,
        accountCode,
        description,
        reference,
        allocateToInvoiceId: allocateToInvoiceId || null,
        amountExcludesTax,
        fixedAmount,
        amount: fixedAmount ? toNumber(fixedValue) : (allocateToInvoiceId ? toNumber(fixedValue) : undefined),
        footnote: showFootnote ? footnote.trim() || undefined : undefined,
        customTitle: customTitle ? customTitleValue.trim() || undefined : undefined,
        customTheme,
        themeColor,
        showLineNumber,
        showDescription,
        showQuantity,
        showDiscount,
        showTaxColumn,
        lines: cleanLines,
      };
      const res = await authFetch(isEdit ? `/api/receipts/${receipt!.id}` : "/api/receipts", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan penerimaan");
      return data;
    },
    onSuccess: (data) => {
      const amt: number = data?.receipt?.amount ?? displayTotal;
      toast.success(isEdit ? "Penerimaan diperbarui" : "Penerimaan berhasil dicatat", {
        description: `Rp ${amt.toLocaleString("id-ID")} ${isEdit ? "disimpan" : "diterima"}`,
      });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const onSubmit = () => {
    if (!date) return toast.error("Tanggal wajib diisi");
    if (!bankAccountId) return toast.error("Pilih akun kas/bank (diterima ke)");
    const hasLine = lines.some((l) => toNumber(l.quantity) > 0);
    if (!hasLine && !fixedAmount && !allocateToInvoiceId)
      return toast.error("Isi minimal satu baris item atau aktifkan 'Jumlah tetap'");
    if (toNumber(fixedValue) <= 0 && (fixedAmount || allocateToInvoiceId) && !hasLine)
      return toast.error("Isi jumlah penerimaan");
    if (hasLine && !fixedAmount && summary.total <= 0)
      return toast.error("Total penerimaan harus lebih dari 0");
    mutation.mutate();
  };

  const cols = buildColumns({ showLineNumber, showDescription, showQuantity, showDiscount, showTaxColumn });
  const gridTemplate = [...cols.map((c) => COL_TEMPLATE[c]), COL_TEMPLATE.del].join(" ");
  const activeItems = inventoryItems.filter((i) => i.isActive !== false);

  // COA relevan untuk penerimaan: akun pendapatan, kewajiban, & aset (piutang)
  // (di-kredit saat uang masuk). Akun lain hanya muncul bila sedang terpakai.
  const accountOptions = React.useMemo(() => {
    const relevant = accounts.filter(
      (a) => !a.isGroup && (a.type === "REVENUE" || a.type === "LIABILITY" || a.type === "ASSET")
    );
    const usedCodes = new Set([
      ...lines.map((l) => l.accountCode),
      accountCode,
      ...(prefill?.lines?.map((l) => l.accountCode) ?? []),
    ]);
    usedCodes.delete("");
    const extras = accounts.filter((a) => !a.isGroup && (a.type === "EXPENSE" || a.type === "EQUITY") && usedCodes.has(a.code));
    return [
      { group: "Pendapatan", items: relevant.filter((a) => a.type === "REVENUE") },
      { group: "Kewajiban", items: relevant.filter((a) => a.type === "LIABILITY") },
      { group: "Aset", items: relevant.filter((a) => a.type === "ASSET") },
      ...(extras.length ? [{ group: "Lainnya (terpakai)", items: extras }] : []),
    ].filter((g) => g.items.length > 0);
  }, [accounts, lines, accountCode, prefill]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
            {isEdit
              ? `Sunting Penerimaan ${receipt!.number}`
              : initial
              ? `Duplikasi Penerimaan ${initial.number}`
              : "Catat Penerimaan"}
          </DialogTitle>
          <DialogDescription>
            {initial
              ? "Baris & pengaturan diambil dari penerimaan asli — simpan sebagai penerimaan baru."
              : "Uang masuk ke kas/bank — persis ala Manager.io: header, baris item, dan opsi dokumen."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Header */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="re-date">Tanggal</Label>
              <Input id="re-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-ref">No / Referensi (opsional)</Label>
              <Input id="re-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="BUKTI-001 / INV-001" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-bank">Diterima ke (Akun)</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger id="re-bank"><SelectValue placeholder="Pilih kas/bank..." /></SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-contact">Dari (Kontak)</Label>
              <Select value={fromContactId} onValueChange={(v) => { setFromContactId(v === "__none__" ? "" : v); setAllocateToInvoiceId(""); }}>
                <SelectTrigger id="re-contact"><SelectValue placeholder="Pilih pelanggan..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tanpa kontak —</SelectItem>
                  {contacts.filter((c) => c.type === "CUSTOMER" || c.type === "BOTH").map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {outstandingInvoices.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="re-invoice">Alokasikan ke Invoice (opsional)</Label>
                <Select value={allocateToInvoiceId} onValueChange={(v) => setAllocateToInvoiceId(v === "__none__" ? "" : v)}>
                  <SelectTrigger id="re-invoice"><SelectValue placeholder="Pilih invoice outstanding..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Tanpa alokasi —</SelectItem>
                    {outstandingInvoices.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.number} — sisa Rp {(i.total - i.paidAmount).toLocaleString("id-ID")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="re-desc">Deskripsi</Label>
              <Textarea id="re-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keterangan penerimaan..." />
            </div>
          </div>

          <Separator />

          {/* Baris item ala Manager.io */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rows3 className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Baris Item</Label>
              </div>
              <span className="text-xs text-muted-foreground">Pilih item dari persediaan + akun CoA + kode pajak tiap baris.</span>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <div className="inline-grid w-full gap-px bg-muted/60 p-px" style={{ gridTemplateColumns: gridTemplate, minWidth: 760 }}>
                {/* Header */}
                {cols.map((c) => (
                  <div key={c} className="bg-background px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {COL_LABELS[c]}
                  </div>
                ))}
                <div className="bg-background px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">✕</div>

                {/* Baris */}
                {lines.map((l, idx) => {
                  const c = computeLine(l, taxRules, amountExcludesTax);
                  const selectedItem = l.itemId ? activeItems.find((i) => i.id === l.itemId) : null;
                  const lineTotal = c.net + c.tax;
                  return (
                    <React.Fragment key={l.key}>
                      {showLineNumber && (
                        <div className="flex items-center justify-center bg-background px-2 py-1 text-xs font-bold tabular-nums text-muted-foreground">
                          {idx + 1}
                        </div>
                      )}
                      <div className="bg-background px-1 py-1">
                        <Select value={l.itemId} onValueChange={(v) => handleItemSelect(l.key, v)}>
                          <SelectTrigger className={cn("h-8 text-xs", l.itemId ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : "border-dashed text-muted-foreground")}>
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              {l.itemId ? <Package className="h-3 w-3 shrink-0 text-emerald-600" /> : <PackageX className="h-3 w-3 shrink-0" />}
                              <SelectValue placeholder="— Pilih Item Persediaan —" />
                            </div>
                          </SelectTrigger>
                          <SelectContent position="popper" className="min-w-[280px]">
                            <SelectItem value=""><span className="italic text-muted-foreground text-xs">— Kustom / Non-Persediaan —</span></SelectItem>
                            {activeItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                                  <span>{item.name}</span>
                                  <span className={cn("ml-auto text-xs tabular-nums", item.quantityOnHand <= 0 ? "text-rose-500" : item.quantityOnHand <= (item.reorderLevel ?? 0) ? "text-amber-500" : "text-emerald-600")}>
                                    Stok: {item.quantityOnHand} {item.unit}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="bg-background px-1 py-1">
                        <Select value={l.accountCode} onValueChange={(v) => updateLine(l.key, "accountCode", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent position="popper" className="min-w-[260px]">
                            {accountOptions.map((group) => (
                              <React.Fragment key={group.group}>
                                <SelectGroup>
                                  <SelectLabel className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.group}</SelectLabel>
                                  {group.items.map((a) => (
                                    <SelectItem key={a.id} value={a.code}>
                                      <span className="font-mono text-[11px] text-muted-foreground">{a.code}</span> — {a.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </React.Fragment>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {showDescription && (
                        <div className="bg-background px-1 py-1">
                          <Input value={l.description} placeholder="Tulis deskripsi..." onChange={(e) => updateLine(l.key, "description", e.target.value)} className="h-8 text-sm" />
                        </div>
                      )}
                      {showQuantity && (
                        <div className="bg-background px-1 py-1">
                          <Input type="number" inputMode="decimal" min="0" step="any" value={l.quantity} onChange={(e) => updateLine(l.key, "quantity", e.target.value)} className="h-8 text-right text-sm" />
                        </div>
                      )}
                      {showDiscount && (
                        <div className="bg-background px-1 py-1">
                          <div className="relative">
                            <Input type="number" min="0" max="100" step="any" value={l.discount} onChange={(e) => updateLine(l.key, "discount", e.target.value)} className="h-8 pr-6 text-right text-sm" />
                            <Percent className="absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                      <div className="bg-background px-1 py-1">
                        <Input type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => updateLine(l.key, "unitPrice", e.target.value)}
                          placeholder={selectedItem ? String(selectedItem.salePrice || 0) : "0"} className="h-8 text-right text-sm" />
                      </div>
                      <div className="bg-background px-1 py-1">
                        <Select value={l.taxCode} onValueChange={(v) => updateLine(l.key, "taxCode", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tanpa" /></SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value=""><span className="text-muted-foreground">— Tanpa Pajak —</span></SelectItem>
                            {salesTax.map((r) => (
                              <SelectItem key={r.id} value={r.code}>{r.code} · {r.rate}%</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {showTaxColumn && (
                        <div className="flex items-center justify-end bg-background px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                          <Money value={c.tax} />
                        </div>
                      )}
                      <div className="flex items-center justify-end bg-background px-2 py-1 text-sm font-semibold tabular-nums">
                        <Money value={lineTotal} zeroDash={false} />
                      </div>
                      <div className="flex items-center justify-center bg-background px-1 py-1">
                        <Button size="icon" variant="ghost" type="button" onClick={() => removeLine(l.key)} className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Hapus baris">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </React.Fragment>
                  );
                })}

                {/* Baris tambah */}
                <div className="col-span-full bg-background p-1">
                  <Button variant="outline" size="sm" type="button" onClick={addLine} className="w-full border-dashed text-muted-foreground">
                    <Plus className="h-3.5 w-3.5" /> Tambah Baris
                  </Button>
                </div>
              </div>
            </div>

            {/* Opsi kolom */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-muted/40 rounded-lg px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nama Kolom:</span>
              {([
                ["showLineNumber", "Nomor baris", setShowLineNumber],
                ["showDescription", "Deskripsi", setShowDescription],
                ["showQuantity", "Kuantitas", setShowQuantity],
                ["showDiscount", "Diskon", setShowDiscount],
              ] as const).map(([key, label, setter]) => (
                <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={(key === "showLineNumber" ? showLineNumber : key === "showDescription" ? showDescription : key === "showQuantity" ? showQuantity : showDiscount)}
                    onCheckedChange={(v) => (setter as (x: boolean) => void)(v === true)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Opsi dokumen ala Manager.io */}
          <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
            <div className="space-y-3 border rounded-lg p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Opsi Dokumen</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5">
                  <Checkbox checked={amountExcludesTax} onCheckedChange={(v) => setAmountExcludesTax(v === true)} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Jumlah belum termasuk PPN</span>
                    <span className="block text-xs text-muted-foreground">Harga baris belum termasuk pajak; pajak ditambahkan ke total.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5">
                  <Checkbox checked={fixedAmount} onCheckedChange={() => toggleFixed()} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Jumlah tetap</span>
                    <span className="block text-xs text-muted-foreground">Total penerimaan diisi manual; baris disetarakan.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5">
                  <Checkbox checked={customTheme} onCheckedChange={(v) => setCustomTheme(v === true)} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Tema Kustom</span>
                    <span className="block text-xs text-muted-foreground">Warna aksen dokumen cetak.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5">
                  <Checkbox checked={customTitle} onCheckedChange={(v) => setCustomTitle(v === true)} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Judul Kustom</span>
                    <span className="block text-xs text-muted-foreground">Ganti judul dokumen (mis. Kuitansi).</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5">
                  <Checkbox checked={showTaxColumn} onCheckedChange={(v) => setShowTaxColumn(v === true)} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Tampilkan kolom jumlah pajak</span>
                    <span className="block text-xs text-muted-foreground">Perlihatkan nilai pajak tiap baris.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5">
                  <Checkbox checked={showFootnote} onCheckedChange={(v) => setShowFootnote(v === true)} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Catatan Kaki</span>
                    <span className="block text-xs text-muted-foreground">Keterangan tambahan di kaki dokumen.</span>
                  </span>
                </label>
              </div>

              {(fixedAmount || allocateToInvoiceId) && (
                <div className="grid gap-2">
                  <Label htmlFor="re-fixed">Jumlah Penerimaan (Rp)</Label>
                  <Input id="re-fixed" type="number" min="0" step="any" value={fixedValue} onChange={(e) => setFixedValue(e.target.value)} placeholder={String(Math.round(summary.total))} className="text-right tabular-nums" />
                </div>
              )}
              {customTitle && (
                <div className="grid gap-2">
                  <Label htmlFor="re-custom-title">Judul Kustom</Label>
                  <Input id="re-custom-title" value={customTitleValue} onChange={(e) => setCustomTitleValue(e.target.value)} placeholder="mis. Kuitansi, Bukti Penerimaan..." />
                </div>
              )}
              {showFootnote && (
                <div className="grid gap-2">
                  <Label htmlFor="re-footnote">Catatan Kaki</Label>
                  <Textarea id="re-footnote" rows={2} value={footnote} onChange={(e) => setFootnote(e.target.value)} placeholder="Catatan kaki dokumen..." />
                </div>
              )}
              {customTheme && (
                <div className="grid gap-2">
                  <Label>Warna Aksen (Tema Kustom)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="h-9 w-16 cursor-pointer p-1" />
                    <Input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="h-9 w-32 font-mono text-xs uppercase" />
                  </div>
                </div>
              )}
            </div>

            {/* Ringkasan */}
            <div className="border rounded-lg bg-muted/30 p-4 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ringkasan</span>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums"><Money value={summary.subtotal} /></span>
                </div>
                {summary.discount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Diskon</span>
                    <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">−<Money value={summary.discount} zeroDash={false} /></span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pajak</span>
                  <span className="font-medium tabular-nums"><Money value={summary.taxAmount} /></span>
                </div>
                <Separator />
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold">Total</span>
                  <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    <Money value={displayTotal} zeroDash={false} />
                  </span>
                </div>
                {fixedAmount && summary.total > 0 && summary.total !== displayTotal && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Jumlah tetap {displayTotal.toLocaleString("id-ID")}; baris akan dibulatkan ke nilai ini (PPh/pajak proporsional).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Batal</Button>
          <Button onClick={onSubmit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />}
            {isEdit ? "Simpan Perubahan" : "Simpan Penerimaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDetailDialog({
  receipt,
  open,
  onOpenChange,
  onEdit,
  onDuplicate,
}: {
  receipt: Receipt | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (r: Receipt) => void;
  onDuplicate: (r: Receipt) => void;
}) {
  const company = useVoucherCompany();
  if (!receipt) return null;
  const linesCount = (receipt.lines ?? []).length;
  const doc: VoucherDoc = {
    kind: "receipt",
    number: receipt.number,
    date: formatDate(receipt.date),
    amount: receipt.amount,
    contactName: receipt.contact?.name ?? null,
    contactAddress: null,
    bankName: receipt.bankAccount.name,
    accountCode: receipt.accountCode,
    accountName: receipt.accountName ?? receipt.accountCode,
    reference: receipt.reference,
    invoiceNumber: receipt.allocateInvoice ?? null,
    description: receipt.description,
    lines: (receipt.lines ?? []).map((line) => ({
      description: line.item ? `${line.item.code} — ${line.description}` : line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      taxAmount: line.taxAmount,
    })),
    footnote: receipt.footnote,
    customTitle: receipt.customTitle,
    themeColor: receipt.customTheme ? receipt.themeColor : undefined,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto p-0 bg-muted/30">
        <DialogHeader className="no-print px-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-emerald-600" /> Penerimaan {receipt.number}
          </DialogTitle>
          <DialogDescription>
            Kop perusahaan, judul dokumen, {linesCount > 0 ? `${linesCount} baris item, ` : ""}tema kustom — ukuran A4.
          </DialogDescription>
        </DialogHeader>

        <div className="no-print sticky top-0 z-20 flex items-center justify-end gap-2 border-b bg-background px-4 py-2.5">
          <DocToolbar
            onEdit={() => { onOpenChange(false); onEdit(receipt); }}
            onDuplicate={() => { onOpenChange(false); onDuplicate(receipt); }}
            onPrint={() => printVoucherDoc(doc, company)}
            onClose={() => onOpenChange(false)}
          />
        </div>
        <div className="p-4">
          <VoucherSheet doc={doc} company={company} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Daftar Penerimaan ----------
export function ReceiptsView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ receipts: Receipt[] }>({
    queryKey: ["receipts"],
    queryFn: async () => {
      const res = await authFetch("/api/receipts?limit=200");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [detailTarget, setDetailTarget] = React.useState<Receipt | null>(null);
  const [editTarget, setEditTarget] = React.useState<Receipt | null>(null);
  const [duplicateTarget, setDuplicateTarget] = React.useState<Receipt | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Receipt | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (r: Receipt) => {
      const res = await authFetch(`/api/receipts/${r.id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Gagal menghapus"); }
    },
    onSuccess: (_d, r) => {
      toast.success("Penerimaan dihapus", { description: r.number });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receipts = data?.receipts ?? [];
  const filtered = React.useMemo(() => {
    if (!search) return receipts;
    const q = search.toLowerCase();
    return receipts.filter((r) =>
      r.number.toLowerCase().includes(q) ||
      (r.contact?.name ?? "").toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q) ||
      (r.reference ?? "").toLowerCase().includes(q) ||
      (r.lines ?? []).some((l) => l.description.toLowerCase().includes(q))
    );
  }, [receipts, search]);

  const totalReceived = receipts.reduce((s, r) => s + r.amount, 0);
  const thisMonth = receipts.filter((r) => {
    const d = new Date(r.date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, r) => s + r.amount, 0);
  const withInvoice = receipts.filter((r) => r.allocateToInvoiceId).length;
  const withLines = receipts.filter((r) => (r.lines ?? []).length > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Total Diterima
            </div>
            <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              <Money value={totalReceived} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Bulan Ini
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums"><Money value={thisMonth} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Jumlah Transaksi</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{receipts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5 text-sky-600" /> Alokasi Invoice
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums">{withInvoice}</div>
            {withLines > 0 && <div className="text-[11px] text-muted-foreground">{withLines} transaksi multi-baris</div>}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari nomor / kontak / item / keterangan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" /> Catat Penerimaan
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            icon={<ArrowDownToLine className="h-5 w-5" />}
            title="Belum ada penerimaan"
            description="Catat penerimaan pertama ke kas/bank Anda, lengkap dengan baris item ala Manager.io."
            action={<Button onClick={() => setFormOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" /> Catat Penerimaan</Button>}
          />
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-emerald-600" /> Daftar Penerimaan
            </CardTitle>
            <CardDescription>Uang masuk ke kas &amp; bank</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Nomor</TableHead>
                    <TableHead className="w-28">Tanggal</TableHead>
                    <TableHead>Dari / Baris Item</TableHead>
                    <TableHead className="hidden md:table-cell w-40">Akun Bank</TableHead>
                    <TableHead className="hidden lg:table-cell w-44">Accounts</TableHead>
                    <TableHead className="hidden sm:table-cell w-32">Referensi</TableHead>
                    <TableHead className="text-right w-36">Jumlah</TableHead>
                    <TableHead className="w-20 text-center">Invoice</TableHead>
                    <TableHead className="w-24 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const firstLine = (r.lines ?? [])[0];
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setDetailTarget(r)}>
                        <TableCell className="font-mono text-xs font-medium">{r.number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(r.date)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {r.contact && <span className="text-sm font-medium">{r.contact.name}</span>}
                            {firstLine && (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-[300px]">
                                <Rows3 className="h-3 w-3 shrink-0" />
                                <span className="truncate">{firstLine.description}</span>
                                {(r.lines ?? []).length > 1 && (
                                  <Badge variant="outline" className="text-[10px] shrink-0">+{(r.lines ?? []).length - 1} baris</Badge>
                                )}
                              </span>
                            )}
                            {r.description && !firstLine && <span className="text-xs text-muted-foreground truncate max-w-[280px]">{r.description}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Wallet className="h-3 w-3 text-muted-foreground" />
                            <span>{r.bankAccount.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-mono text-[10px] text-muted-foreground">{r.accountCode}</span>
                            <span>{r.accountName || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{r.reference ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          + <Money value={r.amount} zeroDash={false} />
                        </TableCell>
                        <TableCell className="text-center">
                          {r.allocateToInvoiceId ? (
                            <Badge variant="outline" className="text-[10px] text-sky-600 border-sky-600/30">
                              <Link2 className="mr-0.5 h-2.5 w-2.5" /> Ya
                            </Badge>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-[11px] font-semibold"
                              title="Lihat detail penerimaan"
                              onClick={(e) => { e.stopPropagation(); setDetailTarget(r); }}
                            >
                              <Eye className="h-3 w-3" /> Detail
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-[11px]"
                              title="Sunting penerimaan"
                              onClick={(e) => { e.stopPropagation(); setEditTarget(r); }}
                            >
                              <Pencil className="h-3 w-3" /> Sunting
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:text-rose-700" title="Hapus" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td colSpan={6} className="text-right p-4">
                      Total Diterima
                      {(totalReceived !== 0 && receipts.some((r) => (r.taxAmount ?? 0) > 0)) && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (termasuk pajak)
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-emerald-600 dark:text-emerald-400 p-4"><Money value={totalReceived} /></td>
                    <td className="p-4"></td>
                    <td className="p-4"></td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {formOpen && <ReceiptEntryDialog open onOpenChange={setFormOpen} />}
      <ReceiptDetailDialog
        receipt={detailTarget}
        open={!!detailTarget}
        onOpenChange={(v) => !v && setDetailTarget(null)}
        onEdit={(r) => setEditTarget(r)}
        onDuplicate={(r) => setDuplicateTarget(r)}
      />
      {editTarget && (
        <ReceiptEntryDialog
          key={editTarget.id}
          open
          onOpenChange={(v) => !v && setEditTarget(null)}
          receipt={editTarget}
        />
      )}
      {duplicateTarget && (
        <ReceiptEntryDialog
          key={`dup-${duplicateTarget.id}`}
          open
          onOpenChange={(v) => !v && setDuplicateTarget(null)}
          initial={duplicateTarget}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus penerimaan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Penerimaan <span className="font-semibold">{deleteTarget?.number}</span> beserta jurnal dan baris itemnya akan dihapus permanen
              {deleteTarget?.allocateToInvoiceId ? " dan alokasi invoice dikembalikan." : "."}
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