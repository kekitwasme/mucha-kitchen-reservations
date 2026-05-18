# Mucha Kitchen — Reservation System

A full-stack restaurant reservation and table management system built with Next.js 15, TypeScript, Prisma, and Square APIs.

**Live:** https://mucha-kitchen-reservations.vercel.app (planned)
**Repo:** https://github.com/kekitwasme/mucha-kitchen-reservations

## Features

| Feature | Status |
|---------|--------|
| Customer booking widget (date → party size → time → details) | ✅ |
| Reservation confirmation page | ✅ |
| Customer reschedule flow | ✅ |
| Customer self-cancel page | ✅ |
| Staff dashboard (today's stats + upcoming arrivals) | ✅ |
| Staff reservation list with filters (date, status, search) | ✅ |
| Inline status actions (seat, complete, cancel, no-show) | ✅ |
| Reservation detail drawer with edit modal | ✅ |
| Walk-in queue management | ✅ |
| Interactive floor plan (Konva canvas) | ✅ |
| Floor plan edit mode (add/move/resize/delete tables) | ✅ |
| Table combinations and multi-table groups | ✅ |
| Seating optimization (auto-assign) | ✅ |
| Square integration (inbound sync, customer lookup, booking creation) | ✅ |
| Square webhook receiver | ✅ |
| Double-booking prevention (Prisma transactions) | ✅ |

## Tech Stack

- **Framework**: Next.js 15 App Router
- **Language**: TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **API Style**: Next.js Route Handlers (REST)
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand (client), TanStack Query (server)
- **Auth**: NextAuth.js v5 (beta) with credentials provider
- **Floor Plan**: React Konva
- **Validation**: Zod
- **External**: Square APIs (sandbox-ready)

## Project Structure

```
restaurant-reservation/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed script with demo data
├── src/
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── book/          # Customer booking page
│   │   ├── staff/         # Staff dashboard
│   │   └── login/         # Staff login
│   ├── components/         # React components
│   ├── lib/               # Utilities, schemas, auth, store
│   └── types/             # TypeScript types
└── .env.example           # Environment variables
```

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/kekitwasme/mucha-kitchen-reservations.git
cd mucha-kitchen-reservations
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database URL and Square credentials
```

Key variables:
- `DATABASE_URL` — PostgreSQL connection string (Neon recommended)
- `AUTH_SECRET` — NextAuth.js v5 secret (generate with `openssl rand -hex 32`)
- `SQUARE_ACCESS_TOKEN` + `SQUARE_LOCATION_ID` — Square sandbox credentials
- `RESTAURANT_ID` — UUID of the restaurant row in your database

### 3. Database Setup

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. Run Development Server

```bash
npm run dev
```

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Customer booking page |
| http://localhost:3000/staff/reservations | Staff dashboard |
| http://localhost:3000/staff/floor-plan | Interactive floor plan |

### 5. Demo Login

- Any email + password `demo123`

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/availability` | Query available time slots |
| POST | `/api/reservations` | Create reservation |
| GET | `/api/reservations` | List reservations |
| GET | `/api/reservations/[id]` | Get reservation |
| PATCH | `/api/reservations/[id]` | Update reservation |
| DELETE | `/api/reservations/[id]` | Cancel reservation |
| GET | `/api/tables` | List tables |
| POST | `/api/tables` | Create table |
| PATCH | `/api/tables/[id]` | Update table |
| DELETE | `/api/tables/[id]` | Delete table |
| GET | `/api/dashboard/today` | Today's summary |
| GET | `/api/dashboard/upcoming` | Upcoming arrivals |
| PATCH | `/api/admin/settings` | Update settings |
| POST | `/api/webhooks/square` | Square webhook receiver |

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/restaurant
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
SQUARE_APPLICATION_ID=your-square-app-id
SQUARE_ACCESS_TOKEN=your-square-access-token
SQUARE_ENVIRONMENT=sandbox
SQUARE_WEBHOOK_SECRET=your-webhook-secret
SQUARE_LOCATION_ID=your-location-id
```

## Architecture

- **Canonical Database**: The application database is the source of truth. Square is treated as an external sync layer.
- **Transaction Safety**: All reservation creation uses Prisma transactions with serializable isolation to prevent double-bookings.
- **Best-Effort Sync**: Square operations are fire-and-forget. If Square is unavailable, the reservation still succeeds and sync is retried later.
- **Table Assignment**: Automatic table assignment based on party size, availability rules, and turn times.

## License

MIT
