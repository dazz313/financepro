"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Scale,
  PiggyBank,
  ArrowRightLeft,
  FileText,
  AlertTriangle,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Money, EmptyState } from "@/components/ui-helpers";
import { formatDate } from "@/lib/accounting";

type DashboardData = {
  totalCash: number;
  totalReceivable: number;
  totalPayable: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  profitMargin: number;
  currentRatio: number;
  months: { label: string; revenue: number; expense: number }[];
  expenseBreakdown: { name: string; value: number; code: string }[];
  recentTransactions: {
    id: string;
    entryNumber: string;
    date: string;
    description: string;
    source: string;
    amount: number;
    accountName: string;
  }[];
  overdueReceivables: DueItem[];
  dueSoonReceivables: DueItem[];
  overduePayables: DueItem[];
  dueSoonPayables: DueItem[];
};

type DueItem = {
  id: string;
  number: string;
  type: string;
  contactName: string;
  dueDate: string | null;
  balance: number;
  overdue: boolean;
  days: number;
};

function DueSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: DueItem[];
  tone: "overdue" | "soon";
}) {
  if (items.length === 0) return null;
  const barCls =
    tone === "overdue"
      ? "border-rose-200 bg-rose-50/50 dark:border-rose-800/60 dark:bg-rose-950/30"
      : "border-amber-200 bg-amber-50/50 dark:border-amber-800/60 dark:bg-amber-950/30";
  const badgeCls =
    tone === "overdue"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return (
    <div className={`rounded-lg border p-2 ${barCls}`}>
      <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide">{title}</p>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {items.map((d) => (
          <Link
            key={d.id}
            href="/?view=invoices"
            className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 transition-colors hover:bg-muted/50"
            title="Buka daftar faktur"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <span className="font-mono text-xs text-muted-foreground">{d.number}</span>{" "}
                {d.contactName}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.dueDate ? formatDate(d.dueDate) : "—"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-sm font-semibold tabular-nums">
                <Money value={d.balance} />
              </span>
              <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${badgeCls}`}>
                {d.overdue ? `Terlambat ${d.days} hr` : `${d.days} hr lagi`}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const PIE_COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ec4899", "#a855f7", "#ef4444"];

function KPICard({
  title,
  value,
  icon: Icon,
  hint,
  trend,
  accent,
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  hint?: string;
  trend?: { value: number; positive: boolean };
  accent: "emerald" | "amber" | "rose" | "sky" | "violet";
  href?: string;
}) {
  const accentMap = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  const card = (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-xl font-bold tracking-tight md:text-2xl">
          <Money value={value} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          {trend && (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend.value).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl" title={`Ke: ${href.replace(/^\/\?view=/, "")}`}>
      {card}
    </Link>
  ) : (
    card
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md">
      {label && <p className="mb-1 text-xs font-semibold">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs tabular-nums" style={{ color: p.color || p.fill }}>
          {p.name}: Rp {Number(p.value).toLocaleString("id-ID")}
        </p>
      ))}
    </div>
  );
}

export function DashboardView() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Gagal memuat dashboard");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
                <Skeleton className="mt-2 h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent><Skeleton className="h-64 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Tidak ada data" description="Jalankan seed untuk memulai" />;
  }

  const revenueTrend =
    data.months.length >= 2
      ? data.months[data.months.length - 1].revenue > 0
        ? ((data.months[data.months.length - 1].revenue - data.months[data.months.length - 2].revenue) / Math.max(data.months[data.months.length - 2].revenue, 1)) * 100
        : 0
      : 0;

  return (
    <div className="space-y-6">
      {/* Pemberitahuan jatuh tempo: piutang & hutang */}
      {(() => {
        const hasDue =
          data.overdueReceivables.length +
            data.dueSoonReceivables.length +
            data.overduePayables.length +
            data.dueSoonPayables.length >
          0;
        if (!hasDue) return null;
        return (
          <Card className="border-rose-200 dark:border-rose-900">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <div>
                  <CardTitle className="text-base">Pemberitahuan Jatuh Tempo</CardTitle>
                  <CardDescription>
                    Piutang &amp; hutang dari faktur yang sudah jatuh tempo atau segera jatuh tempo
                    (7 hari ke depan).
                  </CardDescription>
                </div>
              </div>
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                <Clock className="h-3 w-3" />
                Pembaruan otomatis
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <DueSection title="Piutang (Penjualan) — Jatuh Tempo" items={data.overdueReceivables} tone="overdue" />
                <DueSection title="Hutang (Pembelian) — Jatuh Tempo" items={data.overduePayables} tone="overdue" />
                <DueSection title="Piutang (Penjualan) — Segera Jatuh Tempo" items={data.dueSoonReceivables} tone="soon" />
                <DueSection title="Hutang (Pembelian) — Segera Jatuh Tempo" items={data.dueSoonPayables} tone="soon" />
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Kas & Bank"
          value={data.totalCash}
          icon={Wallet}
          accent="emerald"
          hint="Saldo kas & rekening bank"
          href="/?view=bank-accounts"
        />
        <KPICard
          title="Total Pendapatan"
          value={data.totalRevenue}
          icon={TrendingUp}
          accent="sky"
          trend={{ value: revenueTrend, positive: revenueTrend >= 0 }}
          hint="vs bulan lalu"
          href="/?view=reports"
        />
        <KPICard
          title="Total Beban"
          value={data.totalExpense}
          icon={TrendingDown}
          accent="amber"
          hint="Akumulasi beban"
          href="/?view=reports"
        />
        <KPICard
          title="Laba Bersih"
          value={data.netIncome}
          icon={PiggyBank}
          accent={data.netIncome >= 0 ? "emerald" : "rose"}
          hint={`Margin ${data.profitMargin.toFixed(1)}%`}
          href="/?view=reports"
        />
      </div>

      {/* Secondary indicators */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Aset" value={data.totalAssets} icon={Banknote} accent="emerald" href="/?view=accounts" />
        <KPICard title="Piutang Usaha" value={data.totalReceivable} icon={Receipt} accent="sky" hint="Belum tertagih" href="/?view=invoices" />
        <KPICard title="Hutang Usaha" value={data.totalPayable} icon={ArrowRightLeft} accent="rose" hint="Belum dibayar" href="/?view=invoices" />
        <KPICard
          title="Rasio Lancar"
          value={data.currentRatio}
          icon={Scale}
          accent={data.currentRatio >= 1 ? "emerald" : "amber"}
          hint={data.currentRatio >= 1 ? "Likuiditas sehat" : "Perlu perhatian"}
          href="/?view=reports"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue vs Expense trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <Link href="/?view=reports" className="inline-block hover:underline" title="Buka laporan laba rugi">
              <CardTitle className="text-base">Tren Pendapatan vs Beban</CardTitle>
            </Link>
            <CardDescription>6 bulan terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.months} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickFormatter={(v) => `${(v / 1000000).toFixed(0)}jt`}
                  width={50}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name="Pendapatan" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" name="Beban" stroke="#f59e0b" fillOpacity={1} fill="url(#colorExp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expense breakdown pie */}
        <Card>
          <CardHeader>
            <Link href="/?view=reports" className="inline-block hover:underline" title="Buka laporan laba rugi">
              <CardTitle className="text-base">Komposisi Beban</CardTitle>
            </Link>
            <CardDescription>Top 6 beban terbesar</CardDescription>
          </CardHeader>
          <CardContent>
            {data.expenseBreakdown.length === 0 ? (
              <EmptyState title="Belum ada beban" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.expenseBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {data.expenseBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: balance summary + recent transactions */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Financial position */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Posisi Keuangan</CardTitle>
            <CardDescription>Ringkasan neraca</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/?view=reports" className="flex items-center justify-between rounded-lg bg-emerald-500/5 px-3 py-2 transition-colors hover:bg-emerald-500/10" title="Buka laporan neraca">
              <span className="text-sm text-muted-foreground">Total Aset</span>
              <span className="text-sm font-semibold"><Money value={data.totalAssets} /></span>
            </Link>
            <Link href="/?view=reports" className="flex items-center justify-between rounded-lg bg-rose-500/5 px-3 py-2 transition-colors hover:bg-rose-500/10" title="Buka laporan neraca">
              <span className="text-sm text-muted-foreground">Total Kewajiban</span>
              <span className="text-sm font-semibold"><Money value={data.totalLiabilities} /></span>
            </Link>
            <Link href="/?view=reports" className="flex items-center justify-between rounded-lg bg-violet-500/5 px-3 py-2 transition-colors hover:bg-violet-500/10" title="Buka laporan neraca">
              <span className="text-sm text-muted-foreground">Total Ekuitas</span>
              <span className="text-sm font-semibold"><Money value={data.totalEquity} /></span>
            </Link>
            <div className="border-t pt-3">
              <Link href="/?view=reports" className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-muted/50" title="Buka laporan laba rugi">
                <span className="text-sm font-semibold">Laba Bersih</span>
                <span className={`text-sm font-bold ${data.netIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  <Money value={data.netIncome} />
                </span>
              </Link>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/?view=reports">Lihat Laporan Lengkap</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
              <CardDescription>Jurnal terbaru</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/?view=journal">Lihat Semua</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentTransactions.length === 0 ? (
              <EmptyState icon={<FileText className="h-5 w-5" />} title="Belum ada transaksi" />
            ) : (
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {data.recentTransactions.map((t) => (
                  <Link
                    key={t.id}
                    href="/?view=journal"
                    className="flex items-center gap-3 border-b px-6 py-3 last:border-0 transition-colors hover:bg-muted/40"
                    title="Buka jurnal"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.entryNumber} &middot; {t.accountName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-semibold tabular-nums">
                        <Money value={t.amount} zeroDash={false} />
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(t.date)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
