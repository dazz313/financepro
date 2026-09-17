"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  UserCircle2,
  Building2,
  FileText,
  Filter,
  Pencil,
  Clock3,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useSettingsStore, previewCode } from "@/lib/settings-store";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, EmptyState } from "@/components/ui-helpers";

// ---------- Types ----------
type ContactType = "CUSTOMER" | "SUPPLIER" | "BOTH";

type Contact = {
  id: string;
  code: string;
  name: string;
  type: ContactType;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number | null;
  createdAt: string;
  _count: { invoices: number };
};

type ContactFilter = "ALL" | "CUSTOMER" | "SUPPLIER";

// ---------- Helpers ----------
const TYPE_FILTERS: { key: ContactFilter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "CUSTOMER", label: "Pelanggan" },
  { key: "SUPPLIER", label: "Pemasok" },
];

function ContactTypeBadge({ type }: { type: ContactType }) {
  const map: Record<ContactType, { label: string; className: string; icon: React.ElementType }> = {
    CUSTOMER: {
      label: "Pelanggan",
      className:
        "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
      icon: UserCircle2,
    },
    SUPPLIER: {
      label: "Pemasok",
      className:
        "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      icon: Building2,
    },
    BOTH: {
      label: "Pelanggan & Pemasok",
      className:
        "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
      icon: Users,
    },
  };
  const conf = map[type];
  const Icon = conf.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", conf.className)}>
      <Icon className="h-3 w-3" />
      {conf.label}
    </Badge>
  );
}

