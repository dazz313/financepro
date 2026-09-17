# FinancePro

Aplikasi akuntansi bisnis berbasis Next.js dengan fitur:

- Dashboard keuangan
- Invoice & faktur
- Bank accounts & transfers
- Inventaris & fixed assets
- Payroll & employee management
- Laporan keuangan (balance sheet, income statement, cash flow)
- AI assistant
- Backup & restore

## Tech Stack

- Next.js 15 + TypeScript
- Prisma ORM + SQLite
- Tailwind CSS + shadcn/ui
- Bun runtime

## Setup

```bash
bun install
bunx prisma generate
bunx prisma db push
bun run dev
```

## Build

```bash
bun run build
bun run start
```

## Environment

Copy `.env.example` ke `.env` dan isi konfigurasi yang diperlukan.
