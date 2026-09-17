"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRole } from "@/components/auth-provider";
import {
  Users,
  Plus,
  Search,
  UserCircle2,
  Briefcase,
  Building2,
  Mail,
  Phone,
  MapPin,
  BadgeCheck,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
  Wallet,
  Calculator,
  Banknote,
  Receipt,
  PlusCircle,
  Info,
  Loader2,
  HandCoins,
  Upload,
  Paperclip,
  X,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LoadingState, EmptyState, Money } from "@/components/ui-helpers";
import { formatDate } from "@/lib/accounting";
import { authFetch } from "@/components/auth-provider";
import { useSettingsStore, previewCode } from "@/lib/settings-store";

// ---------- Types ----------
type EmployeeStatus = "ACTIVE" | "RESIGNED" | "ON_LEAVE";

type Employee = {
  id: string;
  code: string;
  name: string;
  position: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  joinDate: string | null;
  status: EmployeeStatus;
  basicSalary: number;
  allowance: number;
  bpjsRate: number;
  taxRate: number;
  bankAccountId: string | null;
  notes: string | null;
  _count: { payroll: number };
};

type PayrollEntry = {
  id: string;
  number: string;
  employeeId: string;
  employee: {
    code: string;
    name: string;
    position: string | null;
  };
  payPeriod: string;
  payDate: string;
  basicSalary: number;
  allowance: number;
  grossPay: number;
  taxDeduction: number;
  bpjsDeduction: number;
  otherDeduction: number;
  totalDeduction: number;
  netPay: number;
  status: string;
  journalEntryId: string | null;
};

type StatusFilter = "ALL" | "ACTIVE" | "RESIGNED" | "ON_LEAVE";

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

// ---------- Helpers ----------
const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Aktif",
  RESIGNED: "Resign",
  ON_LEAVE: "Cuti",
};

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const map: Record<
    EmployeeStatus,
    { className: string; icon: React.ElementType }
  > = {
    ACTIVE: {
      className:
        "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      icon: CheckCircle2,
    },
    RESIGNED: {
      className:
        "border-transparent bg-muted text-muted-foreground dark:bg-muted/50",
      icon: XCircle,
    },
    ON_LEAVE: {
      className:
        "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      icon: Clock,
    },
  };
  const conf = map[status];
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", conf.className)}>
      <Icon className="h-3 w-3" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PayrollStatusBadge({ status }: { status: string }) {
  if (status === "PAID") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-transparent bg-emerald-100 text-emerald-700 text-xs dark:bg-emerald-950 dark:text-emerald-300"
      >
        <CheckCircle2 className="h-3 w-3" />
        Dibayar
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-transparent bg-amber-100 text-amber-700 text-xs dark:bg-amber-950 dark:text-amber-300"
    >
      <Clock className="h-3 w-3" />
      Draft
    </Badge>
  );
}

// ---------- Empty Employee Form State ----------
const EMPTY_FORM = {
  code: "",
  name: "",
  position: "",
  department: "",
  email: "",
  phone: "",
  address: "",
  taxId: "",
  joinDate: "",
  status: "ACTIVE" as EmployeeStatus,
  basicSalary: "",
  allowance: "",
  bpjsRate: "",
  taxRate: "",
  notes: "",
};

