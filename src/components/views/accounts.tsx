"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Folder,
  FileText,
  FolderPlus,
  ArrowUp,
  ArrowDown,
  Settings,
  ShieldAlert,
  Scale,
  TrendingUp,
  Check,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Money, EmptyState } from "@/components/ui-helpers";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/accounting";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  parentCode: string | null;
  isGroup: boolean;
  isActive: boolean;
  description: string | null;
  sortOrder: number;
  isSystem: boolean;
  referencedBy: string[];
  totalDebit: number;
  totalCredit: number;
  balance: number;
};

const TYPE_ACCENT: Record<AccountType, string> = {
  ASSET: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  LIABILITY: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  EQUITY: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  REVENUE: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  EXPENSE: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
};

const TYPE_PREFIX: Record<AccountType, string> = {
  ASSET: "1",
  LIABILITY: "2",
  EQUITY: "3",
  REVENUE: "4",
  EXPENSE: "5",
};

// Resolusi child: "1-2000" → prefix root "1" bila subgroup tidak ada
function resolveParent(parent: string, accounts: Account[]): string {
  if (!parent) return "";
  if (accounts.some((a) => a.code === parent)) return parent;
  const prefix = parent.split("-")[0];
  if (accounts.some((a) => a.code === prefix)) return prefix;
  return "";
}

// Auto-sugesti sub-tipe & akun induk berdasar nama + tipe (kaidah akuntansi)
const ACCOUNTING_SUGGESTIONS: Record<AccountType, { match: string[]; subtype: string; parent: string }[]> = {
  ASSET: [
    { match: ["akumulasi"], subtype: "Contra Asset", parent: "1-2000" },
    { match: ["peralatan", "mesin", "komputer", "instalasi"], subtype: "Equipment", parent: "1-2000" },
    { match: ["kendaraan"], subtype: "Vehicle", parent: "1-2000" },
    { match: ["bangunan", "gedung"], subtype: "Building", parent: "1-2000" },
    { match: ["tanah"], subtype: "Land", parent: "1-2000" },
    { match: ["kas", "setara kas"], subtype: "Cash", parent: "1-1000" },
    { match: ["bank", "rekening", "giro"], subtype: "Bank", parent: "1-1000" },
    { match: ["piutang"], subtype: "Account Receivable", parent: "1-1000" },
    { match: ["persediaan", "stok"], subtype: "Inventory", parent: "1-1000" },
    { match: ["uang muka", "dibayar di muka", "bayar di muka", "dimuka", "dp "], subtype: "Prepaid", parent: "1-1000" },
    { match: ["ppn masukan"], subtype: "VAT Input", parent: "1-1000" },
    { match: ["investasi"], subtype: "Investment", parent: "1" },
  ],
  LIABILITY: [
    { match: ["jangka panjang"], subtype: "Long Term Liability", parent: "2-2000" },
    { match: ["obligasi"], subtype: "Bonds Payable", parent: "2-2000" },
    { match: ["hutang usaha", "utang usaha", "hutang dagang", "utang dagang"], subtype: "Account Payable", parent: "2-1000" },
    { match: ["pajak"], subtype: "Tax Payable", parent: "2-1000" },
    { match: ["diterima di muka", "dibayar di muka", "dimuka"], subtype: "Unearned Revenue", parent: "2-1000" },
    { match: ["bank", "pinjaman", "hutang bank", "utang bank"], subtype: "Short Term Loan", parent: "2-1000" },
    { match: ["gaji", "upah"], subtype: "Accrued Expense", parent: "2-1000" },
  ],
  EQUITY: [
    { match: ["laba tahun berjalan", "rugi tahun berjalan"], subtype: "Current Year Income", parent: "3" },
    { match: ["laba ditahan"], subtype: "Retained Earning", parent: "3" },
    { match: ["prive", "penarikan"], subtype: "Owner Drawing", parent: "3" },
    { match: ["modal", "setoran"], subtype: "Owner Capital", parent: "3" },
  ],
  REVENUE: [
    { match: ["potongan pembelian"], subtype: "Purchase Discount", parent: "4" },
    { match: ["pendapatan jasa"], subtype: "Service Revenue", parent: "4" },
    { match: ["penjualan"], subtype: "Sales Revenue", parent: "4" },
    { match: ["sewa"], subtype: "Rent Income", parent: "4" },
    { match: ["bunga"], subtype: "Interest Income", parent: "4" },
    { match: ["lain-lain", "lain lain", "lainnya"], subtype: "Other Revenue", parent: "4" },
  ],
  EXPENSE: [
    { match: ["pokok penjualan", "hpp", "cogs"], subtype: "COGS", parent: "5" },
    { match: ["penyusutan"], subtype: "Depreciation Expense", parent: "5" },
    { match: ["pajak"], subtype: "Tax Expense", parent: "5" },
    { match: ["bunga"], subtype: "Interest Expense", parent: "5-1000" },
    { match: ["gaji", "upah"], subtype: "Salary Expense", parent: "5-1000" },
    { match: ["sewa"], subtype: "Rent Expense", parent: "5-1000" },
    { match: ["listrik", "utilitas", "air", "telepon", "internet"], subtype: "Utility Expense", parent: "5-1000" },
    { match: ["perlengkapan"], subtype: "Supplies Expense", parent: "5-1000" },
    { match: ["pemasaran", "iklan", "promosi", "periklanan"], subtype: "Marketing Expense", parent: "5-1000" },
    { match: ["transportasi", "perjalanan", "bensin", "bbm", "taksi"], subtype: "Transport Expense", parent: "5-1000" },
    { match: ["administrasi", "kantor", "atk", "umum"], subtype: "Admin Expense", parent: "5-1000" },
    { match: ["asuransi"], subtype: "Insurance Expense", parent: "5-1000" },
  ],
};

