"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Scale,
  FileBarChart,
  TrendingUp,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Printer,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Money, EmptyState } from "@/components/ui-helpers";
import { cn } from "@/lib/utils";

// ===== Trial Balance =====
type TrialBalanceResp = {
  rows: { id: string; code: string; name: string; type: string; debit: number; credit: number }[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
};

function TrialBalanceTab() {
  const { data, isLoading } = useQuery<TrialBalanceResp>({
    queryKey: ["report", "trial-balance"],
    queryFn: async () => {
      const res = await fetch("/api/reports/trial-balance");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data || data.rows.length === 0)
    return <EmptyState icon={<Scale className="h-5 w-5" />} title="Belum ada data" />;

  return (
    <div className="space-y-4">
      <div className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        data.isBalanced ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
      )}>
        <div className="flex items-center gap-2">
          {data.isBalanced ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          )}
          <span className={cn("font-medium", data.isBalanced ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
            {data.isBalanced ? "Neraca saldo balanced — total debit sama dengan total kredit" : "Neraca saldo tidak balanced!"}
          </span>
        </div>
        <div className="flex gap-4 text-sm tabular-nums">
          <span className="text-muted-foreground">Total Debit: <span className="font-bold text-foreground"><Money value={data.totalDebit} /></span></span>
          <span className="text-muted-foreground">Total Kredit: <span className="font-bold text-foreground"><Money value={data.totalCredit} /></span></span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Neraca Saldo</CardTitle>
          <CardDescription>Daftar saldo semua akun buku besar</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Kode</TableHead>
                  <TableHead>Nama Akun</TableHead>
                  <TableHead className="hidden sm:table-cell w-32">Tipe</TableHead>
                  <TableHead className="text-right w-40">Debit</TableHead>
                  <TableHead className="text-right w-40">Kredit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="text-[10px]">{r.type}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.debit > 0 ? <Money value={r.debit} zeroDash={false} /> : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.credit > 0 ? <Money value={r.credit} zeroDash={false} /> : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/30 font-bold">
                  <TableCell colSpan={3} className="text-right">Total</TableCell>
                  <TableCell className="text-right tabular-nums"><Money value={data.totalDebit} /></TableCell>
                  <TableCell className="text-right tabular-nums"><Money value={data.totalCredit} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Balance Sheet =====
type BalanceSheetResp = {
  assets: {
    current: { accounts: any[]; total: number };
    fixed: { accounts: any[]; total: number };
  };
  liabilities: {
    current: { accounts: any[]; total: number };
    longTerm: { accounts: any[]; total: number };
  };
  equities: { accounts: any[]; total: number };
  currentYearIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
};

function BalanceSheetTab() {
  const { data, isLoading } = useQuery<BalanceSheetResp>({
    queryKey: ["report", "balance-sheet"],
    queryFn: async () => {
      const res = await fetch("/api/reports/balance-sheet");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data) return <EmptyState icon={<Scale className="h-5 w-5" />} title="Belum ada data" />;

  const renderSection = (title: string, sections: { label: string; accounts: any[]; total: number }[]) => (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {sections.map((s, i) => (
        <div key={i} className="space-y-1">
          {s.label && <div className="text-xs font-semibold text-muted-foreground px-1">{s.label}</div>}
          <Table>
            <TableBody>
              {s.accounts.map((a) => (
                <TableRow key={a.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs text-muted-foreground py-2 w-28">{a.code}</TableCell>
                  <TableCell className="text-sm py-2 pl-4">{a.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm py-2"><Money value={a.balance} /></TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/20 font-semibold border-t">
                <TableCell colSpan={2} className="text-right text-xs py-2">Subtotal {s.label}</TableCell>
                <TableCell className="text-right tabular-nums text-sm py-2"><Money value={s.total} /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        data.isBalanced ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
      )}>
        <div className="flex items-center gap-2">
          {data.isBalanced ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
          <span className={cn("font-medium text-sm", data.isBalanced ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
            {data.isBalanced ? "Neraca balanced — Aset = Kewajiban + Ekuitas" : "Neraca tidak balanced!"}
          </span>
        </div>
        <div className="flex gap-3 text-xs tabular-nums">
          <span className="text-muted-foreground">Aset: <span className="font-bold text-foreground"><Money value={data.totalAssets} /></span></span>
          <span className="text-muted-foreground">Kew.+Eku.: <span className="font-bold text-foreground"><Money value={data.totalLiabilitiesAndEquity} /></span></span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">ASET</CardTitle>
          </CardHeader>
          <CardContent>
            {renderSection("Aset", [
              { label: "Aset Lancar", accounts: data.assets.current.accounts, total: data.assets.current.total },
              { label: "Aset Tetap", accounts: data.assets.fixed.accounts, total: data.assets.fixed.total },
            ])}
            <div className="mt-4 flex justify-between rounded-lg bg-emerald-500/10 px-3 py-2 font-bold">
              <span>TOTAL ASET</span>
              <span className="tabular-nums"><Money value={data.totalAssets} /></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-rose-700 dark:text-rose-400">KEWAJIBAN & EKUITAS</CardTitle>
          </CardHeader>
          <CardContent>
            {renderSection("Kewajiban", [
              { label: "Jangka Pendek", accounts: data.liabilities.current.accounts, total: data.liabilities.current.total },
              { label: "Jangka Panjang", accounts: data.liabilities.longTerm.accounts, total: data.liabilities.longTerm.total },
            ])}
            {renderSection("Ekuitas", [
              { label: "Modal & Laba Ditahan", accounts: data.equities.accounts, total: data.equities.total },
              { label: "Laba Tahun Berjalan", accounts: [{ id: "current-income", code: "3-3000", name: "Laba Tahun Berjalan", balance: data.currentYearIncome }], total: data.currentYearIncome },
            ])}
            <div className="mt-4 flex justify-between rounded-lg bg-rose-500/10 px-3 py-2 font-bold">
              <span>TOTAL KEWAJIBAN + EKUITAS</span>
              <span className="tabular-nums"><Money value={data.totalLiabilitiesAndEquity} /></span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== Income Statement =====
type IncomeStatementResp = {
  revenueGroups: { subtype: string; accounts: any[]; total: number }[];
  expenseGroups: { subtype: string; accounts: any[]; total: number }[];
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
};

function IncomeStatementTab() {
  const { data, isLoading } = useQuery<IncomeStatementResp>({
    queryKey: ["report", "income-statement"],
    queryFn: async () => {
      const res = await fetch("/api/reports/income-statement");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data) return <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="Belum ada data" />;

  const renderGroups = (groups: IncomeStatementResp["revenueGroups"]) => (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={i} className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">{g.subtype}</div>
          {g.accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1 pl-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                <span className="text-sm">{a.name}</span>
              </div>
              <span className="tabular-nums text-sm"><Money value={a.balance} /></span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t py-1 pl-4 text-xs font-semibold text-muted-foreground">
            <span>Subtotal {g.subtype}</span>
            <span className="tabular-nums"><Money value={g.total} /></span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Pendapatan</div>
          <div className="mt-1 text-lg font-bold text-sky-600 dark:text-sky-400 tabular-nums"><Money value={data.totalRevenue} /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Beban</div>
          <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums"><Money value={data.totalExpense} /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Laba / Rugi Bersih</div>
          <div className={cn("mt-1 text-lg font-bold tabular-nums", data.netIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            <Money value={data.netIncome} />
          </div>
        </CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base text-sky-700 dark:text-sky-400">PENDAPATAN</CardTitle></CardHeader>
          <CardContent>
            {data.revenueGroups.length === 0 ? <EmptyState title="Belum ada pendapatan" /> : renderGroups(data.revenueGroups)}
            <div className="mt-4 flex justify-between rounded-lg bg-sky-500/10 px-3 py-2 font-bold">
              <span>TOTAL PENDAPATAN</span>
              <span className="tabular-nums"><Money value={data.totalRevenue} /></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base text-amber-700 dark:text-amber-400">BEBAN</CardTitle></CardHeader>
          <CardContent>
            {data.expenseGroups.length === 0 ? <EmptyState title="Belum ada beban" /> : renderGroups(data.expenseGroups)}
            <div className="mt-4 flex justify-between rounded-lg bg-amber-500/10 px-3 py-2 font-bold">
              <span>TOTAL BEBAN</span>
              <span className="tabular-nums"><Money value={data.totalExpense} /></span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className={cn(
            "flex items-center justify-between rounded-lg px-4 py-3 font-bold",
            data.netIncome >= 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
          )}>
            <span className="text-sm uppercase tracking-wide">{data.netIncome >= 0 ? "LABA BERSIH" : "RUGI BERSIH"}</span>
            <span className="text-lg tabular-nums"><Money value={data.netIncome} /></span>
          </div>
          {data.totalRevenue > 0 && (
            <div className="mt-2 text-center text-xs text-muted-foreground">
              Margin Laba: {((data.netIncome / data.totalRevenue) * 100).toFixed(1)}%
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Cash Flow =====
type CashFlowLine = { date: string; description: string; source: string; accountCode: string; accountName: string; inflow: number; outflow: number; classification: "operating" | "investing" | "financing" };
type CashFlowGroup = { inflow: number; outflow: number; net: number; lines: CashFlowLine[] };
type CashFlowResp = {
  lines: CashFlowLine[];
  operating: CashFlowGroup;
  investing: CashFlowGroup;
  financing: CashFlowGroup;
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
};

const CF_LABELS: Record<"operating" | "investing" | "financing", string> = {
  operating: "Operasi",
  investing: "Investasi",
  financing: "Pendanaan",
};
const CF_CLASS: Record<"operating" | "investing" | "financing", string> = {
  operating: "bg-sky-500/10 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  investing: "bg-violet-500/10 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  financing: "bg-amber-500/10 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

function CashFlowTab() {
  const { data, isLoading } = useQuery<CashFlowResp>({
    queryKey: ["report", "cash-flow"],
    queryFn: async () => {
      const res = await fetch("/api/reports/cash-flow");
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data) return <EmptyState icon={<Wallet className="h-5 w-5" />} title="Belum ada data" />;

  const sections: { key: "operating" | "investing" | "financing"; label: string }[] = [
    { key: "operating", label: "Aktivitas Operasi" },
    { key: "investing", label: "Aktivitas Investasi" },
    { key: "financing", label: "Aktivitas Pendanaan" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Total Kas Masuk
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums"><Money value={data.totalInflow} /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-rose-600 rotate-180" /> Total Kas Keluar
          </div>
          <div className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums"><Money value={data.totalOutflow} /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Kenaikan/(Penurunan) Kas</div>
          <div className={cn("mt-1 text-lg font-bold tabular-nums", data.netCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            <Money value={data.netCashFlow} />
          </div>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map(({ key, label }) => {
          const g = data[key];
          return (
            <Card key={key}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", CF_CLASS[key])}>
                    {CF_LABELS[key]}
                  </span>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Masuk</span>
                  <span className="tabular-nums text-emerald-600 dark:text-emerald-400"><Money value={g.inflow} /></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Keluar</span>
                  <span className="tabular-nums text-rose-600 dark:text-rose-400"><Money value={g.outflow} /></span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 text-sm font-semibold">
                  <span>Bersih</span>
                  <span className={cn("tabular-nums", g.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    <Money value={g.net} />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail Arus Kas</CardTitle>
          <CardDescription>Transaksi yang melibatkan akun Kas & Bank, diklasifikasikan Operasi / Investasi / Pendanaan</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.lines.length === 0 ? (
            <EmptyState title="Belum ada transaksi kas" />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-28">Tanggal</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="hidden md:table-cell w-40">Akun</TableHead>
                    <TableHead className="hidden sm:table-cell w-24">Klasifikasi</TableHead>
                    <TableHead className="text-right w-36">Masuk</TableHead>
                    <TableHead className="text-right w-36">Keluar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(l.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                      <TableCell className="text-sm">{l.description}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{l.accountName}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", CF_CLASS[l.classification])}>{CF_LABELS[l.classification]}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-emerald-600 dark:text-emerald-400">{l.inflow > 0 ? <Money value={l.inflow} zeroDash={false} /> : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-rose-600 dark:text-rose-400">{l.outflow > 0 ? <Money value={l.outflow} zeroDash={false} /> : "—"}</TableCell>
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

export function ReportsView() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="trial-balance" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
          <TabsTrigger value="trial-balance" className="gap-1.5 text-xs md:text-sm"><Scale className="h-3.5 w-3.5" /> Neraca Saldo</TabsTrigger>
          <TabsTrigger value="balance-sheet" className="gap-1.5 text-xs md:text-sm"><FileBarChart className="h-3.5 w-3.5" /> Neraca</TabsTrigger>
          <TabsTrigger value="income-statement" className="gap-1.5 text-xs md:text-sm"><TrendingUp className="h-3.5 w-3.5" /> Laba Rugi</TabsTrigger>
          <TabsTrigger value="cash-flow" className="gap-1.5 text-xs md:text-sm"><Wallet className="h-3.5 w-3.5" /> Arus Kas</TabsTrigger>
        </TabsList>
        <TabsContent value="trial-balance" className="mt-4"><TrialBalanceTab /></TabsContent>
        <TabsContent value="balance-sheet" className="mt-4"><BalanceSheetTab /></TabsContent>
        <TabsContent value="income-statement" className="mt-4"><IncomeStatementTab /></TabsContent>
        <TabsContent value="cash-flow" className="mt-4"><CashFlowTab /></TabsContent>
      </Tabs>
    </div>
  );
}
