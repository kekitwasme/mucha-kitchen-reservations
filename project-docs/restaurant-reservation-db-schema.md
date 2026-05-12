# Restaurant Reservation — Database Schema (Prisma)

## Schema File: `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

enum ReservationStatus {
  pending
  confirmed
  seated
  completed
  cancelled
  no_show
}

enum TableShape {
  square
  round
  booth
  rectangle
}

enum TableArea {
  indoor
  outdoor
  bar
  private_room
}

enum TableState {
  available
  booked
  occupied
  reserved_soon
}

enum PaymentStatus {
  pending
  completed
  failed
  refunded
}

enum PaymentType {
  deposit
  per_person_deposit
  no_show_fee
  full_prepayment
}

enum StaffRole {
  admin
  staff
}

enum AuditAction {
  created
  updated
  cancelled
  seated
  completed
  no_show
  moved
  table_reassigned
  payment_received
  webhook_received
}

// ─────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────

model Restaurant {
  id                String   @id @default(cuid())
  name              String
  slug              String   @unique
  address           String?
  phone             String?
  email             String?
  timezone          String   @default("Australia/Perth")
  openingHours      Json     // { monday: { open: "09:00", close: "22:00" }, ... }
  turnTimeRules     Json     // { "1-2": 90, "3-4": 105, "5-6": 120, "7+": "custom" }
  maxPartySize      Int      @default(20)
  bookingWindowDays Int      @default(30)
  depositRules      Json?    // { type: "per_person", amount: 1000 } (cents)
  smsReminderMinutes Int     @default(60)
  squareLocationId  String?
  active            Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  tables        Table[]
  reservations  Reservation[]
  customers     Customer[]
  payments      Payment[]
  blockedTimes  BlockedTime[]
  availabilityRules AvailabilityRule[]
  auditLogs     AuditLog[]
  staffUsers    StaffUser[]
}

model Table {
  id          String    @id @default(cuid())
  restaurantId String
  name        String
  capacity    Int
  minCapacity Int       @default(1)
  shape       TableShape @default(square)
  area        TableArea  @default(indoor)
  x           Float     @default(0)
  y           Float     @default(0)
  width       Float     @default(60)
  height      Float     @default(60)
  active      Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  restaurant       Restaurant            @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  reservations     ReservationTable[]
  combinationsAsA  TableCombination[]    @relation("CombinationA")
  combinationsAsB  TableCombination[]    @relation("CombinationB")

  @@index([restaurantId])
  @@index([area])
  @@index([active])
}

model TableCombination {
  id          String @id @default(cuid())
  restaurantId String
  tableAId    String
  tableBId    String
  combinedCapacity Int
  active      Boolean @default(true)

  restaurant  Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  tableA      Table      @relation("CombinationA", fields: [tableAId], references: [id], onDelete: Cascade)
  tableB      Table      @relation("CombinationB", fields: [tableBId], references: [id], onDelete: Cascade)

  @@unique([tableAId, tableBId])
  @@index([restaurantId])
}

model Reservation {
  id               String            @id @default(cuid())
  restaurantId     String
  customerName     String
  customerPhone    String
  customerEmail    String?
  partySize        Int
  reservationDate  DateTime          @db.Date
  startTime        DateTime
  endTime          DateTime
  status           ReservationStatus @default(pending)
  notes            String?
  tableIds         String[]          // derived from ReservationTable join
  squareBookingId  String?
  squareCustomerId String?
  depositAmount    Int?              // cents
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  restaurant   Restaurant         @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  reservationTables ReservationTable[]
  customer     Customer?          @relation(fields: [customerEmail], references: [email])
  payments     Payment[]
  auditLogs    AuditLog[]

  @@index([restaurantId, reservationDate])
  @@index([restaurantId, status])
  @@index([startTime, endTime])
  @@index([customerPhone])
  @@index([customerEmail])
  @@index([squareBookingId])
}

model ReservationTable {
  id            String @id @default(cuid())
  reservationId String
  tableId       String

  reservation   Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  table         Table       @relation(fields: [tableId], references: [id], onDelete: Cascade)

  @@unique([reservationId, tableId])
  @@index([tableId])
  @@index([reservationId])
}

model Customer {
  id             String   @id @default(cuid())
  restaurantId   String
  name           String
  phone          String
  email          String?  @unique
  squareCustomerId String?
  visitCount     Int      @default(1)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  restaurant    Restaurant     @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  reservations  Reservation[]

  @@index([restaurantId])
  @@index([phone])
  @@index([squareCustomerId])
}

model Payment {
  id            String        @id @default(cuid())
  restaurantId  String
  reservationId String
  amount        Int           // cents
  type          PaymentType
  status        PaymentStatus @default(pending)
  squarePaymentId String?
  metadata      Json?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  restaurant    Restaurant    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  reservation   Reservation   @relation(fields: [reservationId], references: [id], onDelete: Cascade)

  @@index([reservationId])
  @@index([squarePaymentId])
}