function suggestAccountingFromName(type: AccountType, name: string): { subtype: string; parentCode: string } {
  const n = (name || "").toLowerCase();
  const list = ACCOUNTING_SUGGESTIONS[type] ?? [];
  for (const s of list) {
    if (s.match.some((k) => n.includes(k))) {
      return { subtype: s.subtype, parentCode: s.parent };
    }
  }
  return { subtype: "", parentCode: TYPE_PREFIX[type] ?? "" };
}

// Sugestikan kode akun otomatis mengikuti urutan saudara (sibling) yang sudah ada.
// - Tanpa induk & group: kode root ("1", "2", ...) jika belum ada, atau group di bawah root.
// - Anak root: "-1000", "-2000", ... (kelipatan 1000).
// - Anak level berikutnya: "-1100", "-1200", ... (kelipatan 100 di atas induk).
function suggestAccountCode(
  accounts: Account[],
  type: AccountType,
  parentCode: string,
  isGroup: boolean
): string {
  const prefix = TYPE_PREFIX[type];
  const root = accounts.find((a) => a.code === prefix);

  let parent = parentCode;
  if (!parent) {
    if (isGroup && !root) return prefix;
    if (root) parent = prefix;
    else return `${prefix}-1000`;
  }

  const step = parent === prefix ? 1000 : 100;
  const used = new Set<number>();
  for (const a of accounts) {
    if (!a.code.startsWith(parent + "-")) continue;
    const suffix = a.code.slice(parent.length + 1);
    if (/^\d+$/.test(suffix)) {
      const n = Number(suffix);
      used.add(step === 1000 ? Math.floor(n / 1000) * 1000 : n);
    }
  }

  let next: number;
  if (step === 1000) {
    next = 1000;
    while (used.has(next)) next += 1000;
  } else {
    const pm = parent.match(/(\d+)$/);
    const baseNum = pm ? Number(pm[1]) : 1000;
    next = Math.floor(baseNum / 100) * 100 + 100;
    while (used.has(next)) next += 100;
  }
  return `${parent}-${next}`;
}

// Manager.io layout: Neraca (kiri) = Aset/Liabilitas/Ekuitas, Laba-Rugi (kanan) = Pendapatan/Beban
const NERACA_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY"];
const LABARUGI_TYPES: AccountType[] = ["REVENUE", "EXPENSE"];

const NERACA_LABEL = { title: "Neraca", desc: "Aset, liabilitas, dan ekuitas", icon: Scale, accent: "text-emerald-600" };
const LABARUGI_LABEL = { title: "Laba Rugi", desc: "Pendapatan dan beban", icon: TrendingUp, accent: "text-sky-600" };

