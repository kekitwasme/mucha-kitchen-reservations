# Restaurant Reservation — API Contract

## Base URL
All routes relative to the Next.js app root. Route handlers in `app/api/*`.

---

## Authentication
- Public routes: `/book`, `/api/reservations` (POST only), `/api/availability`
- Staff routes: require `staff` or `admin` role via session
- Admin routes: require `admin` role
- Returns `401` if no session, `403` if wrong role

---

## 1. Tables

### GET `/api/tables`
List tables for the restaurant.

**Query params:**
```typescript
z.object({
  area: z.enum(['indoor','outdoor','bar','private_room']).optional(),
  active: z.boolean().optional().default(true),
})
```

**Response 200:**
```typescript
z.object({
  tables: z.array(z.object({
    id: z.string(),
    name: z.string(),
    capacity: z.number(),
    minCapacity: z.number(),
    shape: z.enum(['square','round','booth','rectangle']),
    area: z.enum(['indoor','outdoor','bar','private_room']),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    active: z.boolean(),
  })),
})
```

**Auth:** public (for floor plan display)

---

### POST `/api/tables`
Create a new table. **Admin only.**

**Body:**
```typescript
z.object({
  name: z.string().min(1).max(20),
  capacity: z.number().min(1).max(50),
  minCapacity: z.number().min(1).optional().default(1),
  shape: z.enum(['square','round','booth','rectangle']),
  area: z.enum(['indoor','outdoor','bar','private_room']),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
  width: z.number().optional().default(60),
  height: z.number().optional().default(60),
})
```

**Response 201:** `{ table: Table }`
**Errors:** `400` validation, `403` unauthorized

---

### PATCH `/api/tables/[id]`
Update table properties or position.

**Body:** Partial of POST body + `{ active?: boolean }`

**Response 200:** `{ table: Table }`
**Errors:** `404` not found, `403` unauthorized

---

### DELETE `/api/tables/[id]`
Soft delete (sets `active=false`). **Admin only.**

**Response 200:** `{ success: true }`
**Errors:** `404`, `403`

---

## 2. Reservations

### POST `/api/reservations`
Create a reservation. **Public.** Rate limited.

**Body:**
```typescript
z.object({
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(5).max(20),
  customerEmail: z.string().email().optional(),
  partySize: z.number().min(1).max(50),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date
  startTime: z.string().regex(/^\d{2}:\d{2}$/), // "HH:mm"
  notes: z.string().max(500).optional(),
  preferredTableIds: z.array(z.string()).optional(), // customer preference
})
```

