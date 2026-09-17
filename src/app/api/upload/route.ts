import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Whitelist ketat: hanya dokumen/bukti yang aman disajikan dari origin.
// HTML, SVG, JS, dll DITOLAK karena bisa dieksekusi di origin aplikasi (stored XSS).
const ALLOWED: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".bmp": ["image/bmp"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".csv": ["text/csv", "application/vnd.ms-excel", "text/plain"],
  ".txt": ["text/plain"],
};

// POST /api/upload - upload file pendukung (surat sakit, struk, dll.)
// body: multipart/form-data dengan field "file"
// Simpan ke public/uploads/ dengan nama unik + sanitasi. Balas { url, name }.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Field 'file' wajib berupa file" }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "File kosong" }, { status: 400 });
    }
    // Batasi ukuran 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file maksimal 10 MB" }, { status: 400 });
    }

    // Validasi ekstensi + MIME (keduanya harus cocok dengan whitelist)
    const original = file.name || "file";
    const ext = path.extname(original).toLowerCase();
    const allowedMimes = ALLOWED[ext];
    const mime = (file.type || "").toLowerCase();
    if (!allowedMimes || (mime && !allowedMimes.includes(mime))) {
      return NextResponse.json(
        { error: `Tipe file "${ext || "(tanpa ekstensi)"}" tidak diizinkan. Gunakan PDF, gambar, atau dokumen (doc/xls/csv/txt).` },
        { status: 400 }
      );
    }

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const cleanBase = path.basename(original, ext).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
    const unique = crypto.randomBytes(6).toString("hex");
    const filename = `${unique}-${cleanBase}${ext}`;
    const fullPath = path.join(UPLOAD_DIR, filename);

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(fullPath, buf);

    return NextResponse.json({
      url: `/uploads/${filename}`,
      name: original,
      size: file.size,
      type: mime,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengupload file" }, { status: 500 });
  }
}