model AvailabilityRule {
  id            String   @id @default(cuid())
  restaurantId  String
  dayOfWeek     Int      // 0=Sunday ... 6=Saturday
  startTime     String   // "HH:mm"
  endTime       String   // "HH:mm"
  slotInterval  Int      @default(15) // minutes between bookable slots
  maxCovers     Int      // max total guests at this time
  active        Boolean  @default(true)

  restaurant    Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@unique([restaurantId, dayOfWeek, startTime])
  @@index([restaurantId, dayOfWeek])
}

model BlockedTime {
  id            String   @id @default(cuid())
  restaurantId  String
  startTime     DateTime
  endTime       DateTime
  reason        String?
  affectsAll    Boolean  @default(true)
  tableIds      String[] // if affectsAll=false
  createdAt     DateTime @default(now())

  restaurant    Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([restaurantId, startTime, endTime])
}

model AuditLog {
  id            String      @id @default(cuid())
  restaurantId  String
  reservationId String?
  staffUserId   String?
  action        AuditAction
  details       Json?       // before/after snapshot
  ipAddress     String?
  createdAt     DateTime    @default(now())

  restaurant    Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  reservation   Reservation? @relation(fields: [reservationId], references: [id], onDelete: SetNull)

  @@index([restaurantId, createdAt])
  @@index([reservationId])
}

model StaffUser {
  id            String   @id @default(cuid())
  restaurantId  String
  userId        String   @unique // links to NextAuth user.id
  role          StaffRole @default(staff)
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())

  restaurant    Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([restaurantId])
  @@index([userId])
}
```

---

## Key Indexes for Performance

| Table | Index | Purpose |
|-------|-------|---------|
| Reservation | `(restaurantId, reservationDate)` | Daily list queries |
| Reservation | `(startTime, endTime)` | Overlap detection |
| Reservation | `(restaurantId, status)` | Dashboard status filters |
| Table | `(restaurantId, area)` | Floor plan area filtering |
| ReservationTable | `(tableId)` | Find reservations by table |
| BlockedTime | `(restaurantId, startTime, endTime)` | Blackout date queries |
| Customer | `(restaurantId, phone)` | Phone lookup for returning customers |
| AuditLog | `(restaurantId, createdAt)` | Recent activity feed |

---

## Seed Data (Sample)

```typescript
// prisma/seed.ts
import { PrismaClient, TableShape, TableArea } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      timezone: 'Australia/Perth',
      openingHours: {
        monday: { open: '11:00', close: '22:00' },
        tuesday: { open: '11:00', close: '22:00' },
        wednesday: { open: '11:00', close: '22:00' },
        thursday: { open: '11:00', close: '22:00' },
        friday: { open: '11:00', close: '23:00' },
        saturday: { open: '10:00', close: '23:00' },
        sunday: { open: '10:00', close: '21:00' },
      },
      turnTimeRules: {
        '1-2': 90,
        '3-4': 105,
        '5-6': 120,
        '7+': 150,
      },
    },
  });

  const tables = [
    { name: 'T1', capacity: 2, shape: TableShape.square, area: TableArea.indoor, x: 50, y: 50, width: 50, height: 50 },
    { name: 'T2', capacity: 2, shape: TableShape.round, area: TableArea.indoor, x: 120, y: 50, width: 50, height: 50 },
    { name: 'T3', capacity: 4, shape: TableShape.square, area: TableArea.indoor, x: 200, y: 50, width: 60, height: 60 },
    { name: 'T4', capacity: 4, shape: TableShape.booth, area: TableArea.indoor, x: 280, y: 50, width: 70, height: 60 },
    { name: 'T5', capacity: 6, shape: TableShape.rectangle, area: TableArea.outdoor, x: 50, y: 150, width: 80, height: 60 },
    { name: 'T6', capacity: 8, shape: TableShape.rectangle, area: TableArea.outdoor, x: 150, y: 150, width: 100, height: 70 },
    { name: 'Bar1', capacity: 2, shape: TableShape.square, area: TableArea.bar, x: 50, y: 250, width: 40, height: 40 },
    { name: 'Bar2', capacity: 2, shape: TableShape.square, area: TableArea.bar, x: 100, y: 250, width: 40, height: 40 },
    { name: 'PR1', capacity: 10, shape: TableShape.rectangle, area: TableArea.private_room, x: 300, y: 200, width: 120, height: 80 },
  ];

  for (const t of tables) {
    await prisma.table.create({
      data: { ...t, restaurantId: restaurant.id },
    });
  }

  console.log(`Seeded ${tables.length} tables for ${restaurant.name}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```
