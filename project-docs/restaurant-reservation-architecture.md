# Restaurant Reservation System — Technical Architecture

## Tier Classification
**Tier 2** — SaaS dashboard with auth, database, external API integrations (Square), business logic, multi-user roles.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Customer (Browser)                       │
│                    /book → Booking Widget                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Next.js 15 (App Router)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  React UI    │  │  Route       │  │  Server Actions  │  │
│  │  (Pages)     │  │  Handlers    │  │  (Mutations)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  TanStack Query    Zustand (global)    Prisma Client       │
│  React Konva       shadcn/ui           Transaction wrapper  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              PostgreSQL (Supabase / Local)                 │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────────┐   │
│  │ Restaurant │ │  Tables    │ │   Reservations       │   │
│  │ Config     │ │  FloorPlan │ │   (canonical)        │   │
│  └────────────┘ └────────────┘ └──────────────────────┘   │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────────┐   │
│  │ Customers  │ │  Payments  │ │   AuditLogs          │   │
│  │ (synced)   │ │  (deposits)│ │   (immutable)        │   │
│  └────────────┘ └────────────┘ └──────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Square API Adapter (external)                 │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────────┐   │
│  │  Customers │ │  Bookings  │ │   Payments           │   │
│  │  (create/  │ │  (sync)    │ │   (deposits)         │   │
│  │   find)    │ │            │ │                      │   │
│  └────────────┘ └────────────┘ └──────────────────────┘   │
│  Webhooks: booking.updated | booking.cancelled             │
│            payment.updated                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 15 App Router | Full-stack in one codebase, API routes + pages, server actions for mutations |
| ORM | Prisma | Type-safe queries, migrations, great DX, works well with Supabase |
| Database | PostgreSQL via Supabase | Row-level security, real-time subscriptions for floor plan updates |
| State (server) | TanStack Query | Caching, refetching, optimistic updates for reservations |
| State (client) | Zustand | Lightweight global store for UI state (selected date, filters, auth) |
| Auth | NextAuth.js v5 (Auth.js) | Simple role-based access, works with credentials or OAuth |
| Floor Plan | React Konva | Canvas-based, performant, handles drag/drop, zoom, pan natively |
| UI Components | shadcn/ui + Tailwind | Consistent design system, accessible, customizable |
| Square SDK | square npm package | Official SDK, typed, handles auth + retry |

---

## Data Flow — Reservation Creation (Canonical Flow)

```
1. Customer submits booking form
   ↓
2. POST /api/reservations (Route Handler)
   ↓
3. Start Prisma Transaction (SERIALIZABLE isolation)
   a. Check table availability (overlap query with FOR UPDATE lock)
   b. Assign optimal table(s) via Table Assignment Engine
   c. Calculate endTime from turn-time rules
   d. Insert Reservation + ReservationTable join records
   e. Commit transaction
   ↓
4. If transaction succeeds:
   a. Create/find Square customer
   b. Create Square booking (async, non-blocking for response)
   c. Store squareBookingId on reservation
   d. Update Square booking with our table assignment notes
   ↓
5. Return reservation to customer (with confirmation page)
   ↓
6. Square sends webhook confirmation → update internal status if needed
```

**Critical Rule:** The database transaction is the gate. Square operations happen AFTER the canonical reservation is committed. If Square fails, the reservation still exists — retry Square sync via background job or cron.

---

## Conflict Prevention Strategy

```sql
-- Within a Prisma transaction:
BEGIN;

-- Lock tables that could satisfy this reservation
SELECT * FROM "Table"
WHERE id IN (SELECT table_id FROM "ReservationTable" WHERE ...)
FOR UPDATE;

-- Check overlap
SELECT * FROM "Reservation" r
JOIN "ReservationTable" rt ON rt.reservation_id = r.id
WHERE rt.table_id = ANY($tableIds)
  AND r.status NOT IN ('cancelled', 'no_show')
  AND r.start_time < $endTime
  AND r.end_time > $startTime;

-- If no rows returned → safe to insert
INSERT INTO "Reservation" ...;
INSERT INTO "ReservationTable" ...;

COMMIT;
```

Prisma equivalent uses `$transaction` with `isolationLevel: 'Serializable'` and `FOR UPDATE` via raw query or `findMany({ lock: { mode: 'pessimistic_write' } })`.

---

## Folder Structure

