"use client";

import * as React from "react";
import { useAuth } from "@/components/auth-provider";
import { Leaf, Lock, Mail, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function LoginOverlay() {
  const { login } = useAuth();
  const [email, setEmail] = React.useState("admin@finance.pro");
  const [password, setPassword] = React.useState("admin123");
  const [showPass, setShowPass] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email dan password wajib diisi");
      return;
    }
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        toast.success("Login berhasil", { description: "Selamat datang kembali!" });
      } else {
        toast.error(result.error || "Gagal masuk");
      }
    } catch {
      toast.error("Gagal masuk. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail("admin@finance.pro");
    setPassword("admin123");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-sky-50 p-4 dark:from-emerald-950/30 dark:via-background dark:to-sky-950/20">
      {/* dekorasi */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Leaf className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">FinancePro</h1>
            <p className="text-sm text-muted-foreground">
              Akuntansi modern berpasangan &middot; Masuk untuk melanjutkan
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@finance.pro"
                className="pl-9"
                autoComplete="email"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 pr-9"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...</>
            ) : (
              <><ShieldCheck className="mr-2 h-4 w-4" /> Masuk</>
            )}
          </Button>

          <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Akun Demo:</span>
              <br />
              <code className="font-mono text-[11px]">admin@finance.pro</code>
              {" / "}
              <code className="font-mono text-[11px]">admin123</code>
            </p>
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={fillDemo}>
              Isi otomatis
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Aset = Kewajiban + Ekuitas &middot; Double-Entry Bookkeeping
        </p>
      </div>
    </div>
  );
}
