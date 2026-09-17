"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet,
  Plus,
  Search,
  Landmark,
  Banknote,
  Eye,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Coins,
  Building2,
  Hash,
  User,
  MapPin,
  TrendingUp,
  TrendingDown,
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
import { LoadingState, EmptyState, Money } from "@/components/ui-helpers";
import { formatDate } from "@/lib/accounting";
import { useSettingsStore, previewCode } from "@/lib/settings-store";
import { authFetch } from "@/components/auth-provider";

// ---------- Types ----------
type BankAccountType = "CASH" | "BANK";

type BankAccount = {
  id: string;
  code: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  branch: string | null;
  type: BankAccountType;
  currency: string;
  accountCode: string;
  isActive: boolean;
  openingBalance: number;
  description: string | null;
  balance: number;
};

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  isGroup: boolean;
  isActive: boolean;
};

type Transaction = {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  reference: string | null;
  source: string;
  debit: number;
  credit: number;
  balance: number;
};

type TransactionsResponse = {
  bankAccount: BankAccount;
  transactions: Transaction[];
  balance: number;
};

// ---------- Helpers ----------
const TYPE_LABELS: Record<BankAccountType, string> = {
  CASH: "Kas",
  BANK: "Bank",
};

function BankTypeBadge({ type }: { type: BankAccountType }) {
  if (type === "CASH") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-transparent bg-emerald-100 text-emerald-700 text-xs dark:bg-emerald-950 dark:text-emerald-300"
      >
        <Banknote className="h-3 w-3" />
        Kas
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-transparent bg-sky-100 text-sky-700 text-xs dark:bg-sky-950 dark:text-sky-300"
    >
      <Landmark className="h-3 w-3" />
      Bank
    </Badge>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge
      variant="outline"
      className="gap-1 border-transparent bg-emerald-100 text-emerald-700 text-xs dark:bg-emerald-950 dark:text-emerald-300"
    >
      <CheckCircle2 className="h-3 w-3" />
      Aktif
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1 border-transparent bg-muted text-muted-foreground text-xs"
    >
      <XCircle className="h-3 w-3" />
      Nonaktif
    </Badge>
  );
}

// ---------- Account Select ----------
function useAccounts() {
  return useQuery<{ accounts: Account[] }>({
    queryKey: ["accounts", "no-balances"],
    queryFn: async () => {
      const res = await authFetch("/api/accounts?balances=false");
      if (!res.ok) throw new Error("Gagal memuat akun");
      return res.json();
    },
    staleTime: 60_000,
  });
}