```
restaurant-reservation/
├── app/
│   ├── (staff)/                    # Staff dashboard layout group
│   │   ├── layout.tsx              # Sidebar + auth guard
│   │   ├── floor-plan/page.tsx     # Live floor plan view
│   │   ├── timeline/page.tsx       # Reservation timeline
│   │   ├── reservations/page.tsx   # Reservation list
│   │   ├── tables/page.tsx         # Table editor (MVP2)
│   │   └── walk-ins/page.tsx       # Walk-in queue
│   ├── (public)/
│   │   ├── book/page.tsx           # Customer booking widget
│   │   └── confirm/[id]/page.tsx  # Booking confirmation
│   ├── api/
│   │   ├── reservations/
│   │   │   ├── route.ts            # POST /api/reservations
│   │   │   └── [id]/route.ts       # GET/PATCH/DELETE
│   │   ├── tables/route.ts
│   │   ├── availability/route.ts
│   │   ├── dashboard/route.ts
│   │   └── webhooks/square/route.ts
│   ├── admin/settings/page.tsx     # Admin configuration
│   └── layout.tsx                  # Root layout
├── components/
│   ├── floor-plan/
│   │   ├── FloorPlanCanvas.tsx     # React Konva canvas
│   │   ├── TableShape.tsx          # Individual table rendering
│   │   └── TableTooltip.tsx        # Hover/click detail popup
│   ├── reservations/
│   │   ├── ReservationList.tsx
│   │   ├── ReservationDetail.tsx
│   │   └── ReservationForm.tsx
│   ├── booking/
│   │   ├── BookingWidget.tsx       # Multi-step booking flow
│   │   ├── DateSelector.tsx
│   │   ├── PartySizeSelector.tsx
│   │   ├── TimeSlotPicker.tsx
│   │   └── CustomerForm.tsx
│   └── ui/                         # shadcn/ui components
├── lib/
│   ├── prisma.ts                   # Singleton Prisma client
│   ├── square.ts                   # Square SDK client
│   ├── square-adapter.ts           # Business logic wrapper
│   ├── auth.ts                     # NextAuth config
│   ├── utils.ts                    # Date helpers, overlap check
│   └── table-assignment.ts         # Table assignment engine
├── types/
│   └── index.ts                    # Domain types + enums
├── hooks/
│   ├── use-reservations.ts         # TanStack Query hooks
│   ├── use-tables.ts
│   └── use-availability.ts
└── prisma/
    ├── schema.prisma
    └── seed.ts
```

---

## Auth & Authorization

| Role | Routes | API Access |
|------|--------|------------|
| `admin` | All staff routes + /admin/settings | Full API |
| `staff` | /staff/* (except admin-only) | Reservations CRUD, dashboard |
| `customer` | /book, /confirm | POST reservation (public) |
| `unauthenticated` | /book, /confirm only | POST reservation (public) |

Middleware: `middleware.ts` checks session & role, redirects unauthorized.

---

## Square Integration Architecture

**Our system is canonical.** Square is a notification + payment + CRM layer.

```
Reservation Engine (us)          Square (external)
        │                              │
        ├──── create reservation ─────→│ (async, best-effort)
        │    (after DB commit)         │
        │                              │
        │←───── webhook updates ──────┤
        │    (booking.updated)         │
        │    (payment.updated)         │
        │                              │
        ├──── cancel reservation ─────→│
        │                              │
```

**Square responsibilities:**
- SMS confirmations (via customer phone)
- Customer profile storage/retrieval
- Deposit/payment collection
- External booking sync (if they book via Square)

**Our responsibilities:**
- Table availability
- Seating logic
- Overlap detection
- Turn times
- Floor plans
- Table assignment

---

## Performance Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| Floor plan render | < 100ms | Konva canvas, no DOM overhead |
| Reservation search | < 200ms | DB indexes on `date`, `status`, `customerName` |
| Availability query | < 150ms | Pre-computed slot generation + indexed overlap check |
| API response | < 300ms | Prisma connection pooling, Next.js edge runtime where possible |

---

## Error Handling Strategy

| Layer | Approach |
|-------|----------|
| API | Structured errors: `{ error: string, code: string, details?: unknown }` |
| DB | Prisma errors mapped to HTTP 409/400/500 |
| Square | Retry 3x with backoff, log to audit, never fail reservation creation |
| Auth | NextAuth middleware redirects, API returns 401/403 |
| Validation | Zod schemas on all inputs, fail fast |

---

## Extensibility Notes (MVP 2+)

- `TableCombination` table already designed for merged tables
- `Payment` table supports deposits, no-show fees, full prepayment
- `BlockedTime` table supports blackout dates and maintenance windows
- `AuditLog` immutable table supports compliance and debugging
- Multi-location: `restaurant_id` on all tables, currently single-tenant
