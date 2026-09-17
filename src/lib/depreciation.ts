// Utilitas perhitungan aset tetap (Manager.io style, straight-line)

/**
 * Hitung beban penyusutan per bulan (straight-line).
 * monthly = (hargaPerolehan - nilaiResidual) / umurEkonomisBulan
 */
export function monthlyDepreciation(purchasePrice: number, residualValue: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  const depreciable = Math.max(0, (purchasePrice || 0) - (residualValue || 0));
  return depreciable / usefulLifeMonths;
}

/** Sisa bulan penyusutan setelah `monthsElapsed` bulan. */
export function remainingMonths(usefulLifeMonths: number, monthsElapsed: number): number {
  return Math.max(0, usefulLifeMonths - monthsElapsed);
}

/**
 * Total penyusutan yang seharusnya sudah diakui setelah `monthsElapsed` bulan.
 * Bulan dihitung penuh sejak tanggal perolehan (bulan berjalan dihitung bila sudah lewat tanggal beli).
 */
export function accumulatedForMonths(monthly: number, monthsElapsed: number): number {
  return Math.max(0, monthly * monthsElapsed);
}

/** Nilai buku = harga perolehan - akumulasi penyusutan. */
export function bookValue(purchasePrice: number, accumulated: number): number {
  return Math.max(0, (purchasePrice || 0) - (accumulated || 0));
}

/** Format "YYYY-MM" dari string ISO. */
export function toPeriod(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Selisih bulan penuh antara dua tanggal (purchaseDate → endDate).
 * Bulan berjalan dihitung penuh bila endDate >= tanggal yang sama pada bulan
 * purchaseDate. Untuk tanggal > jumlah hari bulan terakhir dipakai hari terakhir
 * bulan tsb (mis. 31 Jan → 28 Feb dihitung 1 bulan penuh).
 */
export function monthsBetween(start: Date | string, end: Date | string): number {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  if (e.getTime() < s.getTime()) return 0;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  const daysInEndMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  const sDay = Math.min(s.getDate(), daysInEndMonth);
  if (e.getDate() < sDay) months -= 1;
  return Math.max(0, months);
}