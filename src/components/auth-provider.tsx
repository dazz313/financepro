"use client";

import * as React from "react";
import { type Role, getPermissions } from "@/lib/types";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export function useRole() {
  const { user } = useAuth();
  const role = (user?.role ?? "INVENTORY_EMPLOYEE") as Role;
  const perms = getPermissions(role);
  return { role, ...perms };
}

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "financepro_token";

// Helper: fetch dengan sesi cookie HttpOnly (default same-origin).
// Token JWT sengaja TIDAK disimpan di localStorage untuk meminimalkan dampak XSS.
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // Bersihkan token localStorage lama bila masih tersisa (migrasi dari versi sebelumnya)
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem(TOKEN_KEY)) localStorage.removeItem(TOKEN_KEY);
    } catch {
      // abaikan
    }
  }
  init.credentials = "include";
  return fetch(input, init);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const login = React.useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || "Gagal masuk" };
      }
      // Sesi via cookie HttpOnly (Set-Cookie dari server). Token JSON tidak dipakai.
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
          // abaikan
        }
      }
      setUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false, error: "Gagal terhubung ke server" };
    }
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
