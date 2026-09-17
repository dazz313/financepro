// Backup & restore seluruh data aplikasi (semua tabel Prisma).
// Format: JSON { version, exportedAt, tables: { ModelName: rows[] } }
// Disimpan sebagai gzip agar kecil. Restore menghapus data lama (urut FK) lalu membuat ulang.

import { db } from "@/lib/db";
import { gzipSync, gunzipSync } from "zlib";

// Urutan penghapusan: child → parent (hargai foreign keys)
export const DELETE_ORDER = [
  "journalLine",
  "journalEntry",
  "invoiceLine",
  "invoice",
  "payrollEntry",
  "employeeLeave",
  "employeeReimbursement",
  "employeeLoan",
  "employee",
  "inventoryMovement",
  "inventoryItem",
  "fixedAssetDepreciation",
  "fixedAsset",
  "receiptLine",
  "receipt",
  "paymentLine",
  "payment",
  "transfer",
  "contact",
  "bankAccount",
  "taxRule",
  "userPreferences",
  "user",
  "account",
  "companySettings",
] as const;

// Urutan pembuatan = kebalikan delete (parent → child)
export const CREATE_ORDER = [...DELETE_ORDER].reverse();

// Hapus semua data (urutan FK benar). Pertahankan schema.
export async function clearAllData(tx: any) {
  for (const key of DELETE_ORDER) {
    const model = tx[key];
    if (model && typeof model.deleteMany === "function") {
      await model.deleteMany();
    }
  }
}

// Dump semua tabel menjadi object { ModelName: rows[] }
export async function dumpAll(): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {};
  for (const key of CREATE_ORDER) {
    const model = (db as any)[key];
    if (model && typeof model.findMany === "function") {
      const rows = await model.findMany();
      tables[key] = rows;
    }
  }
  return tables;
}

// Restore dari object tables
export async function restoreFromTables(tables: Record<string, unknown[]>, tx: any) {
  for (const key of CREATE_ORDER) {
    const rows = tables[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const model = tx[key];
    if (!model || typeof model.create !== "function") continue;
    for (const row of rows) {
      await model.create({ data: row });
    }
  }
}

// Serialize tabel object + metadata → gzip buffer
export function serializeBackup(tables: Record<string, unknown[]>, note?: string): Buffer {
  const payload = JSON.stringify({
    app: "FinancePro",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: note || null,
    tables,
  });
  return gzip(payload);
}

export function gzip(data: string | Buffer): Buffer {
  return gzipSync(data);
}

export function gunzip(buf: Buffer): Buffer {
  return gunzipSync(buf);
}

// Parse backup buffer (menerima gzip atau JSON polos)
export function parseBackup(buf: Buffer): {
  version: number;
  exportedAt: string;
  note?: string | null;
  tables: Record<string, unknown[]>;
} {
  let text: string;
  try {
    text = gunzip(buf).toString("utf-8");
  } catch {
    text = buf.toString("utf-8");
  }
  const obj = JSON.parse(text);
  if (!obj.tables || typeof obj.tables !== "object") {
    throw new Error("Format backup tidak valid (tidak ada field 'tables')");
  }
  return obj;
}