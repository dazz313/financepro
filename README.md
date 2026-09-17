# FinancePro

Aplikasi akuntansi bisnis built with Next.js 15, Prisma, SQLite, Tailwind CSS, dan Bun.

## Deployment

- **Service**: web
- **Port**: 3000
- **Runtime**: Bun
- **Database**: SQLite (file-based)

## Build & Run

```bash
bun install
bunx prisma generate
bunx prisma db push
bun run build
bun run start
```

## Docker

```bash
docker build -t financepro .
docker run -p 3000:3000 financepro
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite database path |
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | Server port |

## Fitur

- Dashboard keuangan
- Invoice & faktur
- Bank accounts & transfers
- Inventaris & fixed assets
- Payroll & employee management
- Laporan keuangan (balance sheet, income statement, cash flow)
- AI assistant
- Backup & restore
