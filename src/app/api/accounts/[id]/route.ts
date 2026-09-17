import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSystemAccountCodes } from "@/lib/system-accounts";
import { getUserFromRequest } from "@/lib/auth";

// PATCH /api/accounts/[id]
// Akun sistem/referensi modul: boleh ganti nama/deskripsi, TIDAK boleh ganti kode/tipe.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const { id } = await params;
    const body = await req.json();
    const account = await db.account.findUnique({ where: { id } });
    if (!account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });

    const systemMap = await getSystemAccountCodes();
    const isSystem = systemMap.has(account.code);

    const { name, type, subtype, parentCode, isGroup, isActive, description, sortOrder, code: newCode } = body;

    // Proteksi: akun yang direferensikan modul tidak boleh diubah kode/tipe
    if ((newCode !== undefined && newCode !== account.code) || (type !== undefined && type !== account.type)) {
      if (isSystem) {
        return NextResponse.json({
          error: "Akun sistem/terpakai modul tidak bisa diubah kode atau tipenya (bisa diganti nama saja)",
        }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(subtype !== undefined ? { subtype: subtype || null } : {}),
      ...(parentCode !== undefined ? { parentCode: parentCode || null } : {}),
      ...(isGroup !== undefined ? { isGroup } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {}),
    };

    // Pindah ke grup berbeda dibolehkan, tapi pastikan kode unik bila diubah
    if (newCode !== undefined && newCode !== account.code) {
      const dup = await db.account.findUnique({ where: { code: newCode } });
      if (dup) return NextResponse.json({ error: "Kode akun sudah digunakan" }, { status: 400 });
      data.code = newCode;
    }

    const updated = await db.account.update({ where: { id }, data });
    return NextResponse.json({ account: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memperbarui akun" },
      { status: 500 }
    );
  }
}

// DELETE /api/accounts/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Hanya admin" }, { status: 403 });
  try {
    const { id } = await params;
    const account = await db.account.findUnique({ where: { id } });
    if (!account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });

    const lineCount = await db.journalLine.count({ where: { accountId: id } });
    if (lineCount > 0) {
      return NextResponse.json(
        { error: "Akun tidak bisa dihapus karena masih memiliki transaksi jurnal" },
        { status: 400 }
      );
    }

    const hasChildren = await db.account.count({ where: { parentCode: account.code } });
    if (hasChildren > 0) {
      return NextResponse.json(
        { error: "Akun ini masih memiliki sub-akun/grup. Pindahkan dahulu sebelum dihapus." },
        { status: 400 }
      );
    }

    const systemMap = await getSystemAccountCodes();
    if (systemMap.has(account.code)) {
      const reasons = systemMap.get(account.code) ?? [];
      return NextResponse.json(
        { error: `Akun sistem tidak bisa dihapus. Dipakai oleh: ${reasons.join(", ")}` },
        { status: 400 }
      );
    }

    await db.account.delete({ where: { id } });
    return NextResponse.json({ message: "Akun dihapus" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menghapus akun" },
      { status: 500 }
    );
  }
}