// ---------- Create Contact Dialog ----------
function CreateContactDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);
  const [code, setCode] = React.useState("");
  const [codeEdited, setCodeEdited] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ContactType>("CUSTOMER");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [paymentTermsDays, setPaymentTermsDays] = React.useState("");

  const reset = () => {
    setCode("");
    setCodeEdited(false);
    setName("");
    setType("CUSTOMER");
    setEmail("");
    setPhone("");
    setAddress("");
    setTaxId("");
    setPaymentTermsDays("");
  };

  // Tampilkan preview nomor berikutnya; server tetap sumber penomoran (auto-increment)
  const effectiveCode = codeEdited ? code : previewCode(company, "contact");

  React.useEffect(() => {
    if (!open) return;
    void fetchCompany();
    setCode("");
    setCodeEdited(false);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeEdited ? code.trim() : "",
          name: name.trim(),
          type,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          taxId: taxId.trim() || undefined,
          paymentTermsDays: paymentTermsDays ? Number(paymentTermsDays) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal membuat kontak");
      return data;
    },
    onSuccess: () => {
      toast.success("Kontak berhasil dibuat", {
        description: `${name} ditambahkan ke daftar kontak.`,
      });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      void fetchCompany();
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Gagal membuat kontak", { description: err.message });
    },
  });

  const onSubmit = () => {
    if (!name.trim() || !type) {
      toast.error("Nama dan tipe kontak wajib diisi");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Kontak Baru</DialogTitle>
          <DialogDescription>
            Pelanggan, pemasok, atau keduanya. Data ini dipakai untuk faktur
            penjualan dan pembelian.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="contact-code">
              Kode
            </Label>
            <Input
              id="contact-code"
              placeholder="CUS-001 (otomatis)"
              value={effectiveCode}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeEdited(true);
              }}
              className="uppercase"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-name">
              Nama <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contact-name"
              placeholder="PT Sumber Rezeki"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-type">Tipe Kontak</Label>
            <Select value={type} onValueChange={(v) => setType(v as ContactType)}>
              <SelectTrigger id="contact-type" className="w-full">
                <SelectValue placeholder="Pilih tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CUSTOMER">Pelanggan</SelectItem>
                <SelectItem value="SUPPLIER">Pemasok</SelectItem>
                <SelectItem value="BOTH">Pelanggan & Pemasok</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="alamat@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-phone">Telepon</Label>
              <Input
                id="contact-phone"
                placeholder="0812xxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-address">Alamat</Label>
            <Textarea
              id="contact-address"
              placeholder="Jl. Merdeka No. 1, Jakarta"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-tax">NPWP</Label>
            <Input
              id="contact-tax"
              placeholder="00.000.000.0-000.000"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-terms">
              Termin Pembayaran (hari){" "}
              <span className="text-xs font-normal text-muted-foreground">
                — dipakai menghitung jatuh tempo faktur (mis. pemasok beri 30 hari)
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="contact-terms"
                type="number"
                min={0}
                placeholder="cth: 30"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(e.target.value)}
                className="max-w-32 text-right tabular-nums"
              />
              {paymentTermsDays && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  jatuh tempo +{paymentTermsDays} hari
                </Badge>
              )}
            </div>
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
            {mutation.isPending ? "Menyimpan..." : "Simpan Kontak"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit Contact Dialog ----------
function EditContactDialog({
  contact,
  onOpenChange,
}: {
  contact: Contact;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState(contact.name);
  const [type, setType] = React.useState<ContactType>(contact.type);
  const [email, setEmail] = React.useState(contact.email ?? "");
  const [phone, setPhone] = React.useState(contact.phone ?? "");
  const [address, setAddress] = React.useState(contact.address ?? "");
  const [taxId, setTaxId] = React.useState(contact.taxId ?? "");
  const [paymentTermsDays, setPaymentTermsDays] = React.useState(
    contact.paymentTermsDays ? String(contact.paymentTermsDays) : ""
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          taxId: taxId.trim() || undefined,
          paymentTermsDays: paymentTermsDays ? Number(paymentTermsDays) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memperbarui kontak");
      return data;
    },
    onSuccess: () => {
      toast.success("Kontak diperbarui", { description: name });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
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
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit Kontak {contact.code}
          </DialogTitle>
          <DialogDescription>Perbarui data pelanggan / pemasok.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nama <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="PT Sumber Rezeki" />
          </div>

          <div className="grid gap-2">
            <Label>Tipe Kontak</Label>
            <Select value={type} onValueChange={(v) => setType(v as ContactType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CUSTOMER">Pelanggan</SelectItem>
                <SelectItem value="SUPPLIER">Pemasok</SelectItem>
                <SelectItem value="BOTH">Pelanggan & Pemasok</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" placeholder="alamat@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Telepon</Label>
              <Input placeholder="0812xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Alamat</Label>
            <Textarea placeholder="Jl. Merdeka No. 1, Jakarta" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </div>

          <div className="grid gap-2">
            <Label>NPWP</Label>
            <Input placeholder="00.000.000.0-000.000" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Termin Pembayaran (hari) <span className="text-xs font-normal text-muted-foreground">— dasar hitung jatuh tempo faktur</span></Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} placeholder="cth: 30" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} className="max-w-32 text-right tabular-nums" />
              {paymentTermsDays && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  jatuh tempo +{paymentTermsDays} hari
                </Badge>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
            Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Stats Header ----------
function ContactStats({ contacts }: { contacts: Contact[] }) {
  const customers = contacts.filter(
    (c) => c.type === "CUSTOMER" || c.type === "BOTH"
  ).length;
  const suppliers = contacts.filter(
    (c) => c.type === "SUPPLIER" || c.type === "BOTH"
  ).length;
  const totalInvoices = contacts.reduce((s, c) => s + c._count.invoices, 0);

  const stats = [
    {
      label: "Total Kontak",
      value: contacts.length,
      icon: Users,
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      label: "Pelanggan",
      value: customers,
      icon: UserCircle2,
      accent: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
    },
    {
      label: "Pemasok",
      value: suppliers,
      icon: Building2,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
    {
      label: "Total Faktur",
      value: totalInvoices,
      icon: FileText,
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
                <p className="text-xl font-bold tabular-nums">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Main View ----------
export function ContactsView() {
  const [filter, setFilter] = React.useState<ContactFilter>("ALL");
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Contact | null>(null);

  const { data, isLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ["contacts", filter],
    queryFn: async () => {
      const res = await fetch(`/api/contacts?type=${filter}`);
      if (!res.ok) throw new Error("Gagal memuat kontak");
      return res.json();
    },
  });

  const contacts = data?.contacts ?? [];

  // Client-side search filter (by name or code)
  const filtered = React.useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Daftar Kontak</h2>
          <p className="text-sm text-muted-foreground">
            Kelola pelanggan dan pemasok untuk faktur penjualan &amp; pembelian.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="sm:w-auto w-full">
          <Plus className="h-4 w-4" />
          Tambah Kontak
        </Button>
      </div>

      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editTarget && (
        <EditContactDialog
          key={editTarget.id}
          contact={editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
        />
      )}

      {/* Stats */}
      {!isLoading && contacts.length > 0 && <ContactStats contacts={contacts} />}

      {/* Main card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Kontak Terdaftar</CardTitle>
              <CardDescription>
                {filtered.length} dari {contacts.length} kontak
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari nama / kode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1 pt-1">
            <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            {TYPE_FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
                className="h-7 px-3 text-xs"
              >
                {f.label}
              </Button>
            ))}
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
                contacts.length === 0
                  ? "Belum ada kontak"
                  : "Tidak ada hasil"
              }
              description={
                contacts.length === 0
                  ? "Tambahkan pelanggan atau pemasok pertama Anda untuk mulai membuat faktur."
                  : "Coba ubah kata kunci pencarian atau filter tipe kontak."
              }
              action={
                contacts.length === 0 ? (
                  <Button onClick={() => setCreateOpen(true)} size="sm">
                    <Plus className="h-4 w-4" />
                    Tambah Kontak
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
                    <TableHead>Tipe</TableHead>
                    <TableHead>Kontak</TableHead>
                    <TableHead className="text-center">Termin</TableHead>
                    <TableHead className="text-center">Jumlah Faktur</TableHead>
                    <TableHead className="text-right">NPWP</TableHead>
                    <TableHead className="pr-6 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6 font-mono text-xs font-medium">
                        {c.code}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <ContactTypeBadge type={c.type} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          {c.email ? (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">
                              —
                            </span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {c.phone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {c.paymentTermsDays ? (
                          <Badge variant="outline" className="gap-1 border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                            <Clock3 className="h-3 w-3" /> {c.paymentTermsDays} hari
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "tabular-nums",
                            c._count.invoices > 0
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "text-muted-foreground"
                          )}
                        >
                          {c._count.invoices}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {c.taxId || "—"}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit kontak" onClick={() => setEditTarget(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