function AccountSelect({
  value,
  onValueChange,
  accounts,
  placeholder = "Pilih akun CoA",
}: {
  value: string;
  onValueChange: (v: string) => void;
  accounts?: Account[];
  placeholder?: string;
}) {
  // Only leaf asset accounts (not groups) — primarily Cash/Bank subtypes
  const eligible = (accounts ?? []).filter((a) => !a.isGroup && a.type === "ASSET");
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {eligible.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Tidak ada akun aset tersedia.
          </div>
        ) : (
          eligible.map((a) => (
            <SelectItem key={a.id} value={a.code}>
              <span className="font-mono text-xs">{a.code}</span> — {a.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

// ---------- Create Dialog ----------
function CreateBankAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);
  const { data: accountsData } = useAccounts();
  const accounts = accountsData?.accounts ?? [];

  const [code, setCode] = React.useState("");
  const [codeEdited, setCodeEdited] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<BankAccountType>("BANK");
  const [bankName, setBankName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [accountHolder, setAccountHolder] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [currency, setCurrency] = React.useState("IDR");
  const [accountCode, setAccountCode] = React.useState("");
  const [openingBalance, setOpeningBalance] = React.useState("");
  const [description, setDescription] = React.useState("");

  const reset = () => {
    setCode("");
    setCodeEdited(false);
    setName("");
    setType("BANK");
    setBankName("");
    setAccountNumber("");
    setAccountHolder("");
    setBranch("");
    setCurrency("IDR");
    setAccountCode("");
    setOpeningBalance("");
    setDescription("");
  };

  // Tampilkan preview nomor berikutnya; server tetap sumber penomoran (auto-increment)
  const effectiveCode = codeEdited ? code : previewCode(company, "bankAccount");

  // Prefill kode akun otomatis sesuai Pengaturan Perusahaan
  React.useEffect(() => {
    if (!open) return;
    void fetchCompany();
    setCode("");
    setCodeEdited(false);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeEdited ? code.trim() : "",
          name: name.trim(),
          type,
          bankName: bankName.trim() || undefined,
          accountNumber: accountNumber.trim() || undefined,
          accountHolder: accountHolder.trim() || undefined,
          branch: branch.trim() || undefined,
          currency: currency.trim() || "IDR",
          accountCode: accountCode.trim(),
          openingBalance: Number(openingBalance) || 0,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal membuat akun bank");
      return data;
    },
    onSuccess: (data: { bankAccount?: { code?: string } }) => {
      toast.success("Akun bank/kas berhasil dibuat", {
        description: `${name} (${data?.bankAccount?.code ?? effectiveCode}) ditambahkan.`,
      });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      void fetchCompany();
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal membuat akun bank", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!name.trim() || !accountCode.trim()) {
      toast.error("Nama dan akun CoA wajib diisi");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Akun Kas/Bank</DialogTitle>
          <DialogDescription>
            Buka akun kas atau rekening bank baru. Saldo akun dijaga otomatis
            melalui jurnal akuntansi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ba-code">
                Kode
              </Label>
              <Input
                id="ba-code"
                placeholder="BA-001 (otomatis)"
                value={effectiveCode}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeEdited(true);
                }}
                className="uppercase"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ba-name">
                Nama <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ba-name"
                placeholder="Rekening Operasional BCA"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ba-type">Tipe</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as BankAccountType)}
              >
                <SelectTrigger id="ba-type" className="w-full">
                  <SelectValue placeholder="Pilih tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="CASH">Kas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ba-currency">Mata Uang</Label>
              <Input
                id="ba-currency"
                placeholder="IDR"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="uppercase"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ba-account-code">
              Akun CoA <span className="text-destructive">*</span>
            </Label>
            <AccountSelect
              value={accountCode}
              onValueChange={setAccountCode}
              accounts={accounts}
              placeholder="Pilih akun aset (Kas/Bank)"
            />
            <p className="text-xs text-muted-foreground">
              Saldo akun bank akan ditautkan ke akun CoA ini.
            </p>
          </div>

          {type === "BANK" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ba-bank-name">Nama Bank</Label>
                <Input
                  id="ba-bank-name"
                  placeholder="BCA / Mandiri / BRI"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-account-number">Nomor Rekening</Label>
                <Input
                  id="ba-account-number"
                  placeholder="1234567890"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-account-holder">Pemegang Rekening</Label>
                <Input
                  id="ba-account-holder"
                  placeholder="PT Sumber Rezeki"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ba-branch">Cabang</Label>
                <Input
                  id="ba-branch"
                  placeholder="Jakarta Pusat"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="ba-opening">Saldo Awal</Label>
            <Input
              id="ba-opening"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Saldo awal &gt; 0 akan membuat jurnal saldo awal otomatis.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ba-desc">Keterangan</Label>
            <Textarea
              id="ba-desc"
              placeholder="Catatan tambahan (opsional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
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
            {mutation.isPending ? "Menyimpan..." : "Simpan Akun"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit Dialog ----------
function EditBankAccountDialog({
  bankAccount,
  onOpenChange,
}: {
  bankAccount: BankAccount;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();

  const [name, setName] = React.useState(bankAccount.name ?? "");
  const [type, setType] = React.useState<BankAccountType>(bankAccount.type);
  const [bankName, setBankName] = React.useState(bankAccount.bankName ?? "");
  const [accountNumber, setAccountNumber] = React.useState(bankAccount.accountNumber ?? "");
  const [accountHolder, setAccountHolder] = React.useState(bankAccount.accountHolder ?? "");
  const [branch, setBranch] = React.useState(bankAccount.branch ?? "");
  const [currency, setCurrency] = React.useState(bankAccount.currency ?? "IDR");
  const [description, setDescription] = React.useState(bankAccount.description ?? "");
  const [isActive, setIsActive] = React.useState(bankAccount.isActive);
  const [openingBalance, setOpeningBalance] = React.useState(
    String(bankAccount.openingBalance || "")
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/bank-accounts/${bankAccount!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          currency: currency.trim() || "IDR",
          description: description.trim() || null,
          isActive,
          openingBalance: Number(openingBalance) || 0,
          bankName: bankName.trim() || null,
          accountNumber: accountNumber.trim() || null,
          accountHolder: accountHolder.trim() || null,
          branch: branch.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal mengubah akun bank");
      return data;
    },
    onSuccess: () => {
      toast.success("Akun kas/bank berhasil diubah", {
        description: `${name} (${bankAccount?.code}) diperbarui.`,
      });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal mengubah akun bank", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!name.trim()) {
      toast.error("Nama wajib diisi");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Akun Kas/Bank</DialogTitle>
          <DialogDescription>
            Ubah data akun dan saldo awal. Kode dan akun CoA tidak dapat diubah
            karena terkait jurnal akuntansi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <span>
              Kode: <span className="font-mono font-medium">{bankAccount?.code}</span>
            </span>
            <span className="opacity-50">•</span>
            <span>
              Akun CoA:{" "}
              <span className="font-mono font-medium">{bankAccount?.accountCode}</span>
            </span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="eb-name">Nama *</Label>
            <Input
              id="eb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Tipe</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as BankAccountType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="CASH">Kas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eb-currency">Mata Uang</Label>
              <Input
                id="eb-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="uppercase"
              />
            </div>
          </div>

          {type === "BANK" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="eb-bank-name">Nama Bank</Label>
                <Input
                  id="eb-bank-name"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eb-account-number">Nomor Rekening</Label>
                <Input
                  id="eb-account-number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eb-account-holder">Pemegang Rekening</Label>
                <Input
                  id="eb-account-holder"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eb-branch">Cabang</Label>
                <Input
                  id="eb-branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="eb-opening">Saldo Awal</Label>
            <Input
              id="eb-opening"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Mengubah saldo awal akan menyesuaikan jurnal saldo awal otomatis.
              Hanya boleh diubah selama rekening belum punya transaksi lain.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="eb-desc">Keterangan</Label>
            <Textarea
              id="eb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-emerald-600"
            />
            <span className="text-sm">Akun aktif</span>
          </label>
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
            {mutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Delete Dialog ----------
function DeleteBankAccountDialog({
  bankAccount,
  onOpenChange,
}: {
  bankAccount: BankAccount;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/bank-accounts/${bankAccount!.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Gagal menghapus akun bank");
      return data;
    },
    onSuccess: () => {
      toast.success("Akun kas/bank dihapus", {
        description: `${bankAccount?.name} (${bankAccount?.code}) dihapus.`,
      });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal menghapus akun", { description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hapus Akun Kas/Bank?</DialogTitle>
          <DialogDescription>
            Akun{" "}
            <span className="font-medium text-foreground">
              {bankAccount?.name} ({bankAccount?.code})
            </span>{" "}
            akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            {bankAccount?.balance ? (
              <> Akun ini masih memiliki saldo tercatat.</>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Menghapus..." : "Hapus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Transactions Dialog ----------
function TransactionsDialog({
  bankAccount,
  open,
  onOpenChange,
}: {
  bankAccount: BankAccount | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useQuery<TransactionsResponse>({
    queryKey: ["bank-account-transactions", bankAccount?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/bank-accounts/${bankAccount!.id}/transactions`
      );
      if (!res.ok) throw new Error("Gagal memuat transaksi");
      return res.json();
    },
    enabled: !!bankAccount && open,
  });

  const transactions = data?.transactions ?? [];
  const balance = data?.balance ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Riwayat Transaksi
          </DialogTitle>
          <DialogDescription>
            {bankAccount ? (
              <span>
                <span className="font-mono text-xs">{bankAccount.code}</span>{" "}
                — {bankAccount.name} •{" "}
                {bankAccount.bankName || TYPE_LABELS[bankAccount.type]}
                {bankAccount.accountNumber
                  ? ` • ${bankAccount.accountNumber}`
                  : ""}
              </span>
            ) : (
              "Memuat..."
            )}
          </DialogDescription>
        </DialogHeader>

        {bankAccount && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Saldo Awal
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                <Money value={bankAccount.openingBalance} />
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Saldo Saat Ini
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                <Money value={balance} />
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total Transaksi
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {transactions.length} entri
              </p>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border">
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4">
                <LoadingState rows={5} />
              </div>
            ) : transactions.length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-5 w-5" />}
                title="Belum ada transaksi"
                description="Transaksi yang menggunakan akun ini akan muncul di sini."
              />
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="pl-4 text-xs">Tanggal</TableHead>
                    <TableHead className="text-xs">Deskripsi</TableHead>
                    <TableHead className="text-xs">No. Jurnal</TableHead>
                    <TableHead className="text-right text-xs">Debit</TableHead>
                    <TableHead className="text-right text-xs">Kredit</TableHead>
                    <TableHead className="pr-4 text-right text-xs">
                      Saldo
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(t.date)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col">
                          <span className="font-medium">{t.description}</span>
                          {t.reference && (
                            <span className="text-muted-foreground">
                              Ref: {t.reference}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.entryNumber}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {t.debit > 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <TrendingUp className="h-3 w-3" />
                            <Money value={t.debit} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {t.credit > 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                            <TrendingDown className="h-3 w-3" />
                            <Money value={t.credit} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right text-xs font-semibold tabular-nums">
                        <Money value={t.balance} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Stats ----------
function BankStats({ accounts }: { accounts: BankAccount[] }) {
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const bankCount = accounts.filter((a) => a.type === "BANK").length;
  const cashCount = accounts.filter((a) => a.type === "CASH").length;
  const activeCount = accounts.filter((a) => a.isActive).length;

  const stats = [
    {
      label: "Total Saldo Semua Akun",
      value: <Money value={totalBalance} className="text-xl font-bold" />,
      icon: Coins,
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      label: "Akun Bank",
      value: (
        <span className="text-xl font-bold tabular-nums">{bankCount}</span>
      ),
      icon: Landmark,
      accent: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
    },
    {
      label: "Akun Kas",
      value: (
        <span className="text-xl font-bold tabular-nums">{cashCount}</span>
      ),
      icon: Banknote,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
    {
      label: "Akun Aktif",
      value: (
        <span className="text-xl font-bold tabular-nums">{activeCount}</span>
      ),
      icon: CheckCircle2,
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

// ---------- Main View ----------
export function BankAccountsView() {
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [txDialogAccount, setTxDialogAccount] =
    React.useState<BankAccount | null>(null);
  const [editDialogAccount, setEditDialogAccount] =
    React.useState<BankAccount | null>(null);
  const [deleteDialogAccount, setDeleteDialogAccount] =
    React.useState<BankAccount | null>(null);

  const { data, isLoading } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal memuat akun bank");
      return res.json();
    },
  });

  const accounts = data?.bankAccounts ?? [];

  const filtered = React.useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.bankName ?? "").toLowerCase().includes(q) ||
        (a.accountNumber ?? "").toLowerCase().includes(q) ||
        a.accountCode.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Kas &amp; Bank</h2>
          <p className="text-sm text-muted-foreground">
            Kelola akun kas dan rekening bank. Saldo dihitung otomatis dari
            jurnal akuntansi.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="sm:w-auto w-full"
        >
          <Plus className="h-4 w-4" />
          Tambah Akun
        </Button>
      </div>

      <CreateBankAccountDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editDialogAccount && (
        <EditBankAccountDialog
          key={editDialogAccount.id}
          bankAccount={editDialogAccount}
          onOpenChange={(v) => !v && setEditDialogAccount(null)}
        />
      )}
      {deleteDialogAccount && (
        <DeleteBankAccountDialog
          key={deleteDialogAccount.id}
          bankAccount={deleteDialogAccount}
          onOpenChange={(v) => !v && setDeleteDialogAccount(null)}
        />
      )}
      <TransactionsDialog
        bankAccount={txDialogAccount}
        open={!!txDialogAccount}
        onOpenChange={(v) => !v && setTxDialogAccount(null)}
      />

      {/* Stats */}
      {!isLoading && accounts.length > 0 && (
        <BankStats accounts={accounts} />
      )}

      {/* Main card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Daftar Akun Kas/Bank</CardTitle>
              <CardDescription>
                {filtered.length} dari {accounts.length} akun
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari nama / kode / bank..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState rows={5} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title={
                accounts.length === 0
                  ? "Belum ada akun kas/bank"
                  : "Tidak ada hasil"
              }
              description={
                accounts.length === 0
                  ? "Tambahkan akun kas atau rekening bank pertama untuk mulai mencatat transaksi."
                  : "Coba ubah kata kunci pencarian."
              }
              action={
                accounts.length === 0 ? (
                  <Button onClick={() => setCreateOpen(true)} size="sm">
                    <Plus className="h-4 w-4" />
                    Tambah Akun
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Bank / No. Rekening</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Akun CoA</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="pr-6 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-6 font-mono text-xs font-medium">
                        {a.code}
                      </TableCell>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        {a.type === "BANK" ? (
                          <div className="flex flex-col gap-0.5 text-xs">
                            {a.bankName ? (
                              <span className="flex items-center gap-1.5 font-medium">
                                <Building2 className="h-3 w-3 text-muted-foreground" />
                                {a.bankName}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                            {a.accountNumber && (
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Hash className="h-3 w-3" />
                                {a.accountNumber}
                              </span>
                            )}
                            {a.accountHolder && (
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <User className="h-3 w-3" />
                                {a.accountHolder}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {a.description || "Akun kas tunai"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BankTypeBadge type={a.type} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {a.accountCode}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money
                          value={a.balance}
                          className="font-semibold text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge active={a.isActive} />
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            onClick={() => setTxDialogAccount(a)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Transaksi
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Edit akun"
                            onClick={() => setEditDialogAccount(a)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Hapus akun"
                            onClick={() => setDeleteDialogAccount(a)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
