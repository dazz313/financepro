"use client";

// Toolbar aksi standar untuk semua detail dokumen (gaya Manager.io):
// Sunting · Duplikasi · Salin ke · PDF · Cetak · Tutup.
// Dipakai agar tampilan konsisten antar jenis dokumen.

import * as React from "react";
import {
  Pencil,
  CopyPlus,
  Copy,
  Printer,
  FileDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function DocToolbar({
  onEdit,
  editLabel,
  onDuplicate,
  onCopyTo,
  onPrint,
  printLabel,
  onClose,
  closeLabel,
}: {
  onEdit?: () => void;
  editLabel?: string;
  onDuplicate?: () => void;
  onCopyTo?: { label: string; onClick: () => void }[];
  onPrint?: () => void;
  printLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onEdit && (
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> {editLabel ?? "Sunting"}
        </Button>
      )}
      {onDuplicate && (
        <Button size="sm" variant="outline" onClick={onDuplicate}>
          <CopyPlus className="mr-1.5 h-3.5 w-3.5" /> Duplikasi
        </Button>
      )}
      {onCopyTo?.map((c) => (
        <Button key={c.label} size="sm" variant="outline" onClick={c.onClick}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> {c.label}
        </Button>
      ))}
      {onPrint && (
        <Button size="sm" variant="outline" onClick={onPrint} title="Buka dialog cetak / simpan PDF">
          <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF
        </Button>
      )}
      {onPrint && (
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onPrint}>
          <Printer className="mr-1.5 h-3.5 w-3.5" /> {printLabel ?? "Cetak"}
        </Button>
      )}
      {onClose && (
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="mr-1.5 h-3.5 w-3.5" /> {closeLabel ?? "Tutup"}
        </Button>
      )}
    </div>
  );
}