// ---------- Employee Form Dialog (Create / Edit) ----------
function EmployeeFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Employee | null;
}) {
  const qc = useQueryClient();
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);
  const [form, setForm] = React.useState({ ...EMPTY_FORM });
  const [codeEdited, setCodeEdited] = React.useState(false);

  React.useEffect(() => {
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        position: editing.position ?? "",
        department: editing.department ?? "",
        email: editing.email ?? "",
        phone: editing.phone ?? "",
        address: editing.address ?? "",
        taxId: editing.taxId ?? "",
        joinDate: editing.joinDate
          ? new Date(editing.joinDate).toISOString().slice(0, 10)
          : "",
        status: editing.status,
        basicSalary: String(editing.basicSalary || ""),
        allowance: String(editing.allowance || ""),
        bpjsRate: String(editing.bpjsRate || ""),
        taxRate: String(editing.taxRate || ""),
        notes: editing.notes ?? "",
      });
      setCodeEdited(false);
    } else {
      // Ambil settings terbaru agar preview nomor berikutnya akurat
      void fetchCompany();
      setForm({ ...EMPTY_FORM });
      setCodeEdited(false);
    }
  }, [editing, open]);

  // Preview nomor berikutnya dari settings (server tetap sumber penomoran auto-increment)
  const effectiveCode = editing
    ? form.code
    : codeEdited
      ? form.code
      : (previewCode(company, "employee") || "");

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: editing ? form.code.trim() : codeEdited ? form.code.trim() : "",
        name: form.name.trim(),
        position: form.position.trim() || undefined,
        department: form.department.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        taxId: form.taxId.trim() || undefined,
        joinDate: form.joinDate || undefined,
        status: form.status,
        basicSalary: Number(form.basicSalary) || 0,
        allowance: Number(form.allowance) || 0,
        bpjsRate: Number(form.bpjsRate) || 0,
        taxRate: Number(form.taxRate) || 0,
        notes: form.notes.trim() || undefined,
      };
      const url = editing
        ? `/api/employees/${editing.id}`
        : "/api/employees";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan pegawai");
      return data;
    },
    onSuccess: (data: { employee?: { code?: string } }) => {
      toast.success(
        editing ? "Pegawai diperbarui" : "Pegawai berhasil ditambahkan",
        { description: `${form.name} (${data?.employee?.code ?? effectiveCode})` }
      );
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      void fetchCompany();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal menyimpan pegawai", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Nama pegawai wajib diisi");
      return;
    }
    mutation.mutate();
  };

  // Live preview payroll
  const basic = Number(form.basicSalary) || 0;
  const allowance = Number(form.allowance) || 0;
  const gross = basic + allowance;
  const taxRate = Number(form.taxRate) || 0;
  const bpjsRate = Number(form.bpjsRate) || 0;
  const tax = gross * (taxRate / 100);
  const bpjs = gross * (bpjsRate / 100);
  const net = gross - tax - bpjs;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Pegawai" : "Tambah Pegawai Baru"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Perbarui data dan komponen gaji pegawai."
              : "Lengkapi data pegawai dan komponen gaji untuk penggajian otomatis."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-code">
                Kode
              </Label>
              <Input
                id="emp-code"
                placeholder="EMP-001 (otomatis)"
                value={effectiveCode}
                onChange={(e) => {
                  update("code", e.target.value);
                  setCodeEdited(true);
                }}
                className="uppercase"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-name">
                Nama <span className="text-destructive">*</span>
              </Label>
              <Input
                id="emp-name"
                placeholder="Budi Santoso"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-position">Jabatan</Label>
              <Input
                id="emp-position"
                placeholder="Staff Accounting"
                value={form.position}
                onChange={(e) => update("position", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-dept">Departemen</Label>
              <Input
                id="emp-dept"
                placeholder="Keuangan"
                value={form.department}
                onChange={(e) => update("department", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-email">Email</Label>
              <Input
                id="emp-email"
                type="email"
                placeholder="budi@perusahaan.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-phone">Telepon</Label>
              <Input
                id="emp-phone"
                placeholder="0812xxxx"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-tax">NPWP</Label>
              <Input
                id="emp-tax"
                placeholder="00.000.000.0-000.000"
                value={form.taxId}
                onChange={(e) => update("taxId", e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emp-join">Tanggal Masuk</Label>
              <Input
                id="emp-join"
                type="date"
                value={form.joinDate}
                onChange={(e) => update("joinDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="emp-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v as EmployeeStatus)}
              >
                <SelectTrigger id="emp-status" className="w-full">
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="ON_LEAVE">Cuti</SelectItem>
                  <SelectItem value="RESIGNED">Resign</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="emp-address">Alamat</Label>
            <Textarea
              id="emp-address"
              placeholder="Jl. Merdeka No. 1, Jakarta"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              rows={2}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h4 className="text-sm font-semibold">Komponen Gaji</h4>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="emp-basic">Gaji Pokok (Rp)</Label>
                <Input
                  id="emp-basic"
                  type="number"
                  inputMode="decimal"
                  placeholder="5000000"
                  value={form.basicSalary}
                  onChange={(e) => update("basicSalary", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-allow">Tunjangan (Rp)</Label>
                <Input
                  id="emp-allow"
                  type="number"
                  inputMode="decimal"
                  placeholder="1000000"
                  value={form.allowance}
                  onChange={(e) => update("allowance", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-bpjs">Potongan BPJS (%)</Label>
                <Input
                  id="emp-bpjs"
                  type="number"
                  inputMode="decimal"
                  placeholder="3"
                  value={form.bpjsRate}
                  onChange={(e) => update("bpjsRate", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-tax-rate">Potongan PPh21 (%)</Label>
                <Input
                  id="emp-tax-rate"
                  type="number"
                  inputMode="decimal"
                  placeholder="5"
                  value={form.taxRate}
                  onChange={(e) => update("taxRate", e.target.value)}
                />
              </div>
            </div>

            {gross > 0 && (
              <div className="mt-3 grid gap-2 rounded-md bg-card p-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Gaji Kotor</p>
                  <p className="font-semibold tabular-nums">
                    <Money value={gross} />
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pajak ({taxRate}%)</p>
                  <p className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    <Money value={tax} />
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">BPJS ({bpjsRate}%)</p>
                  <p className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    <Money value={bpjs} />
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Take Home</p>
                  <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    <Money value={net} />
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="emp-notes">Catatan</Label>
            <Textarea
              id="emp-notes"
              placeholder="Catatan tambahan (opsional)"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
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
            {mutation.isPending
              ? "Menyimpan..."
              : editing
                ? "Simpan Perubahan"
                : "Simpan Pegawai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Payroll Run Dialog ----------
function PayrollRunDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: empData, isLoading: empLoading } = useQuery<{
    employees: Employee[];
  }>({
    queryKey: ["employees", "ALL"],
    queryFn: async () => {
      const res = await authFetch("/api/employees?status=ALL");
      if (!res.ok) throw new Error("Gagal memuat pegawai");
      return res.json();
    },
    enabled: open,
  });

  const employees = (empData?.employees ?? []).filter(
    (e) => e.status === "ACTIVE"
  );

  const [employeeId, setEmployeeId] = React.useState("");
  const [payPeriod, setPayPeriod] = React.useState("");
  const [payDate, setPayDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [otherDeduction, setOtherDeduction] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState("");

  const { data: banksData } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal memuat akun bank");
      return res.json();
    },
    enabled: open,
  });

  const selected = employees.find((e) => e.id === employeeId) || null;

  // Auto-pilih akun bank default pegawai saat pegawai dipilih (transfer gaji)
  const selectEmployee = (v: string) => {
    setEmployeeId(v);
    const e = employees.find((x) => x.id === v);
    setBankAccountId(e?.bankAccountId || "");
  };

  React.useEffect(() => {
    if (!open) {
      setEmployeeId("");
      setPayPeriod("");
      setPayDate(new Date().toISOString().slice(0, 10));
      setOtherDeduction("");
      setBankAccountId("");
    }
  }, [open]);

  const basic = selected?.basicSalary ?? 0;
  const allowance = selected?.allowance ?? 0;
  const gross = basic + allowance;
  const taxRate = selected?.taxRate ?? 0;
  const bpjsRate = selected?.bpjsRate ?? 0;
  const tax = gross * (taxRate / 100);
  const bpjs = gross * (bpjsRate / 100);
  const other = Number(otherDeduction) || 0;
  const net = gross - tax - bpjs - other;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          payPeriod,
          payDate,
          otherDeduction: other,
          bankAccountId: bankAccountId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal mencatat penggajian");
      return data;
    },
    onSuccess: () => {
      toast.success("Penggajian berhasil dicatat", {
        description: selected
          ? `${selected.name} — take home ${new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              maximumFractionDigits: 0,
            }).format(net)}`
          : undefined,
      });
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal mencatat penggajian", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!employeeId || !payPeriod || !payDate) {
      toast.error("Pegawai, periode, dan tanggal bayar wajib diisi");
      return;
    }
    if (net > 0 && !bankAccountId) {
      toast.error("Pilih akun kas/bank untuk transfer gaji (uang keluar harus tampil di Pembayaran)");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bayar Gaji</DialogTitle>
          <DialogDescription>
            Pilih pegawai aktif. Sistem otomatis membuat jurnal: Debit Beban
            Gaji, Kredit Kas/Bank, Kredit Hutang Pajak.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="pay-emp">Pegawai</Label>
            <Select
              value={employeeId}
              onValueChange={selectEmployee}
              disabled={empLoading}
            >
              <SelectTrigger id="pay-emp" className="w-full">
                <SelectValue
                  placeholder={
                    empLoading ? "Memuat..." : "Pilih pegawai aktif"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {employees.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Belum ada pegawai aktif.
                  </div>
                ) : (
                  employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="font-mono text-xs">{e.code}</span> —{" "}
                      {e.name}
                      {e.position ? ` (${e.position})` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pay-period">Periode (Bulan)</Label>
              <Input
                id="pay-period"
                type="month"
                value={payPeriod}
                onChange={(e) => setPayPeriod(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-date">Tanggal Bayar</Label>
              <Input
                id="pay-date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pay-other">Potongan Lainnya (Rp)</Label>
            <Input
              id="pay-other"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={otherDeduction}
              onChange={(e) => setOtherDeduction(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pay-bank">Bayar dari Akun Kas/Bank {net > 0 && <span className="text-destructive">*</span>}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger id="pay-bank"><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
              <SelectContent>
                {(banksData?.bankAccounts ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Transfer gaji tercatat otomatis di view Pembayaran (wajib diisi).
            </p>
          </div>

          {selected && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-sm font-semibold">Rincian Penggajian</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gaji Pokok</span>
                  <Money value={basic} className="font-medium" />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tunjangan</span>
                  <Money value={allowance} className="font-medium" />
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Gaji Kotor</span>
                  <Money value={gross} className="font-semibold" />
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span className="text-muted-foreground">
                    Pajak PPh21 ({taxRate}%)
                  </span>
                  <Money value={tax} className="font-medium" />
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span className="text-muted-foreground">
                    BPJS ({bpjsRate}%)
                  </span>
                  <Money value={bpjs} className="font-medium" />
                </div>
                {other > 0 && (
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span className="text-muted-foreground">
                      Potongan Lainnya
                    </span>
                    <Money value={other} className="font-medium" />
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-base">
                  <span className="font-semibold">Diterima Pegawai</span>
                  <Money
                    value={net}
                    className="font-bold text-emerald-600 dark:text-emerald-400"
                  />
                </div>
              </div>
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
          <Button
            onClick={onSubmit}
            disabled={mutation.isPending || !selected}
          >
            {mutation.isPending ? "Memproses..." : "Catat Penggajian"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Stats ----------
function EmployeeStats({ employees }: { employees: Employee[] }) {
  const active = employees.filter((e) => e.status === "ACTIVE").length;
  const onLeave = employees.filter(
    (e) => e.status === "ON_LEAVE" || e.status === "RESIGNED"
  ).length;
  const totalSalary = employees
    .filter((e) => e.status === "ACTIVE")
    .reduce((s, e) => s + e.basicSalary + e.allowance, 0);

  const stats = [
    {
      label: "Total Pegawai",
      value: (
        <span className="text-xl font-bold tabular-nums">
          {employees.length}
        </span>
      ),
      icon: Users,
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      label: "Aktif",
      value: (
        <span className="text-xl font-bold tabular-nums">{active}</span>
      ),
      icon: CheckCircle2,
      accent: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
    },
    {
      label: "Cuti / Resign",
      value: (
        <span className="text-xl font-bold tabular-nums">{onLeave}</span>
      ),
      icon: Clock,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
    {
      label: "Total Gaji / Bulan",
      value: <Money value={totalSalary} className="text-xl font-bold" />,
      icon: Wallet,
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

// ---------- Delete Confirmation ----------
function DeleteEmployeeDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/employees/${employee!.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menghapus pegawai");
      return data;
    },
    onSuccess: () => {
      toast.success("Pegawai dihapus", {
        description: `${employee?.name} (${employee?.code})`,
      });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal menghapus pegawai", { description: err.message });
      onOpenChange(false);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus pegawai ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Tindakan ini tidak dapat dibatalkan. Pegawai{" "}
            <span className="font-medium text-foreground">
              {employee?.name}
            </span>{" "}
            (
            <span className="font-mono text-xs">{employee?.code}</span>) akan
            dihapus permanen. Pegawai dengan riwayat penggajian tidak dapat
            dihapus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {mutation.isPending ? "Menghapus..." : "Hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Employee List Tab ----------
function EmployeeListTab({
  employees,
  isLoading,
}: {
  employees: Employee[];
  isLoading: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [deptFilter, setDeptFilter] = React.useState("ALL");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Employee | null>(
    null
  );

  const departments = React.useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set).sort();
  }, [employees]);

  const filtered = React.useMemo(() => {
    let list = employees;
    if (statusFilter !== "ALL")
      list = list.filter((e) => e.status === statusFilter);
    if (deptFilter !== "ALL")
      list = list.filter((e) => e.department === deptFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.code.toLowerCase().includes(q) ||
          (e.position ?? "").toLowerCase().includes(q) ||
          (e.department ?? "").toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [employees, statusFilter, deptFilter, search]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setFormOpen(true);
  };

  return (
    <>
      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
      <DeleteEmployeeDialog
        employee={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Daftar Pegawai</CardTitle>
              <CardDescription>
                {filtered.length} dari {employees.length} pegawai
              </CardDescription>
            </div>
            <Button onClick={openCreate} className="sm:w-auto w-full">
              <Plus className="h-4 w-4" />
              Tambah Pegawai
            </Button>
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nama / kode / jabatan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="ON_LEAVE">Cuti</SelectItem>
                  <SelectItem value="RESIGNED">Resign</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="Departemen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Departemen</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              icon={<Users className="h-5 w-5" />}
              title={
                employees.length === 0
                  ? "Belum ada pegawai"
                  : "Tidak ada hasil"
              }
              description={
                employees.length === 0
                  ? "Tambahkan pegawai pertama untuk mulai mencatat penggajian."
                  : "Coba ubah filter atau kata kunci pencarian."
              }
              action={
                employees.length === 0 ? (
                  <Button onClick={openCreate} size="sm">
                    <Plus className="h-4 w-4" />
                    Tambah Pegawai
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
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Departemen</TableHead>
                    <TableHead className="text-right">Gaji Pokok</TableHead>
                    <TableHead className="text-right">Tunjangan</TableHead>
                    <TableHead className="text-right">Gaji Kotor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="pr-6 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => {
                    const gross = e.basicSalary + e.allowance;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="pl-6 font-mono text-xs font-medium">
                          {e.code}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{e.name}</span>
                            {e.email && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {e.email}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.position || (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.department ? (
                            <Badge
                              variant="outline"
                              className="border-transparent bg-muted text-xs text-muted-foreground"
                            >
                              <Building2 className="h-3 w-3" />
                              {e.department}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={e.basicSalary} className="text-xs" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={e.allowance} className="text-xs" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money
                            value={gross}
                            className="text-xs font-semibold"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={e.status} />
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                              >
                                <span className="sr-only">Buka menu</span>
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <circle cx="12" cy="5" r="1" />
                                  <circle cx="12" cy="12" r="1" />
                                  <circle cx="12" cy="19" r="1" />
                                </svg>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(e)}>
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-rose-600 dark:text-rose-400"
                                onClick={() => setDeleteTarget(e)}
                                disabled={e._count.payroll > 0}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Hapus
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
    </>
  );
}

// ---------- Payroll History Tab ----------
function PayrollHistoryTab() {
  const { data, isLoading } = useQuery<{ payroll: PayrollEntry[] }>({
    queryKey: ["payroll"],
    queryFn: async () => {
      const res = await authFetch("/api/payroll?limit=50");
      if (!res.ok) throw new Error("Gagal memuat riwayat penggajian");
      return res.json();
    },
  });

  const [runOpen, setRunOpen] = React.useState(false);
  const payroll = data?.payroll ?? [];

  const totalNet = payroll.reduce((s, p) => s + p.netPay, 0);
  const totalGross = payroll.reduce((s, p) => s + p.grossPay, 0);
  const totalDeduction = payroll.reduce((s, p) => s + p.totalDeduction, 0);

  return (
    <>
      <PayrollRunDialog open={runOpen} onOpenChange={setRunOpen} />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Riwayat Penggajian</CardTitle>
              <CardDescription>
                {payroll.length} entri penggajian • Total dibayar{" "}
                <Money value={totalNet} className="font-semibold" />
              </CardDescription>
            </div>
            <Button onClick={() => setRunOpen(true)} className="sm:w-auto w-full">
              <Banknote className="h-4 w-4" />
              Bayar Gaji
            </Button>
          </div>

          {payroll.length > 0 && (
            <div className="grid gap-3 pt-2 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total Gaji Kotor
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  <Money value={totalGross} />
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total Potongan
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  <Money value={totalDeduction} />
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-500/5 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total Diterima
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  <Money value={totalNet} />
                </p>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState rows={5} />
            </div>
          ) : payroll.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title="Belum ada penggajian"
              description="Catat penggajian pertama Anda. Sistem akan otomatis membuat jurnal akuntansi."
              action={
                <Button onClick={() => setRunOpen(true)} size="sm">
                  <PlusCircle className="h-4 w-4" />
                  Bayar Gaji
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Nomor</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Tgl Bayar</TableHead>
                    <TableHead className="text-right">Gaji Kotor</TableHead>
                    <TableHead className="text-right">Potongan</TableHead>
                    <TableHead className="text-right">Diterima</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="pr-6 text-center">Jurnal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-6 font-mono text-xs font-medium">
                        {p.number}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{p.employee.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.employee.code}
                            {p.employee.position
                              ? ` • ${p.employee.position}`
                              : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.payPeriod).toLocaleDateString("id-ID", {
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(p.payDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={p.grossPay} className="text-xs" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money
                          value={p.totalDeduction}
                          className="text-xs text-rose-600 dark:text-rose-400"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money
                          value={p.netPay}
                          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <PayrollStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="pr-6 text-center">
                        {p.journalEntryId ? (
                          <BadgeCheck className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
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
// ---------- Leave Tab (Cuti / Izin / Sakit) ----------
type Leave = {
  id: string;
  employeeId: string;
  employee: { id: string; code: string; name: string; position: string | null; department: string | null };
  type: string;
  category: string | null;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  attachmentName: string | null;
  attachmentUrl: string | null;
  notes: string | null;
};

const LEAVE_TYPES = [
  { value: "CUTI", label: "Cuti", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CalendarDays },
  { value: "IZIN", label: "Izin", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Clock },
  { value: "SAKIT", label: "Sakit", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400", icon: Info },
];

// ---------- File upload helper ----------
type UploadResult = { url: string; name: string; size: number; type: string };

async function uploadFile(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authFetch("/api/upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Gagal mengupload file");
  return json;
}

function FileUploadField({
  label,
  current,
  onUploaded,
  hint,
}: {
  label: string;
  current: { name: string; url: string } | null;
  onUploaded: (att: { name: string; url: string } | null) => void;
  hint?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadFile(file);
      onUploaded({ name: up.name, url: up.url });
      toast.success("File terupload", { description: up.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {current ? "Ganti File" : "Pilih File"}
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
        {current ? (
          <>
            <a href={current.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-medium text-emerald-600 hover:underline">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{current.name}</span>
            </a>
            <Button variant="ghost" size="icon" type="button" className="h-7 w-7 text-destructive" onClick={() => onUploaded(null)} title="Hapus file">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{hint ?? "JPG, PNG, PDF maks. 10 MB"}</span>
        )}
      </div>
    </div>
  );
}

function LeaveTypeBadge({ type }: { type: string }) {
  const conf = LEAVE_TYPES.find((t) => t.value === type) ?? LEAVE_TYPES[0];
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", conf.cls)}>
      <Icon className="h-3 w-3" />
      {conf.label}
    </Badge>
  );
}

function AttachmentLink({ name, url }: { name: string | null; url: string | null }) {
  if (!name || !url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={name} className="inline-flex max-w-36 items-center gap-1 truncate text-xs font-medium text-emerald-600 hover:underline">
      <Paperclip className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </a>
  );
}

function LeaveStatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") {
    return <Badge variant="outline" className="gap-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Disetujui</Badge>;
  }
  if (status === "REJECTED") {
    return <Badge variant="outline" className="gap-1 border-transparent bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"><XCircle className="h-3 w-3" /> Ditolak</Badge>;
  }
  return <Badge variant="outline" className="gap-1 border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Clock className="h-3 w-3" /> Menunggu</Badge>;
}

function CreateLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = React.useState("");
  const [type, setType] = React.useState("CUTI");
  const [category, setCategory] = React.useState("");
  const [startDate, setStartDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = React.useState("");
  const [attachment, setAttachment] = React.useState<{ name: string; url: string } | null>(null);

  const { data: employeesData } = useQuery<{ employees: Employee[] }>({
    queryKey: ["employees", "leaves-form"],
    queryFn: async () => {
      const res = await authFetch("/api/employees?status=ALL");
      if (!res.ok) throw new Error("Gagal memuat pegawai");
      return res.json();
    },
  });

  const days = endDate && startDate
    ? Math.max(0, Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
    : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/employee-leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId, type,
          category: category.trim() || undefined,
          startDate, endDate,
          reason: reason.trim() || undefined,
          attachmentName: attachment?.name,
          attachmentUrl: attachment?.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal membuat cuti/izin");
      return data;
    },
    onSuccess: () => {
      toast.success("Cuti/izin diajukan", { description: "Menunggu persetujuan." });
      qc.invalidateQueries({ queryKey: ["employee-leaves"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!employeeId || !startDate || !endDate) {
      toast.error("Pegawai, tanggal mulai, dan tanggal selesai wajib diisi");
      return;
    }
    if (days <= 0) {
      toast.error("Tanggal selesai harus setelah tanggal mulai");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-600" /> Ajukan Cuti/Izin</DialogTitle>
          <DialogDescription>Catat permohonan cuti, izin, atau sakit pegawai.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Pegawai <span className="text-destructive">*</span></Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Pilih pegawai..." /></SelectTrigger>
              <SelectContent>
                {(employeesData?.employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Jenis</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Kategori</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={type === "CUTI" ? "mis. TAHUNAN / KHUSUS" : type === "SAKIT" ? "mis. RAWAT JALAN / OPNAME" : "mis. KEPERLUAN / KELUARGA"} className="uppercase" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Tanggal Mulai <span className="text-destructive">*</span></Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Tanggal Selesai <span className="text-destructive">*</span></Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {days > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              Durasi: <span className="font-semibold">{days} hari</span>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Alasan / Keterangan</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan cuti/izin..." />
          </div>
          <FileUploadField
            label="Dokumen Pendukung"
            current={attachment}
            onUploaded={setAttachment}
            hint={type === "SAKIT" ? "Surat keterangan dokter (PDF/JPG/PNG)" : "Surat izin / bukti pendukung"}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
            Ajukan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeavesTab({ employees }: { employees: Employee[] }) {
  const qc = useQueryClient();
  const { canApprove } = useRole();
  const [typeFilter, setTypeFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data, isLoading } = useQuery<{ leaves: Leave[] }>({
    queryKey: ["employee-leaves", typeFilter, statusFilter],
    queryFn: async () => {
      const res = await authFetch(`/api/employee-leaves?type=${typeFilter}&status=${statusFilter}`);
      if (!res.ok) throw new Error("Gagal memuat cuti/izin");
      return res.json();
    },
  });
  const leaves = data?.leaves ?? [];

  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await authFetch(`/api/employee-leaves/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal memperbarui");
      return json;
    },
    onSuccess: () => {
      toast.success("Status cuti/izin diperbarui");
      qc.invalidateQueries({ queryKey: ["employee-leaves"] });
      qc.invalidateQueries({ queryKey: ["employees", "ALL"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = {
    total: leaves.length,
    pending: leaves.filter((l) => l.status === "PENDING").length,
    cuti: leaves.filter((l) => l.type === "CUTI").reduce((s, l) => s + l.days, 0),
    sakit: leaves.filter((l) => l.type === "SAKIT").reduce((s, l) => s + l.days, 0),
  };

  return (
    <>
      <CreateLeaveDialog open={createOpen} onOpenChange={setCreateOpen} />
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Cuti, Izin & Sakit</CardTitle>
              <CardDescription>{stats.total} catatan · {stats.pending} menunggu persetujuan · {stats.cuti} hari cuti · {stats.sakit} hari sakit</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 hover:opacity-90">
              <Plus className="h-4 w-4" />
              Ajukan Cuti/Izin
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Jenis</SelectItem>
                <SelectItem value="CUTI">Cuti</SelectItem>
                <SelectItem value="IZIN">Izin</SelectItem>
                <SelectItem value="SAKIT">Sakit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="PENDING">Menunggu</SelectItem>
                <SelectItem value="APPROVED">Disetujui</SelectItem>
                <SelectItem value="REJECTED">Ditolak</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingState rows={4} /></div>
          ) : leaves.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Belum ada catatan cuti/izin" description="Ajukan cuti, izin, atau sakit pegawai pertama." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Pegawai</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead className="hidden md:table-cell">Rentang</TableHead>
                    <TableHead className="text-center">Hari</TableHead>
                    <TableHead className="hidden lg:table-cell">Alasan</TableHead>
                    <TableHead className="hidden sm:table-cell">Dokumen</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((l) => (
                    <TableRow key={l.id} className="hover:bg-muted/40">
                      <TableCell className="pl-4">
                        <p className="text-sm font-medium">{l.employee.name}</p>
                        <p className="text-[10px] text-muted-foreground">{l.employee.code} · {l.employee.position ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <LeaveTypeBadge type={l.type} />
                          {l.category && <span className="text-[10px] text-muted-foreground uppercase">{l.category}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs whitespace-nowrap">
                        {formatDate(l.startDate)} → {formatDate(l.endDate)}
                      </TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">{l.days}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-48 truncate">{l.reason ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell"><AttachmentLink name={l.attachmentName} url={l.attachmentUrl} /></TableCell>
                      <TableCell><LeaveStatusBadge status={l.status} /></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {l.status === "PENDING" && canApprove && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Setujui" onClick={() => approveMutation.mutate({ id: l.id, status: "APPROVED" })}>
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" title="Tolak" onClick={() => approveMutation.mutate({ id: l.id, status: "REJECTED" })}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
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
    </>
  );
}

// ---------- Reimbursement Tab ----------
type Reimbursement = {
  id: string;
  number: string;
  employeeId: string;
  employee: { id: string; code: string; name: string; position: string | null; department: string | null };
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  accountCode: string;
  bankAccountId: string | null;
  status: string;
  reference: string | null;
  journalEntryId: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
};

const RMB_CATEGORIES = ["TRANSPORT", "KESEHATAN", "ATK", "AKOMODASI", "LAINNYA"];

function ReimburseStatusBadge({ status }: { status: string }) {
  if (status === "PAID") return <Badge variant="outline" className="gap-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Dibayar</Badge>;
  if (status === "APPROVED") return <Badge variant="outline" className="gap-1 border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><BadgeCheck className="h-3 w-3" /> Disetujui</Badge>;
  if (status === "REJECTED") return <Badge variant="outline" className="gap-1 border-transparent bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"><XCircle className="h-3 w-3" /> Ditolak</Badge>;
  return <Badge variant="outline" className="gap-1 border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Clock className="h-3 w-3" /> Menunggu</Badge>;
}

function CreateReimburseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = React.useState("TRANSPORT");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [accountCode, setAccountCode] = React.useState("5-1700");
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [attachment, setAttachment] = React.useState<{ name: string; url: string } | null>(null);

  const { data: employeesData } = useQuery<{ employees: Employee[] }>({
    queryKey: ["employees", "rmb-form"],
    queryFn: async () => {
      const res = await authFetch("/api/employees?status=ALL");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });
  const { data: banksData } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });
  const { data: accountsData } = useQuery<{ accounts: CoaAccount[] }>({
    queryKey: ["accounts", "rmb-form"],
    queryFn: async () => {
      const res = await authFetch("/api/accounts?balances=false");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });
  const expenseAccounts = (accountsData?.accounts ?? []).filter((a) => !a.isGroup && a.type === "EXPENSE");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId, date, category,
          description: description.trim() || undefined,
          amount: Number(amount) || 0,
          accountCode,
          bankAccountId: bankAccountId || undefined,
          reference: reference.trim() || undefined,
          attachmentName: attachment?.name,
          attachmentUrl: attachment?.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal membuat klaim");
      return data;
    },
    onSuccess: () => {
      toast.success("Klaim reimburse diajukan");
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!employeeId || !date || !(Number(amount) > 0)) {
      toast.error("Pegawai, tanggal, dan jumlah wajib diisi");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-600" /> Klaim Reimburse</DialogTitle>
          <DialogDescription>Penggantian biaya yang sudah dikeluarkan pegawai.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Pegawai <span className="text-destructive">*</span></Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
                <SelectContent>
                  {(employeesData?.employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tanggal <span className="text-destructive">*</span></Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RMB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Jumlah (Rp) <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right tabular-nums" placeholder="0" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Deskripsi</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Taksi dinas ke klien" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Akun Beban</Label>
              <Select value={accountCode} onValueChange={setAccountCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Bayar dari</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Kas default" /></SelectTrigger>
                <SelectContent>
                  {(banksData?.bankAccounts ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>No. Referensi</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="mis. struk / bukti" />
          </div>
          <FileUploadField
            label="Bukti / Kwitansi"
            current={attachment}
            onUploaded={setAttachment}
            hint="Struk, kwitansi, atau bukti pembayaran (PDF/JPG/PNG)"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Ajukan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReimbursementsTab() {
  const qc = useQueryClient();
  const { canApprove } = useRole();
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data, isLoading } = useQuery<{ reimbursements: Reimbursement[] }>({
    queryKey: ["reimbursements", statusFilter],
    queryFn: async () => {
      const res = await authFetch(`/api/reimbursements?status=${statusFilter}`);
      if (!res.ok) throw new Error("Gagal memuat reimburse");
      return res.json();
    },
  });
  const items = data?.reimbursements ?? [];

  const totalPending = items.filter((r) => r.status === "PENDING" || r.status === "APPROVED").reduce((s, r) => s + r.amount, 0);
  const totalPaid = items.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0);

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await authFetch(`/api/reimbursements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal memperbarui");
      return json;
    },
    onSuccess: () => {
      toast.success("Status reimburse diperbarui");
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <CreateReimburseDialog open={createOpen} onOpenChange={setCreateOpen} />
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Reimburse Pegawai</CardTitle>
              <CardDescription>
                {items.length} klaim · Belum dibayar <Money value={totalPending} /> · Dibayar <Money value={totalPaid} />
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 hover:opacity-90">
              <Plus className="h-4 w-4" />
              Klaim Reimburse
            </Button>
          </div>
          <div className="pt-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="PENDING">Menunggu</SelectItem>
                <SelectItem value="APPROVED">Disetujui</SelectItem>
                <SelectItem value="PAID">Dibayar</SelectItem>
                <SelectItem value="REJECTED">Ditolak</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingState rows={4} /></div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Wallet className="h-6 w-6" />} title="Belum ada klaim reimburse" description="Ajukan penggantian biaya pegawai pertama." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">No.</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="hidden lg:table-cell">Deskripsi</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="hidden sm:table-cell">Bukti</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/40">
                      <TableCell className="pl-4 font-mono text-xs">{r.number}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{r.employee.name}</p>
                        <p className="text-[10px] text-muted-foreground">{r.employee.code}</p>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="bg-muted">{r.category ?? "LAINNYA"}</Badge></TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-48 truncate">{r.description ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums"><Money value={r.amount} /></TableCell>
                      <TableCell className="hidden sm:table-cell"><AttachmentLink name={r.attachmentName} url={r.attachmentUrl} /></TableCell>
                      <TableCell><ReimburseStatusBadge status={r.status} /></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === "PENDING" && canApprove && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-600" title="Setujui" onClick={() => updateMutation.mutate({ id: r.id, status: "APPROVED" })}>
                              <BadgeCheck className="h-4 w-4" />
                            </Button>
                          )}
                          {(r.status === "PENDING" || r.status === "APPROVED") && canApprove && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Bayar + Jurnal" onClick={() => updateMutation.mutate({ id: r.id, status: "PAID" })}>
                              <Banknote className="h-4 w-4" />
                            </Button>
                          )}
                          {r.status === "PENDING" && canApprove && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" title="Tolak" onClick={() => updateMutation.mutate({ id: r.id, status: "REJECTED" })}>
                              <XCircle className="h-4 w-4" />
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
    </>
  );
}

// ---------- Employee Loans Tab (Hutang Karyawan) ----------
type EmployeeLoan = {
  id: string;
  number: string;
  employeeId: string;
  employee: { id: string; code: string; name: string; position: string | null; department: string | null };
  date: string;
  amount: number;
  paidAmount: number;
  installmentAmount: number;
  accountCode: string;
  bankAccountId: string | null;
  description: string | null;
  interestRate: number;
  status: string;
  journalEntryId: string | null;
  remainingAmount: number;
};

function LoanStatusBadge({ status }: { status: string }) {
  if (status === "PAID") return <Badge variant="outline" className="gap-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Lunas</Badge>;
  if (status === "CANCELLED") return <Badge variant="outline" className="gap-1 border-transparent bg-muted text-muted-foreground"><XCircle className="h-3 w-3" /> Batal</Badge>;
  return <Badge variant="outline" className="gap-1 border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Banknote className="h-3 w-3" /> Berjalan</Badge>;
}

function CreateLoanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState("");
  const [installmentAmount, setInstallmentAmount] = React.useState("");
  const [interestRate, setInterestRate] = React.useState("");
  const [accountCode, setAccountCode] = React.useState("1-1700");
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [description, setDescription] = React.useState("");

  const { data: employeesData } = useQuery<{ employees: Employee[] }>({
    queryKey: ["employees", "loan-form"],
    queryFn: async () => {
      const res = await authFetch("/api/employees?status=ALL");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });
  const { data: banksData } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/employee-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId, date,
          amount: Number(amount) || 0,
          installmentAmount: Number(installmentAmount) || 0,
          interestRate: Number(interestRate) || 0,
          accountCode,
          bankAccountId: bankAccountId || undefined,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal membuat pinjaman");
      return data;
    },
    onSuccess: () => {
      toast.success("Pinjaman/kasbon dicatat", { description: "Jurnal (Debit Piutang, Kredit Kas) + Pembayaran auto-post." });
      qc.invalidateQueries({ queryKey: ["employee-loans"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!employeeId || !date || !(Number(amount) > 0)) {
      toast.error("Pegawai, tanggal, dan jumlah wajib diisi");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-600" /> Pinjaman / Kasbon Pegawai</DialogTitle>
          <DialogDescription>Uang dipinjamkan ke pegawai (hutang pegawai ke perusahaan).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Pegawai <span className="text-destructive">*</span></Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
                <SelectContent>
                  {(employeesData?.employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tanggal <span className="text-destructive">*</span></Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Jumlah (Rp) <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right tabular-nums" placeholder="0" />
            </div>
            <div className="grid gap-2">
              <Label>Cicilan/bulan (Rp)</Label>
              <Input type="number" min={0} value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} className="text-right tabular-nums" placeholder="opsional" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Bunga (%)</Label>
              <Input type="number" min={0} value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="text-right tabular-nums" placeholder="0" />
            </div>
            <div className="grid gap-2">
              <Label>Akun Piutang</Label>
              <Select value={accountCode} onValueChange={setAccountCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-1700">1-1700 — Piutang Karyawan</SelectItem>
                  <SelectItem value="1-1300">1-1300 — Piutang Usaha</SelectItem>
                  <SelectItem value="1-1500">1-1500 — Uang Muka</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Sumber Dana (Kas/Bank) <span className="text-destructive">*</span></Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Pilih akun kas/bank..." /></SelectTrigger>
              <SelectContent>
                {(banksData?.bankAccounts ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Keterangan</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Kasbon perbaikan rumah" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Berikan Pinjaman
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepayDialog({ loan, open, onOpenChange }: { loan: EmployeeLoan | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState("");
  const [interest, setInterest] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [reference, setReference] = React.useState("");

  const { data: banksData } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  const remaining = loan?.remainingAmount ?? 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/employee-loans/${loan!.id}/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          amount: Number(amount) || 0,
          interest: interest.trim() ? Number(interest) : 0,
          bankAccountId: bankAccountId || undefined,
          reference: reference.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal mencatat cicilan");
      return data;
    },
    onSuccess: () => {
      toast.success("Cicilan dicatat", { description: "Jurnal (Debit Kas, Kredit Piutang) + Penerimaan auto-post." });
      qc.invalidateQueries({ queryKey: ["employee-loans"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const newRemaining = Math.max(0, remaining - ((Number(amount) || 0) - (Number(interest) || 0)));

const submit = () => {
    const pokok = (Number(amount) || 0) - (Number(interest) || 0);
    if (!(Number(amount) > 0)) {
      toast.error("Jumlah diterima wajib diisi");
      return;
    }
    if (pokok <= 0) {
      toast.error("Pokok cicilan harus > 0 (jumlah harus lebih besar dari bunga)");
      return;
    }
    if (!bankAccountId) {
      toast.error("Pilih akun kas/bank penerima cicilan (uang masuk harus tampil di Penerimaan)");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-600" /> Cicilan Pinjaman {loan?.number}</DialogTitle>
          <DialogDescription>{loan?.employee.name} — sisa <Money value={remaining} /></DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Tanggal</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Jumlah Diterima (Rp) <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right tabular-nums" placeholder="0" />
            </div>
          </div>
          {(Number(interest) || 0) > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Jumlah diterima = pokok + bunga. Pokok mengurangi sisa pinjaman;
              bunga dicatat sebagai Pendapatan Bunga (4-2200).
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Bunga (Rp)</Label>
              <Input type="number" min={0} value={interest} onChange={(e) => setInterest(e.target.value)} className="text-right tabular-nums" placeholder="opsional, pisahkan dari pokok" />
            </div>
            <div className="grid gap-2">
              <Label>Terima ke Akun <span className="text-destructive">*</span></Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Pilih akun kas/bank..." /></SelectTrigger>
                <SelectContent>
                  {(banksData?.bankAccounts ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>No. Referensi</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="opsional" />
          </div>
          {(Number(amount) || 0) > 0 && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${newRemaining <= 0.01 ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40" : "bg-muted/30"}`}>
              Sisa setelah cicilan: <span className="font-semibold">{newRemaining <= 0.01 ? "Lunas ✓" : <Money value={newRemaining} />}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Catat Cicilan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoansTab({ employees }: { employees: Employee[] }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [repayTarget, setRepayTarget] = React.useState<EmployeeLoan | null>(null);

  const { data, isLoading } = useQuery<{ loans: EmployeeLoan[] }>({
    queryKey: ["employee-loans"],
    queryFn: async () => {
      const res = await authFetch("/api/employee-loans?status=ALL");
      if (!res.ok) throw new Error("Gagal memuat pinjaman");
      return res.json();
    },
  });
  const loans = data?.loans ?? [];

  const totalOutstanding = loans.filter((l) => l.status === "ACTIVE").reduce((s, l) => s + l.remainingAmount, 0);
  const totalLoan = loans.reduce((s, l) => s + l.amount, 0);

  return (
    <>
      <CreateLoanDialog open={createOpen} onOpenChange={setCreateOpen} />
      {repayTarget && <RepayDialog loan={repayTarget} open={!!repayTarget} onOpenChange={(v) => !v && setRepayTarget(null)} />}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Hutang Karyawan (Pinjaman / Kasbon)</CardTitle>
              <CardDescription>
                {loans.length} pinjaman · Total <Money value={totalLoan} /> · Sisa ditagih <Money value={totalOutstanding} className="text-amber-600" />
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 hover:opacity-90">
              <Plus className="h-4 w-4" />
              Pinjaman / Kasbon
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingState rows={4} /></div>
          ) : loans.length === 0 ? (
            <EmptyState icon={<Banknote className="h-6 w-6" />} title="Belum ada pinjaman" description="Berikan pinjaman/kasbon ke pegawai." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">No.</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead className="hidden lg:table-cell">Keterangan</TableHead>
                    <TableHead className="text-right">Pinjaman</TableHead>
                    <TableHead className="text-right">Dibayar</TableHead>
                    <TableHead className="text-right">Sisa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.map((l) => (
                    <TableRow key={l.id} className="hover:bg-muted/40">
                      <TableCell className="pl-4 font-mono text-xs">{l.number}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{l.employee.name}</p>
                        <p className="text-[10px] text-muted-foreground">{l.employee.code}</p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-48 truncate">{l.description ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums"><Money value={l.amount} /></TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground"><Money value={l.paidAmount} /></TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-amber-600"><Money value={l.remainingAmount} /></TableCell>
                      <TableCell><LoanStatusBadge status={l.status} /></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end">
                          {l.status === "ACTIVE" && l.remainingAmount > 0 && (
                            <Button variant="ghost" size="sm" className="h-8 text-emerald-600" onClick={() => setRepayTarget(l)}>
                              <Banknote className="h-3.5 w-3.5" />
                              Terima Cicilan
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
    </>
  );
}

// ---------- Main view ----------
export function EmployeesView() {
  const [tab, setTab] = React.useState("list");

  const { data, isLoading } = useQuery<{ employees: Employee[] }>({
    queryKey: ["employees", "ALL"],
    queryFn: async () => {
      const res = await authFetch("/api/employees?status=ALL");
      if (!res.ok) throw new Error("Gagal memuat pegawai");
      return res.json();
    },
  });

  const employees = data?.employees ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Pegawai</h2>
        <p className="text-sm text-muted-foreground">
          Kelola data pegawai dan penggajian. Setiap penggajian otomatis
          membuat jurnal akuntansi.
        </p>
      </div>

      {/* Stats */}
      {!isLoading && employees.length > 0 && (
        <EmployeeStats employees={employees} />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <TabsTrigger value="list" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Daftar Pegawai</span>
            <span className="sm:hidden">Pegawai</span>
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Riwayat Penggajian</span>
            <span className="sm:hidden">Penggajian</span>
          </TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Cuti & Izin</span>
            <span className="sm:hidden">Cuti</span>
          </TabsTrigger>
          <TabsTrigger value="reimburse" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Reimburse</span>
            <span className="sm:hidden">Reimburse</span>
          </TabsTrigger>
          <TabsTrigger value="loans" className="gap-1.5">
            <HandCoins className="h-4 w-4" />
            <span className="hidden sm:inline">Hutang Karyawan</span>
            <span className="sm:hidden">Hutang</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <EmployeeListTab
            employees={employees}
            isLoading={isLoading}
          />
        </TabsContent>
        <TabsContent value="payroll" className="mt-4">
          <PayrollHistoryTab />
        </TabsContent>
        <TabsContent value="leaves" className="mt-4">
          <LeavesTab employees={employees} />
        </TabsContent>
        <TabsContent value="reimburse" className="mt-4">
          <ReimbursementsTab />
        </TabsContent>
        <TabsContent value="loans" className="mt-4">
          <LoansTab employees={employees} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
