"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useRole } from "@/components/auth-provider";
import { AppShell, type NavKey } from "@/components/app-shell";
import { DashboardView } from "@/components/views/dashboard";
import { AccountsView } from "@/components/views/accounts";
import { BankAccountsView } from "@/components/views/bank-accounts";
import { ReceiptsView } from "@/components/views/receipts";
import { PaymentsView } from "@/components/views/payments";
import { TransfersView } from "@/components/views/transfers";
import { EmployeesView } from "@/components/views/employees";
import { InventoryView } from "@/components/views/inventory";
import { FixedAssetsView } from "@/components/views/fixed-assets";
import { InvoicesView } from "@/components/views/invoices";
import { ContactsView } from "@/components/views/contacts";
import { CsvUploadView } from "@/components/views/csv-upload";
import { ReportsView } from "@/components/views/reports";
import { TaxRulesView } from "@/components/views/tax";
import { SettingsView } from "@/components/views/settings";
import { LoginOverlay } from "@/components/login-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaf, Database, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/lib/settings-store";

const ALL_VIEWS: NavKey[] = ["dashboard", "bank-accounts", "receipts", "payments", "transfers", "accounts", "inventory", "fixed-assets", "invoices", "contacts", "employees", "csv", "reports", "tax", "settings"];

function SetupScreen() {
  const qc = useQueryClient();
  const [adminCred, setAdminCred] = React.useState<{ email: string; password: string } | null>(null);
  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/seed", { method: "POST" });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Gagal seed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.generated && data?.adminPassword) {
        setAdminCred({ email: data.adminEmail, password: data.adminPassword });
      } else if (data?.generated) {
        setAdminCred({ email: data.adminEmail, password: "(lihat log)" });
      }
      toast.success("Data contoh berhasil dimuat!", {
        description: `${data.counts.accounts} akun, ${data.counts.entries} jurnal, ${data.counts.invoices} faktur`,
      });
      qc.prefetchQuery({
        queryKey: ["dashboard"],
        queryFn: async () => {
          const res = await fetch("/api/dashboard");
          if (!res.ok) throw new Error("Gagal");
          return res.json();
        },
      });
      qc.invalidateQueries({ queryKey: ["seed-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-sky-50 p-6 dark:from-emerald-950/30 dark:via-background dark:to-sky-950/20">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Leaf className="h-8 w-8" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">FinancePro</h1>
          <p className="text-sm text-muted-foreground">
            Aplikasi akuntansi & keuangan modern dengan sistem berpasangan (double-entry bookkeeping),
            dashboard indikator, dan impor CSV.
          </p>
        </div>
        {adminCred ? (
          <Card className="text-left border-amber-300 dark:border-amber-800">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4 text-amber-600" />
                Kredensial admin Anda (simpan — hanya ditampilkan sekali)
              </div>
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs space-y-1">
                <p><span className="text-muted-foreground">Email:</span> <code className="font-mono">{adminCred.email}</code></p>
                <p><span className="text-muted-foreground">Password:</span> <code className="font-mono break-all">{adminCred.password}</code></p>
              </div>
              <p className="text-xs text-muted-foreground">
                Segera ganti password melalui menu Pengaturan &rarr; Keamanan setelah masuk pertama kali.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="text-left">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Mulai dalam 1 klik
              </div>
              <p className="text-xs text-muted-foreground">
                Klik tombol di bawah untuk memuat data contoh: Chart of Accounts standar Indonesia,
                20 transaksi jurnal, 4 kontak, 5 faktur, dan akun admin. Password admin dibangkitkan
                acak dan ditampilkan sekali setelah proses selesai.
              </p>
              <Button
                className="w-full"
                size="lg"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat data contoh...</>
                ) : (
                  <><Database className="mr-2 h-4 w-4" /> Muat Data Contoh</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">
          Aset = Kewajiban + Ekuitas &middot; Kaidah akuntansi berpasangan
        </p>
      </div>
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="mt-2 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <Skeleton className="mb-4 h-5 w-40" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-16 items-center gap-2.5 border-b px-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2 w-16" />
          </div>
        </div>
        <div className="flex-1 space-y-1 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b px-6">
          <Skeleton className="h-5 w-40" />
        </header>
        <main className="flex-1 p-6">
          <ViewSkeleton />
        </main>
      </div>
    </div>
  );
}

function AppContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewParam = searchParams.get("view") as NavKey | null;
  const { navKeys } = useRole();
  const validViews = navKeys as readonly NavKey[];
  const active: NavKey = viewParam && (validViews as readonly string[]).includes(viewParam) ? viewParam : "dashboard";

  const { user: sessionUser, loading: sessionLoading } = useAuth();
  const qc = useQueryClient();
  const fetchSettings = useSettingsStore((s) => s.fetchAll);

  const { data: seedStatus, isLoading: seedLoading } = useQuery<{ seeded: boolean }>({
    queryKey: ["seed-status"],
    queryFn: async () => {
      const res = await fetch("/api/seed");
      if (!res.ok) throw new Error("Gagal cek status");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch company settings segera (tidak perlu auth)
  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Fetch user preferences setelah login
  React.useEffect(() => {
    if (sessionUser) {
      useSettingsStore.getState().fetchPreferences();
    }
  }, [sessionUser]);

  // Prefetch dashboard data segera setelah seed status diketahui
  React.useEffect(() => {
    if (seedStatus?.seeded && active === "dashboard") {
      qc.prefetchQuery({
        queryKey: ["dashboard"],
        queryFn: async () => {
          const res = await fetch("/api/dashboard");
          if (!res.ok) throw new Error("Gagal");
          return res.json();
        },
      });
    }
  }, [seedStatus, active, qc]);

  // Loading session
  if (sessionLoading) {
    return <ShellSkeleton />;
  }

  // Belum login → tampilkan LoginOverlay
  if (!sessionUser) {
    return <LoginOverlay />;
  }

  // Setup screen jika belum di-seed (sudah login tapi belum ada data)
  if (!seedLoading && seedStatus && !seedStatus.seeded) {
    return <SetupScreen />;
  }

  const renderView = () => {
    switch (active) {
      case "dashboard": return <DashboardView />;
      case "bank-accounts": return <BankAccountsView />;
      case "receipts": return <ReceiptsView />;
      case "payments": return <PaymentsView />;
      case "transfers": return <TransfersView />;
      case "accounts": return <AccountsView />;
      case "inventory": return <InventoryView />;
      case "fixed-assets": return <FixedAssetsView />;
      case "invoices": return <InvoicesView />;
      case "contacts": return <ContactsView />;
      case "employees": return <EmployeesView />;
      case "csv": return <CsvUploadView />;
      case "reports": return <ReportsView />;
      case "tax": return <TaxRulesView />;
      case "settings": return <SettingsView />;
      default: return <DashboardView />;
    }
  };

  return (
    <AppShell active={active}>
      <React.Suspense fallback={<ViewSkeleton />}>
        {renderView()}
      </React.Suspense>
    </AppShell>
  );
}

// Default export HANYA membungkus AppContent dengan Suspense.
// Ini WAJIB agar useSearchParams tidak memaksa seluruh page ke client-render.
export default function Home() {
  return (
    <React.Suspense fallback={<ShellSkeleton />}>
      <AppContent />
    </React.Suspense>
  );
}
