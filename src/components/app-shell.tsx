"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth, authFetch } from "@/components/auth-provider";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Upload,
  BarChart3,
  Wallet,
  Moon,
  Sun,
  Menu,
  Leaf,
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Landmark,
  UserCog,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Percent,
  Building2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSettingsStore } from "@/lib/settings-store";
import { toast } from "sonner";
import { AIAssistant } from "@/components/ai-assistant";

export type NavKey =
  | "dashboard"
  | "accounts"
  | "bank-accounts"
  | "receipts"
  | "payments"
  | "transfers"
  | "inventory"
  | "fixed-assets"
  | "invoices"
  | "contacts"
  | "employees"
  | "csv"
  | "reports"
  | "tax"
  | "settings";

export const NAV_ITEMS: {
  key: NavKey;
  label: string;
  icon: React.ElementType;
  desc: string;
  group: string;
}[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "KPI & ringkasan keuangan", group: "Utama" },
  { key: "bank-accounts", label: "Kas & Bank", icon: Landmark, desc: "Rekening bank & transaksi", group: "Transaksi" },
  { key: "receipts", label: "Penerimaan", icon: ArrowDownToLine, desc: "Uang masuk dari pelanggan", group: "Transaksi" },
  { key: "payments", label: "Pembayaran", icon: ArrowUpFromLine, desc: "Uang keluar ke pemasok", group: "Transaksi" },
  { key: "transfers", label: "Transfer", icon: ArrowLeftRight, desc: "Pindah dana antar akun", group: "Transaksi" },
  { key: "accounts", label: "Daftar Akun", icon: BookOpen, desc: "Chart of Accounts", group: "Transaksi" },
  { key: "inventory", label: "Persediaan", icon: Package, desc: "Barang & pergerakan stok", group: "Transaksi" },
  { key: "fixed-assets", label: "Aset Tetap", icon: Building2, desc: "Register & penyusutan", group: "Transaksi" },
  { key: "invoices", label: "Faktur", icon: Wallet, desc: "Penjualan & pembelian", group: "Transaksi" },
  { key: "contacts", label: "Kontak", icon: Users, desc: "Pelanggan & pemasok", group: "Transaksi" },
  { key: "employees", label: "Pegawai", icon: UserCog, desc: "Karyawan & penggajian", group: "Sumber Daya" },
  { key: "csv", label: "Impor CSV", icon: Upload, desc: "Upload transaksi massal", group: "Alat" },
  { key: "reports", label: "Laporan", icon: BarChart3, desc: "Neraca, laba rugi, dll", group: "Laporan" },
  { key: "tax", label: "Pusat Pajak", icon: Percent, desc: "PPN, PPh, BPJS, dll", group: "Sistem" },
  { key: "settings", label: "Pengaturan", icon: SettingsIcon, desc: "Profil perusahaan, mata uang, pajak", group: "Sistem" },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent"
      aria-label="Ganti tema"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function Brand() {
  const company = useSettingsStore((s) => s.company);
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Leaf className="h-5 w-5" />
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-base font-bold tracking-tight text-sidebar-foreground truncate">
          {company?.name ?? "FinancePro"}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Akuntansi Modern
        </span>
      </div>
    </div>
  );
}

function NavLinks({
  active,
  onNavigate,
  counts,
}: {
  active: NavKey;
  onNavigate?: () => void;
  counts?: Record<string, number>;
}) {
  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));
  return (
    <nav className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-1">
          <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group}
          </span>
          {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            const count = counts?.[item.key];
            return (
              <Link
                key={item.key}
                href={`/?view=${item.key}`}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-sidebar-accent-foreground")} />
                <span className="truncate">{item.label}</span>
                {count !== undefined && count > 0 && (
                  <span
                    className={cn(
                      "ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-sidebar-accent text-muted-foreground group-hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {count.toLocaleString("id-ID")}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);
  if (!user) return null;
  const name = user.name ?? "User";
  const email = user.email ?? "";
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const role = user.role ?? "VIEWER";
  const roleLabel = role === "ADMIN" ? "Administrator" : role === "ACCOUNTANT" ? "Akuntan" : "Penampil";

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await logout();
      toast.success("Berhasil keluar", { description: "Sampai jumpa lagi!" });
    } catch {
      toast.error("Gagal keluar");
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent">
          <Avatar className="h-8 w-8 border border-sidebar-border">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-sidebar-accent-foreground">{name}</span>
            <span className="truncate text-[10px] text-muted-foreground">{email}</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{name}</span>
          <span className="text-xs font-normal text-muted-foreground">{email}</span>
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <ShieldCheck className="h-2.5 w-2.5" /> {roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/?view=settings" className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" />
            <span>Pengaturan</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50 dark:focus:bg-rose-950/30"
          onClick={handleLogout}
          disabled={signingOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{signingOut ? "Keluar..." : "Keluar"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const activeItem = NAV_ITEMS.find((i) => i.key === active);

  const { data: countsData } = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["nav-counts"],
    queryFn: async () => {
      const res = await authFetch("/api/counts");
      if (!res.ok) throw new Error("Gagal memuat jumlah record");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  return (
    <div className="relative min-h-screen flex flex-col bg-background">
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="flex h-16 items-center border-b border-sidebar-border px-4">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <NavLinks active={active} counts={countsData?.counts} />
          </div>
          <div className="border-t border-sidebar-border p-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Akun
              </span>
              <ThemeToggle />
            </div>
            <UserMenu />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Top header */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-sidebar">
                <SheetTitle className="sr-only">Navigasi</SheetTitle>
                <div className="flex h-16 items-center border-b border-sidebar-border px-4">
                  <Brand />
                </div>
                <div className="overflow-y-auto">
                  <NavLinks active={active} counts={countsData?.counts} onNavigate={() => setMobileOpen(false)} />
                </div>
                <div className="border-t border-sidebar-border p-3">
                  <UserMenu />
                </div>
              </SheetContent>
            </Sheet>
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg font-bold tracking-tight md:text-xl truncate">
                {activeItem?.label ?? "Dashboard"}
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {activeItem?.desc}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href={`/?view=${active}`} prefetch={false}>
                  Refresh
                </Link>
              </Button>
              <div className="md:hidden">
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 md:p-6">{children}</main>

          {/* Footer */}
          <footer className="mt-auto border-t bg-card/50 px-4 py-3 md:px-6">
            <div className="flex flex-col items-center justify-between gap-1 text-xs text-muted-foreground sm:flex-row">
              <span>
                © {new Date().getFullYear()} FinancePro &middot; Dibuat dengan kaidah akuntansi berpasangan
              </span>
              <span className="tabular-nums">
                Aset = Kewajiban + Ekuitas
              </span>
            </div>
          </footer>
        </div>
      </div>
      <SonnerToaster richColors position="top-right" />
      <AIAssistant currentView={active} />
    </div>
  );
}
