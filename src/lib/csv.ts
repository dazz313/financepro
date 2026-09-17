// Helper untuk parsing CSV tanpa dependensi eksternal.
// Mendukung kutipan, koma, titik koma, dan tab sebagai delimiter.

export type ParsedCSV = {
  headers: string[];
  rows: string[][];
  delimiter: string;
};

const DELIMITERS = [",", ";", "\t", "|"];

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = countOccurrences(firstLine, d);
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function countOccurrences(str: string, ch: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') {
      if (inQuotes && str[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && c === ch) count++;
  }
  return count;
}

// Parser CSV RFC 4180 style sederhana
export function parseCSV(input: string, delimiter?: string): ParsedCSV {
  const delim = delimiter ?? detectDelimiter(input);
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (c === delim) {
      current.push(field);
      field = "";
      i++;
      continue;
    }

    if (c === "\r") {
      i++;
      continue;
    }

    if (c === "\n") {
      current.push(field);
      field = "";
      rows.push(current);
      current = [];
      i++;
      continue;
    }

    field += c;
    i++;
  }

  // field terakhir
  if (field !== "" || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  // buang baris kosong
  const filtered = rows.filter((r) => r.some((f) => f.trim() !== ""));
  const headers = filtered[0]?.map((h) => h.trim()) ?? [];

  return {
    headers,
    rows: filtered.slice(1),
    delimiter: delim,
  };
}

// Parse angka yang mungkin mengandung pemisah ribuan & koma desimal
// Mendukung format: "1.000,50" (id-ID), "1,000.50" (en-US), "1000.50", "1000"
export function parseAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return isFinite(value) ? value : 0;
  const trimmed = String(value).trim();
  if (trimmed === "") return 0;
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  let cleaned = trimmed.replace(/[()\-]/g, "").replace(/[^0-9.,]/g, "");
  if (cleaned === "") return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > lastDot) {
    // format id-ID: titik sebagai pemisah ribuan, koma sebagai desimal
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // format en-US: koma sebagai pemisah ribuan, titik sebagai desimal
    cleaned = cleaned.replace(/,/g, "");
  } else {
    // hanya ada satu jenis separator
    if (cleaned.includes(",")) {
      // bisa koma ribuan atau desimal. Asumsi: jika 1-2 digit setelah koma -> desimal
      const after = cleaned.split(",").pop() ?? "";
      if (after.length <= 2) {
        cleaned = cleaned.replace(",", ".");
      } else {
        cleaned = cleaned.replace(/,/g, "");
      }
    }
  }

  const num = parseFloat(cleaned);
  const result = isFinite(num) ? num : 0;
  return negative ? -result : result;
}

// Parse tanggal fleksibel (DD/MM/YYYY, YYYY-MM-DD, dll)
export function parseDate(value: string): Date | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;

  // YYYY-MM-DD
  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY atau DD-MM-YYYY
  m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback;
  return null;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
