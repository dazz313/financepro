# FinancePro

Aplikasi akuntansi bisnis built with Next.js 15, Prisma, SQLite, Tailwind CSS, dan Bun.

## Deployment

- **Service**: web
- **Port**: 3000
- **Runtime**: Bun
- **Database**: SQLite (file-based)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_SECRET` | **Yes** | - | Secret key untuk JWT signing (min 16 karakter). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATABASE_URL` | No | `file:./db/custom.db` | SQLite database path |
| `NODE_ENV` | No | `production` | Environment mode |
| `PORT` | No | `3000` | Server port |

## Build & Run

```bash
bun install
bunx prisma generate
bunx prisma db push
bun run build
NEXTAUTH_SECRET=your-secret-here bun run start
```

## Docker

```bash
docker build -t financepro .
docker run -p 3000:3000 -e NEXTAUTH_SECRET=your-secret-here financepro
```

## First Setup

1. Akses `http://localhost:3000`
2. Klik **Muat Data Contoh** untuk seed database
3. Password admin akan ditampilkan sekali setelah seed — catat dan simpan
4. Login dengan email `admin@finance.pro` dan password dari langkah 3
5. Ubah password via **Pengaturan > Keamanan** setelah login pertama

## Fitur

- Dashboard keuangan
- Invoice & faktur
- Bank accounts & transfers
- Inventaris & fixed assets
- Payroll & employee management
- Laporan keuangan (balance sheet, income statement, cash flow)
- AI assistant
- Backup & restore
