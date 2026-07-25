# SPP Sekolah

Sistem Informasi Pembayaran SPP dan Pengelolaan Keuangan Sekolah.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL 16 + Prisma ORM
- **Styling:** Tailwind CSS 4
- **Validation:** Zod
- **Container:** Docker

## Prerequisites

- Node.js 20+
- Docker (untuk PostgreSQL)
- npm / yarn / pnpm

## Setup

### 1. Clone & Install

```bash
npm install
```

### 2. Setup Database

Jalankan PostgreSQL dengan Docker:

```bash
docker compose up -d
```

### 3. Configure Environment

Salin `.env.example` ke `.env`:

```bash
cp .env.example .env
```

Atau update `DATABASE_URL` di `.env` sesuai konfigurasi PostgreSQL-mu.

### 4. Initialize Database

```bash
# Generate Prisma Client & push schema
npm run db:push

# Atau untuk development dengan migration files:
npm run db:migrate

# Seed initial data (users, roles, dll)
npm run db:seed
```

### 5. Run Development Server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## Default Users (After Seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@smp.local | password |
| Bendahara | bendahara@smp.local | password |
| Kepala Sekolah | kepala@smp.local | password |

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production server
npm run db:generate  # Generate Prisma Client
npm run db:migrate   # Run migrations
npm run db:push      # Push schema to database
npm run db:seed      # Seed database
npm run db:backfill  # Backfill data
npm run lint         # Run ESLint
```

## Database Management

```bash
# View database with Prisma Studio
npx prisma studio

# Reset database
npx prisma migrate reset
```

## Docker Commands

```bash
# Start PostgreSQL
docker compose up -d

# Stop PostgreSQL
docker compose down

# Stop & remove volumes (CLEAR DATA)
docker compose down -v
```

## Project Structure

```
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.ts           # Seed data
│   ├── backfill.ts       # Data migration scripts
│   └── migrations/       # Migration files
├── src/
│   ├── app/             # Next.js App Router
│   ├── lib/             # Utilities & Prisma client
│   └── ...
├── docker-compose.yml   # PostgreSQL setup
└── .env.example         # Environment template
```

## Features

- [ ] Dashboard
- [ ] Master Data (Siswa, Kelas, Kategori Pembayaran)
- [ ] Manajemen Tagihan (Billing)
- [ ] Pembayaran SPP
- [ ] Pencatatan Pengeluaran
- [ ] Buku Kas
- [ ] Akuntansi Dasar
- [ ] Laporan & Analitik
- [ ] Pengaturan Kwitansi

## License

Private - All rights reserved
