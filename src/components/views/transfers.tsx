"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Loader2,
  Eye,
  MessageSquareText,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  VoucherSheet,
  printVoucherDoc,
  useVoucherCompany,
  type VoucherDoc,
} from "@/components/voucher-a4";

type BankAccount = { id: string; code: string; name: string; type: string; balance?: number };
type Transfer = {
  id: string;
  number: string;
  date: string;
  amount: number;
  fromBankAccountId: string;
  toBankAccountId: string;
  fromBankAccount: { code: string; name: string };
  toBankAccount: { code: string; name: string };
  description: string | null;
  reference: string | null;
};

function TransferForm({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Transfer | null }) {
  const qc = useQueryClient();
  const [date, setDate] = React.useState(() => (initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)));
  const [amount, setAmount] = React.useState(() => (initial ? String(initial.amount) : ""));
  const [fromBankAccountId, setFromBankAccountId] = React.useState(() => initial?.fromBankAccountId ?? "");
  const [toBankAccountId, setToBankAccountId] = React.useState(() => initial?.toBankAccountId ?? "");
  const [description, setDescription] = React.useState(() => initial?.description ?? "");
  const [reference, setReference] = React.useState(() => initial?.reference ?? "");

  const { data: banksData } = useQuery<{ bankAccounts: BankAccount[] }>({
    queryKey: ["bank-accounts", "transfer-form"],
    queryFn: async () => {
      const res = await authFetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
    enabled: open,
  });

  const reset = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setAmount(""); setFromBankAccountId(""); setToBankAccountId("");
    setDescription(""); setReference("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, amount: Number(amount), fromBankAccountId, toBankAccountId, description, reference,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Gagal");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Transfer berhasil dicatat", {
        description: `Rp ${Number(amount).toLocaleString("id-ID")} dipindahkan`,
      });
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const fromBank = (banksData?.bankAccounts ?? []).find((b) => b.id === fromBankAccountId);
  const toBank = (banksData?.bankAccounts ?? []).find((b) => b.id === toBankAccountId);
  const sameAccount = !!(fromBankAccountId && toBankAccountId && fromBankAccountId === toBankAccountId);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-sky-600" /> Transfer Antar Akun
            {initial && (
              <Badge variant="outline" className="ml-1 text-[10px] font-semibold">
                Duplikasi dari {initial.number}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {initial
              ? "Data terisi dari transfer asli — perbarui lalu simpan sebagai transfer baru."
              : "Pindahkan dana antar akun kas/bank."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-date">Tanggal</Label>
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-amount">Jumlah (Rp)</Label>
              <Input id="t-amount" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right tabular-nums" />
            </div>
          </div>

          {/* From → To with arrow */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1.5">
              <Label>Dari Akun</Label>
              <Select value={fromBankAccountId} onValueChange={setFromBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Pilih sumber..." /></SelectTrigger>
                <SelectContent>
                  {(banksData?.bankAccounts ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromBank && (
                <p className="text-[10px] text-muted-foreground">Saldo: <Money value={fromBank.balance ?? 0} /></p>
              )}
            </div>
            <div className="pb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ke Akun</Label>
              <Select value={toBankAccountId} onValueChange={setToBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Pilih tujuan..." /></SelectTrigger>
                <SelectContent>
                  {(banksData?.bankAccounts ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {toBank && (
                <p className="text-[10px] text-muted-foreground">Saldo: <Money value={toBank.balance ?? 0} /></p>
              )}
            </div>
          </div>
          {sameAccount && (
            <p className="text-xs text-rose-600">Akun sumber dan tujuan tidak boleh sama.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="t-ref">No. Referensi (opsional)</Label>
            <Input id="t-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TRF-001 / BUKTI-001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Keterangan</Label>
            <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keterangan transfer..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Batal</Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !amount || !fromBankAccountId || !toBankAccountId || sameAccount} className="bg-sky-600 hover:bg-sky-700">
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}
            Simpan Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail Transfer (standar: Lihat + Duplikasi + Cetak + PDF) ----------

function TransferDetailDialog({
  transfer,
  open,
  onOpenChange,
  onDuplicate,
}: {
  transfer: Transfer | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDuplicate: (t: Transfer) => void;
}) {
  const company = useVoucherCompany();
  if (!transfer) return null;

  const doc: VoucherDoc = {
    kind: "transfer",
    number: transfer.number,
    date: formatDate(transfer.date),
    amount: transfer.amount,
    contactName: null,
    bankName: transfer.fromBankAccount.name,
    accountCode: transfer.fromBankAccount.code,
    accountName: transfer.fromBankAccount.name,
    reference: transfer.reference,
    invoiceNumber: null,
    description: transfer.description,
    fromName: transfer.fromBankAccount.name,
    fromCode: transfer.fromBankAccount.code,
    toName: transfer.toBankAccount.name,
    toCode: transfer.toBankAccount.code,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Detail Transfer {transfer.number}</DialogTitle>
        </DialogHeader>
        {/* Toolbar standar dokumen */}
        <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
              <ArrowLeftRight className="mr-1 h-3 w-3" /> Transfer {transfer.number}
            </Badge>
          </div>
          <DocToolbar
            onDuplicate={() => onDuplicate(transfer)}
            onPrint={() => printVoucherDoc(doc, company)}
            onClose={() => onOpenChange(false)}
          />
        </div>

        <div className="p-4 sm:p-6">
          {/* Ringkasan cepat */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Tanggal</div>
              <div className="mt-1 font-medium">{formatDate(transfer.date)}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Jumlah Ditransfer</div>
              <div className="mt-1 font-semibold text-sky-600 dark:text-sky-400">
                <Money value={transfer.amount} zeroDash={false} />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Referensi</div>
              <div className="mt-1 font-medium">{transfer.reference ?? "—"}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Dari → Ke</div>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                <span>{transfer.fromBankAccount.name}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{transfer.toBankAccount.name}</span>
              </div>
            </div>
          </div>

          {transfer.description && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Keterangan</div>
                <div className="text-sm">{transfer.description}</div>
              </div>
            </div>
          )}

          {/* Lembar dokumen standar A4 */}
          <div className="mt-5">
            <VoucherSheet doc={doc} company={company} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TransfersView() {
  const { data, isLoading } = useQuery<{ transfers: Transfer[] }>({
    queryKey: ["transfers"],
    queryFn: async () => {
      const res = await authFetch("/api/transfers");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [duplicateTarget, setDuplicateTarget] = React.useState<Transfer | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<Transfer | null>(null);

  const transfers = data?.transfers ?? [];
  const filtered = React.useMemo(() => {
    if (!search) return transfers;
    const q = search.toLowerCase();
    return transfers.filter((t) =>
      t.number.toLowerCase().includes(q) ||
      t.fromBankAccount.name.toLowerCase().includes(q) ||
      t.toBankAccount.name.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)
    );
  }, [transfers, search]);

  const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowLeftRight className="h-3.5 w-3.5 text-sky-600" /> Total Transfer
            </div>
            <div className="mt-1 text-lg font-bold text-sky-600 dark:text-sky-400 tabular-nums">
              <Money value={totalTransferred} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Jumlah Transaksi</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{transfers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Akun Kas/Bank</div>
            <div className="mt-1 text-lg font-bold tabular-nums">3</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <Banknote className="h-4 w-4" /> Aktif
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari nomor / akun / keterangan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="mr-2 h-4 w-4" /> Catat Transfer
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6">
          <EmptyState
            icon={<ArrowLeftRight className="h-5 w-5" />}
            title="Belum ada transfer"
            description="Pindahkan dana antar akun kas/bank."
            action={<Button onClick={() => setFormOpen(true)} className="bg-sky-600 hover:bg-sky-700"><Plus className="mr-2 h-4 w-4" /> Catat Transfer</Button>}
          />
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-sky-600" /> Daftar Transfer Antar Akun
            </CardTitle>
            <CardDescription>Pergerakan dana antar akun kas & bank</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Nomor</TableHead>
                    <TableHead className="w-28">Tanggal</TableHead>
                    <TableHead>Dari → Ke</TableHead>
                    <TableHead className="hidden md:table-cell w-32">Referensi</TableHead>
                    <TableHead className="text-right w-40">Jumlah</TableHead>
                    <TableHead className="w-24 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setDetailTarget(t)}>
                      <TableCell className="font-mono text-xs font-medium">{t.number}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(t.date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{t.fromBankAccount.name}</span>
                            <span className="text-[10px] text-muted-foreground">{t.fromBankAccount.code}</span>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{t.toBankAccount.name}</span>
                            <span className="text-[10px] text-muted-foreground">{t.toBankAccount.code}</span>
                          </div>
                        </div>
                        {t.description && <span className="text-xs text-muted-foreground truncate block max-w-[300px]">{t.description}</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{t.reference ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                        <Money value={t.amount} zeroDash={false} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[11px] font-semibold"
                          title="Lihat detail transfer"
                          onClick={(e) => { e.stopPropagation(); setDetailTarget(t); }}
                        >
                          <Eye className="h-3 w-3" /> Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td colSpan={4} className="text-right p-4">Total Transfer</td>
                    <td className="text-right tabular-nums text-sky-600 dark:text-sky-400 p-4"><Money value={totalTransferred} /></td>
                    <td className="p-4" />
                  </tr>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <TransferForm open={formOpen} onOpenChange={setFormOpen} />

      <TransferDetailDialog
        transfer={detailTarget}
        open={!!detailTarget}
        onOpenChange={(v) => !v && setDetailTarget(null)}
        onDuplicate={(t) => { setDetailTarget(null); setDuplicateTarget(t); }}
      />

      {duplicateTarget && (
        <TransferForm
          key={`dup-${duplicateTarget.id}`}
          open
          initial={duplicateTarget}
          onOpenChange={(v) => !v && setDuplicateTarget(null)}
        />
      )}
    </div>
  );
}