function AccountForm({
  open,
  onOpenChange,
  editing,
  isGroupPreset = false,
  defaultType = "ASSET",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Account | null;
  isGroupPreset?: boolean;
  defaultType?: AccountType;
}) {
  const qc = useQueryClient();
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("ASSET");
  const [subtype, setSubtype] = React.useState("");
  const [parentCode, setParentCode] = React.useState("");
  const [isGroup, setIsGroup] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [codeEdited, setCodeEdited] = React.useState(false);
  const [subtypeEdited, setSubtypeEdited] = React.useState(false);
  const [parentEdited, setParentEdited] = React.useState(false);

  const protectedAccount = editing?.isSystem ?? false;

  React.useEffect(() => {
    if (editing) {
      setCode(editing.code);
      setName(editing.name);
      setType(editing.type);
      setSubtype(editing.subtype ?? "");
      setParentCode(editing.parentCode ?? "");
      setIsGroup(editing.isGroup);
      setDescription(editing.description ?? "");
      setCodeEdited(false);
      setSubtypeEdited(false);
      setParentEdited(false);
    } else {
      setCode("");
      setName("");
      setType(defaultType);
      setSubtype("");
      setParentCode("");
      setIsGroup(isGroupPreset);
      setDescription("");
      setCodeEdited(false);
      setSubtypeEdited(false);
      setParentEdited(false);
    }
  }, [editing, open]);

  const { data: accountsData } = useQuery<{ accounts: Account[] }>({
    queryKey: ["accounts", "form"],
    queryFn: async () => {
      const res = await fetch("/api/accounts?balances=false");
      if (!res.ok) throw new Error("Gagal memuat akun");
      return res.json();
    },
    enabled: open,
  });

  // Kode otomatis mengikuti urutan (hanya untuk akun baru)
  const suggestion = React.useMemo(() => {
    if (editing) return null;
    return suggestAccountCode(accountsData?.accounts ?? [], type, parentCode, isGroup);
  }, [accountsData, editing, type, parentCode, isGroup]);

  const effectiveCode = editing ? code : codeEdited ? code : (suggestion ?? "");

  // Setelah mengubah tipe/induk/group, usul ulang kode otomatis (hapus kode manual lama)
  const refreshAutoCode = React.useCallback(() => {
    if (editing || protectedAccount) return;
    setCode("");
    setCodeEdited(false);
  }, [editing, protectedAccount]);

  // Saat nama/tipe berubah, isi sub-tipe & akun induk otomatis (kaidah akuntansi),
  // selama user belum mengubahnya manual.
  const applyAutoAccounting = (t: AccountType, nm: string) => {
    if (editing || protectedAccount) return;
    const auto = suggestAccountingFromName(t, nm);
    if (!subtypeEdited) setSubtype(auto.subtype);
    if (!parentEdited) setParentCode(resolveParent(auto.parentCode, accountsData?.accounts ?? []));
  };

  const handleTypeChange = (v: AccountType) => {
    setType(v);
    applyAutoAccounting(v, name);
    refreshAutoCode();
  };

  const handleNameChange = (v: string) => {
    setName(v);
    applyAutoAccounting(type, v);
    refreshAutoCode();
  };

  const changeParent = (v: string) => {
    setParentCode(v === "__none__" ? "" : v);
    setParentEdited(true);
    refreshAutoCode();
  };
  const toggleGroup = (v: boolean) => {
    setIsGroup(v);
    refreshAutoCode();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { code: effectiveCode, name, type, subtype, parentCode, isGroup, description };
      if (editing) {
        const res = await fetch(`/api/accounts/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const e = await res.json();
          throw new Error(e.error || "Gagal memperbarui akun");
        }
        return res.json();
      } else {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const e = await res.json();
          throw new Error(e.error || "Gagal membuat akun");
        }
        return res.json();
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Akun diperbarui" : "Akun dibuat");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const parentOptions = (accountsData?.accounts ?? []).filter((a) => a.code !== effectiveCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Akun" : isGroupPreset ? "Tambah Group" : "Tambah Akun"}</DialogTitle>
          <DialogDescription>
            {protectedAccount
              ? "Akun terpakai modul: hanya nama, deskripsi, grup, dan sub-tipe yang bisa diubah."
              : editing
              ? "Perbarui detail akun"
              : "Buat akun baru pada chart of accounts"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {protectedAccount && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-50 p-2.5 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Terkunci — kode &amp; tipe tidak bisa diubah, tidak bisa dihapus.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Kode Akun</Label>
              <Input
                id="code"
                value={effectiveCode}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeEdited(true);
                }}
                placeholder={editing ? "" : "Otomatis sesuai urutan"}
                disabled={protectedAccount}
                className="font-mono"
              />
              {!editing && (
                <p className="text-[10px] text-muted-foreground">
                  Diisi otomatis mengikuti urutan; kosongkan untuk memakai saran.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Tipe</Label>
              <Select value={type} onValueChange={handleTypeChange} disabled={protectedAccount}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nama Akun</Label>
            <Input id="name" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Kas & Setara Kas" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subtype">Sub-tipe</Label>
              <Input
                id="subtype"
                value={subtype}
                onChange={(e) => {
                  setSubtype(e.target.value);
                  setSubtypeEdited(true);
                }}
                placeholder="Otomatis dari nama akun"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parent">Akun Induk</Label>
              <Select value={parentCode || "__none__"} onValueChange={changeParent}>
                <SelectTrigger id="parent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak ada —</SelectItem>
                  {parentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.code}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Deskripsi (opsional)</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <Checkbox id="isGroup" checked={isGroup} onCheckedChange={toggleGroup} />
            <Label htmlFor="isGroup" className="cursor-pointer text-sm">
              Akun Header / Group
              <span className="ml-2 text-xs text-muted-foreground">(tidak bisa dijurnal langsung)</span>
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !effectiveCode || !name}>
            {saveMutation.isPending ? "Menyimpan..." : editing ? "Simpan Perubahan" : isGroupPreset ? "Buat Group" : "Buat Akun"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(true);
  const delMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Gagal menghapus");
      }
    },
    onSuccess: () => {
      toast.success("Akun dihapus");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setOpen(false);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hapus Akun</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Yakin ingin menghapus <span className="font-semibold text-foreground">{account.code} — {account.name}</span>?
          Tindakan ini tidak bisa dibatalkan.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); onClose(); }}>Batal</Button>
          <Button variant="destructive" onClick={() => delMutation.mutate()} disabled={delMutation.isPending}>
            {delMutation.isPending ? "Menghapus..." : "Hapus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountsView({ manageable = false }: { manageable?: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ accounts: Account[] }>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("Gagal memuat akun");
      return res.json();
    },
  });
  const [search, setSearch] = React.useState("");
  const [filterType, setFilterType] = React.useState<string>("ALL");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formPreset, setFormPreset] = React.useState<{ isGroup: boolean }>({ isGroup: false });
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [deleting, setDeleting] = React.useState<Account | null>(null);

  const accounts = data?.accounts ?? [];

  const byType = React.useMemo(() => {
    const map = new Map<AccountType, Account[]>();
    for (const a of accounts) {
      if (filterType !== "ALL" && a.type !== filterType) continue;
      if (search) {
        const q = search.toLowerCase();
        if (!a.name.toLowerCase().includes(q) && !a.code.toLowerCase().includes(q) && !(a.subtype ?? "").toLowerCase().includes(q)) continue;
      }
      if (!map.has(a.type)) map.set(a.type, []);
      map.get(a.type)!.push(a);
    }
    return map;
  }, [accounts, search, filterType]);

  const flattenTree = (list: Account[]): { account: Account; depth: number }[] => {
    const result: { account: Account; depth: number }[] = [];
    const listCodes = new Set(list.map((a) => a.code));
    const roots = list.filter((a) => !a.parentCode || !listCodes.has(a.parentCode));
    const recurse = (acc: Account, depth: number) => {
      result.push({ account: acc, depth });
      const isCollapsed = collapsed.has(acc.code);
      if (!isCollapsed) {
        const children = list.filter((x) => x.parentCode === acc.code);
        children.forEach((c) => recurse(c, depth + 1));
      }
    };
    roots.forEach((r) => recurse(r, 0));
    return result;
  };

  const toggle = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Reorder hanya tersedia dalam mode kelola (mengatur urutan COA)
  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan urutan");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (rows: { account: Account; depth: number }[], index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((r) => r.account.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderMutation.mutate(ids);
  };

  const [addType, setAddType] = React.useState<AccountType>("ASSET");
  const openAddAccount = (type: AccountType) => {
    setEditing(null);
    setFormPreset({ isGroup: false });
    setAddType(type);
    setFormOpen(true);
  };
  const openAddGroup = (type: AccountType) => {
    setEditing(null);
    setFormPreset({ isGroup: true });
    setAddType(type);
    setFormOpen(true);
  };

  const panelTotal = (types: AccountType[]) =>
    types.reduce((s, t) => {
      const subtotal = (byType.get(t) ?? []).filter((a) => !a.isGroup).reduce((x, a) => x + a.balance, 0);
      return s + subtotal;
    }, 0);

  const renderTypeTables = (types: AccountType[]) => {
    return types.map((t) => {
      const list = byType.get(t);
      if (!list || list.length === 0) return null;
      const rows = flattenTree(list);
      return (
        <div key={t} className={cn("border-t", types.indexOf(t) === 0 && "border-t-0")}>
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", TYPE_ACCENT[t])}>
                {ACCOUNT_TYPE_LABELS[t]}
              </span>
              <span className="text-xs text-muted-foreground">{list.length} akun</span>
            </div>
            <span className="text-sm font-semibold tabular-nums">
              <Money value={list.filter((a) => !a.isGroup).reduce((s, a) => s + a.balance, 0)} />
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-28">Kode</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead className="hidden md:table-cell w-32">Sub-tipe</TableHead>
                <TableHead className="text-right w-36">Saldo</TableHead>
                {manageMode && <TableHead className="w-32 text-right">Kelola</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ account: a, depth }, idx) => {
                const hasChildren = list.some((x) => x.parentCode === a.code);
                const isCollapsed = collapsed.has(a.code);
                return (
                  <TableRow key={a.id} className={cn(!a.isActive && "opacity-50", a.isGroup && "bg-muted/30 font-medium")}>
                    <TableCell className="pl-2">
                      {hasChildren ? (
                        <button onClick={() => toggle(a.code)} className="text-muted-foreground hover:text-foreground">
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      ) : (
                        <span className="text-muted-foreground/40">•</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs" style={{ paddingLeft: `${6 + depth * 18}px` }}>{a.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {a.isGroup ? <Folder className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />}
                        <span className="text-sm">{a.name}</span>
                        {a.isGroup && <Badge variant="outline" className="text-[10px]">Group</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{a.subtype ?? "—"}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", a.type === "ASSET" || a.type === "EXPENSE" ? "" : "text-rose-600 dark:text-rose-400")}>
                      <Money value={a.balance} />
                    </TableCell>
                    {manageMode && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Naik" onClick={() => move(rows, idx, -1)} disabled={reorderMutation.isPending || idx === 0}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Turun" onClick={() => move(rows, idx, 1)} disabled={reorderMutation.isPending || idx === rows.length - 1}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit akun" onClick={() => { setEditing(a); setFormOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:text-rose-700 disabled:opacity-30"
                            title={a.isSystem ? "Terkunci sistem — tidak bisa dihapus" : "Hapus"}
                            onClick={() => setDeleting(a)} disabled={a.isSystem}
                          >
                            {a.isSystem ? <Lock className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      );
    });
  };

  const renderPanel = (key: "neraca" | "labarugi") => {
    const types = key === "neraca" ? NERACA_TYPES : LABARUGI_TYPES;
    const meta = key === "neraca" ? NERACA_LABEL : LABARUGI_LABEL;
    const Icon = meta.icon;
    const leadType = types[0];
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-md p-1.5", "bg-muted/50", meta.accent)}>
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-base">{meta.title}</CardTitle>
                <CardDescription>{meta.desc}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {manageMode && (
                <>
                  <Button variant="outline" size="sm" onClick={() => openAddAccount(leadType)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Akun
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openAddGroup(leadType)}>
                    <FolderPlus className="mr-1 h-3.5 w-3.5" /> Group
                  </Button>
                </>
              )}
              <span className="text-lg font-bold tabular-nums">
                <Money value={panelTotal(types)} />
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {types.some((t) => (byType.get(t)?.length ?? 0) > 0) ? (
            <div className="divide-y divide-border">{renderTypeTables(types)}</div>
          ) : (
            <div className="p-6">
              <EmptyState icon={<BookOpen className="h-5 w-5" />} title={`Belum ada akun ${meta.title}`} description="Tambah akun untuk mulai." />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Bagan Akun</h2>
          <p className="text-sm text-muted-foreground">
            {manageMode
              ? "Mode kelola: atur urutan COA (panah), tambah/hapus akun & grup. Akun terkunci tidak bisa dihapus."
              : manageable
                ? 'Neraca (kiri) & Laba Rugi (kanan). Gunakan tombol "Atur Bagan Akun" di atas untuk mengelola.'
                : "Neraca (kiri) & Laba Rugi (kanan). Kelola bagan akun melalui menu Pengaturan → Bagan Akun."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari kode / nama akun..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-full sm:w-64" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Tipe</SelectItem>
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {manageable && (
            <Button variant={manageMode ? "default" : "outline"} onClick={() => setManageMode(!manageMode)}>
              {manageMode ? <Check className="mr-2 h-4 w-4" /> : <Settings className="mr-2 h-4 w-4" />}
              {manageMode ? "Selesai" : "Atur Bagan Akun"}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState icon={<BookOpen className="h-5 w-5" />} title="Belum ada akun" description="Tambah akun atau jalankan seed untuk memulai." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {renderPanel("neraca")}
          {renderPanel("labarugi")}
        </div>
      )}

      <AccountForm
        key={editing ? editing.id : `new-${addType}-${formPreset.isGroup}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        isGroupPreset={formPreset.isGroup}
        defaultType={addType}
      />
      {deleting && !deleting.isSystem && <DeleteAccountDialog account={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}