**Logic:**
1. Look up restaurant config (turn times, opening hours)
2. Calculate `endTime` = `startTime` + turnTime(partySize)
3. Check opening hours + blackout dates
4. Find optimal table assignment (smallest fitting, or combine)
5. **Transaction:** lock tables, check overlap, insert reservation + join records
6. If success: async Square customer + booking creation
7. Return reservation immediately (don't wait for Square)

**Response 201:**
```typescript
z.object({
  reservation: z.object({
    id: z.string(),
    customerName: z.string(),
    partySize: z.number(),
    reservationDate: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    status: z.enum(['pending','confirmed','seated','completed','cancelled','no_show']),
    tableIds: z.array(z.string()),
    tableNames: z.array(z.string()),
    depositAmount: z.number().nullable(),
    createdAt: z.string(), // ISO
  }),
})
```

**Errors:**
- `400` — invalid input
- `409` — no tables available / overlap detected (with `code: 'NO_AVAILABILITY'` or `'OVERLAP'`)
- `429` — rate limited
- `500` — unexpected

---

### GET `/api/reservations`
List reservations with filters.

**Query params:**
```typescript
z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().optional(), // comma-separated statuses
  search: z.string().optional(), // fuzzy match name/phone/email
  tableId: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
})
```

**Response 200:** `{ reservations: Reservation[], total: number }`
**Auth:** staff/admin required

---

### GET `/api/reservations/[id]`
Get single reservation detail.

**Response 200:** `{ reservation: Reservation & { tables: Table[], payments: Payment[], auditLogs: AuditLog[] } }`

---

### PATCH `/api/reservations/[id]`
Update reservation. **Staff/admin.**

**Body:**
```typescript
z.object({
  customerName: z.string().min(1).optional(),
  customerPhone: z.string().min(5).optional(),
  customerEmail: z.string().email().optional(),
  partySize: z.number().min(1).optional(),
  reservationDate: z.string().optional(),
  startTime: z.string().optional(),
  status: z.enum(['pending','confirmed','seated','completed','cancelled','no_show']).optional(),
  notes: z.string().max(500).optional(),
  tableIds: z.array(z.string()).optional(),
})
```

**Logic:** If `startTime`, `endTime`, `partySize`, or `tableIds` change → re-run conflict detection in transaction.

**Response 200:** `{ reservation: Reservation }`
**Errors:** `409` if new time/tables conflict

---

### DELETE `/api/reservations/[id]`
Cancel reservation. **Staff/admin or owner (via email/phone match).**

**Logic:** Set status = `cancelled`. Async: cancel Square booking if exists.

**Response 200:** `{ success: true }`

---

## 3. Availability

### GET `/api/availability`
Query available time slots.

**Query params:**
```typescript
z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // required
  partySize: z.number().min(1).max(50), // required
})
```

**Logic:**
1. Get opening hours for that day
2. Generate slots every `slotInterval` minutes within open hours
3. For each slot: calculate endTime from turnTimeRules
4. Check if any table combination can seat `partySize` without overlap
5. Return only slots with availability

**Response 200:**
```typescript
z.object({
  date: z.string(),
  partySize: z.number(),
  slots: z.array(z.object({
    startTime: z.string(), // "HH:mm"
    endTime: z.string(),
    availableTableIds: z.array(z.string()),
    availableTableNames: z.array(z.string()),
  })),
})
```

**Auth:** public

---

## 4. Dashboard

### GET `/api/dashboard/today`
Today's summary.

**Response 200:**
```typescript
z.object({
  date: z.string(),
  total: z.number(),
  byStatus: z.record(z.enum(['pending','confirmed','seated','completed','cancelled','no_show']), z.number()),
  upcomingArrivals: z.array(z.object({
    id: z.string(),
    customerName: z.string(),
    partySize: z.number(),
    startTime: z.string(),
    tableNames: z.array(z.string()),
    status: z.string(),
  })),
})
```

**Auth:** staff/admin

---

### GET `/api/dashboard/upcoming`
Next 2 hours arrivals.

**Response 200:** Same shape as `upcomingArrivals` above.

**Auth:** staff/admin

---

## 5. Square Webhooks

### POST `/api/webhooks/square`
Square webhook receiver.

**Headers:** `X-Square-Signature` — verified against webhook secret

**Body:** Square event payload (untyped, validate manually)

**Handled events:**
- `booking.updated` — sync status changes
- `booking.cancelled` — set our reservation to `cancelled` if not already
- `payment.updated` — update `Payment` record status

**Response:** `200` on success, `400` on invalid signature, `500` on processing error

**Auth:** Signature verification (not session-based)

---

## 6. Admin Settings

### GET `/api/admin/settings`
Get current restaurant configuration.

**Response 200:** `{ settings: RestaurantConfig }`
**Auth:** admin

---

### PATCH `/api/admin/settings`
Update configuration.

**Body:** Partial of all config fields.

**Response 200:** `{ settings: RestaurantConfig }`
**Auth:** admin

---

## Error Response Shape

All errors follow this structure:

```typescript
z.object({
  error: z.string(), // human readable
  code: z.string(), // machine readable: VALIDATION_ERROR, NO_AVAILABILITY, OVERLAP, UNAUTHORIZED, etc.
  details: z.unknown().optional(), // field-level errors or extra context
})
```

---

## Rate Limits

| Route | Limit |
|-------|-------|
| POST `/api/reservations` | 10/min per IP |
| GET `/api/availability` | 30/min per IP |
| All other public | 60/min per IP |
| Staff API | 300/min per user |
