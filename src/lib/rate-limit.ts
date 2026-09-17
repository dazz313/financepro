// Rate limiter in-memory sederhana (single-instance).
// Cukup untuk mencegah brute-force login pada deploy satu proses.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// hit(key, limit, windowMs) → { ok, retryAfterSeconds }
export function rateLimitHit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  entry.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

// Hapus bucket saat login sukses (reset counter)
export function rateLimitClear(key: string): void {
  buckets.delete(key);
}

// Bersihkan bucket kedaluwarsa sesekali agar Map tidak membengkak
export function rateLimitSweep(): void {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}