import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequestEdge, type EdgeAuthUser } from "@/lib/auth-edge";

// Akses PUBLIC (tanpa auth):
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
];

// Akses yang dibutuhkan minimal ADMIN (SUPERADMIN & ADMIN boleh):
const ADMIN_PATHS = [
  "/api/accounts",
  "/api/bank-accounts",
  "/api/receipts",
  "/api/payments",
  "/api/transfers",
  "/api/invoices",
  "/api/contacts",
  "/api/fixed-assets",
  "/api/csv",
  "/api/reports",
  "/api/tax",
  "/api/backup",
  "/api/upload",
  "/api/counts",
  "/api/seed",
];

// Akses yang dibutuhkan SUPERADMIN saja:
const SUPERADMIN_PATHS = [
  "/api/users",
  "/api/employee-loans",
  "/api/employee-leaves",
  "/api/reimbursements",
  "/api/payroll",
];

function hasAccess(pathname: string, method: string, role: string): boolean {
  if (role === "SUPERADMIN") return true;

  // INVENTORY_EMPLOYEE — akses terbatas
  if (role === "INVENTORY_EMPLOYEE") {
    // Dashboard, inventory, session, settings (read-only preferences)
    if (
      pathname === "/api/dashboard" ||
      pathname.startsWith("/api/inventory") ||
      pathname === "/api/auth/session" ||
      pathname === "/api/settings/preferences" ||
      pathname === "/api/settings/company"
    ) {
      return true;
    }
    return false;
  }

  // ADMIN — semua kecuali yang khusus SUPERADMIN
  if (role === "ADMIN") {
    // Cek path SUPERADMIN-only
    for (const prefix of SUPERADMIN_PATHS) {
      if (pathname.startsWith(prefix)) return false;
    }
    return true;
  }

  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Public endpoints — no auth needed
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    (pathname === "/api/seed" && (request.method === "GET" || request.method === "POST")) ||
    (pathname === "/api/telegram" && request.method === "POST");

  if (isPublic) return NextResponse.next();

  // Auth check
  const user = await getUserFromRequestEdge(request);
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  // Role-based access control
  if (!hasAccess(pathname, request.method, user.role)) {
    return NextResponse.json(
      { error: "Anda tidak memiliki akses ke endpoint ini" },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
