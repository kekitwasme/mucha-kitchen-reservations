# Restaurant Reservation — UI/UX Plan

## Route Map

| Route | Group | Auth | Purpose |
|-------|-------|------|---------|
| `/book` | Public | None | Customer booking widget |
| `/confirm/[id]` | Public | None | Booking confirmation / modification |
| `/cancel/[id]` | Public | None | Cancellation page |
| `/staff/floor-plan` | Staff | staff/admin | Live floor plan view |
| `/staff/timeline` | Staff | staff/admin | Reservation timeline |
| `/staff/reservations` | Staff | staff/admin | Reservation list + search |
| `/staff/walk-ins` | Staff | staff/admin | Walk-in queue |
| `/admin/settings` | Admin | admin | Configuration panel |
| `/login` | Auth | None | Staff login |

---

## Page Details

### /book — Customer Booking Widget

**Layout:** Single column, centered, mobile-first.
**Flow:**
1. **Date picker** — calendar, default today, min = today, max = today + bookingWindowDays
2. **Party size** — stepper or dropdown, 1..maxPartySize
3. **Time slots** — horizontal scrollable chips, filtered by availability API
4. **Customer details** — name (required), phone (required), email (optional), notes (optional)
5. **Deposit** — if configured, show amount and Square payment form
6. **Confirm** — summary + submit, redirect to `/confirm/[id]`

**States:**
- Loading: skeleton for time slots
- No availability: "No tables available for this date/size"
- Error: inline validation, API error toast

---

### /staff/floor-plan — Live Floor Plan

**Layout:** Full-width canvas. Left sidebar: date picker + time slider + legend. Top bar: area filter tabs (All, Indoor, Outdoor, Bar, Private Room).

**Canvas (React Konva):**
- Background: subtle grid
- Tables: colored shapes with labels
- Zoom: mouse wheel or +/- buttons
- Pan: click-drag on empty space
- Click table: reservation detail popup or "assign reservation" action

**Table Colors:**
| State | Color |
|-------|-------|
| available | gray-300 |
| booked | blue-500 |
| occupied | green-500 |
| reserved_soon | amber-500 |

**Legend:** Mini color guide at bottom-right.

---

### /staff/reservations — Reservation List

**Layout:** Split view. Left = filterable table. Right = detail drawer.

**Filters:**
- Date range picker
- Status multi-select (pending, confirmed, seated, completed, cancelled, no_show)
- Search: name, phone, email
- Party size range

**Table columns:**
Time | Name | Party | Tables | Status | Actions (seat, complete, cancel, no-show, edit)

**Detail Drawer:**
- Customer info
- Reservation details (date, time, duration, notes)
- Assigned tables (with reassign button)
- Payment status
- Audit log (last 5 actions)

---

### /admin/settings — Admin Configuration

**Sections:**
1. **General** — name, phone, email, timezone
2. **Hours** — 7-day opening hours editor
3. **Turn Times** — per-party-size duration table
4. **Booking Rules** — max party size, booking window, blackout dates picker
5. **Deposits** — enable/disable, type (fixed/per-person), amount
6. **SMS** — reminder timing, template (if editable)
7. **Square** — location ID, webhook config status

---

## Component Tree

```
app/
├── layout.tsx
│   └── Providers (TanStack Query, Zustand, NextAuth)
│
├── (public)/
│   ├── layout.tsx
│   ├── book/page.tsx
│   │   └── BookingWidget
│   │       ├── StepIndicator
│   │       ├── DateSelector
│   │       ├── PartySizeSelector
│   │       ├── TimeSlotPicker
│   │       ├── CustomerForm
│   │       ├── DepositStep
│   │       └── ConfirmationSummary
│   └── confirm/[id]/page.tsx
│
├── (staff)/
│   ├── layout.tsx → StaffLayout (sidebar + header + auth guard)
│   ├── floor-plan/page.tsx
│   │   └── FloorPlanView
│   │       ├── FloorPlanCanvas (Konva)
│   │       │   ├── TableShape
│   │       │   └── TableTooltip
│   │       ├── DateTimeControls
│   │       ├── AreaFilterTabs
│   │       └── Legend
│   ├── timeline/page.tsx
│   │   └── TimelineView
│   ├── reservations/page.tsx
│   │   └── ReservationsView
│   │       ├── ReservationFilters
│   │       ├── ReservationTable
│   │       └── ReservationDetailDrawer
│   └── walk-ins/page.tsx
│       └── WalkInQueue
│
└── admin/
    └── settings/page.tsx
        └── SettingsPanel
            ├── GeneralSettings
            ├── HoursSettings
            ├── TurnTimeSettings
            ├── BookingRulesSettings
            ├── DepositSettings
            └── SquareSettings
```

---

## State Design (Zustand)

```typescript
interface UIState {
  // Global
  selectedDate: Date;
  selectedTime: string | null;
  selectedArea: TableArea | 'all';
  floorPlanZoom: number;
  floorPlanPan: { x: number; y: number };

  // Reservations
  reservationFilters: {
    dateFrom: Date;
    dateTo: Date;
    statuses: ReservationStatus[];
    searchQuery: string;
  };
  selectedReservationId: string | null;

  // Auth
  staffRole: StaffRole | null;
}
```

---

## Responsive Breakpoints

| Breakpoint | Layout Changes |
|------------|----------------|
| < 640px (sm) | Single column, sidebar becomes bottom nav or hamburger, floor plan full screen with overlay controls |
| 640-1024px (md) | Two-column on reservations, sidebar collapsible |
| > 1024px (lg) | Full layout, permanent sidebar, floor plan + sidebar side-by-side |

---

## Design Tokens (Tailwind / shadcn)

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `blue-600` | Actions, active states |
| Success | `green-500` | Seated, completed |
| Warning | `amber-500` | Reserved soon, pending |
| Danger | `red-500` | Cancelled, no-show, delete |
| Surface | `slate-50` | Page backgrounds |
| Card | `white` | Cards, drawers |
| Border | `slate-200` | Dividers, table borders |

**Fonts:** Inter (system-ui fallback)
**Spacing:** 4px base (Tailwind default)
**Radius:** `rounded-lg` for cards, `rounded-full` for chips/buttons
