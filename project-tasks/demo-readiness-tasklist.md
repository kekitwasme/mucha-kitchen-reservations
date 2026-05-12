# Restaurant Reservation System — Demo Readiness Task List

**Created:** 2026-05-12  
**Status:** Planning  
**Total Tasks:** 8  

---

## Task 1: Staff Dashboard

### Feature Description
A dedicated landing page at `/staff` that gives staff an at-a-glance view of the day. This is the first thing staff see after login — it must immediately answer: "What's happening today?"

### Current State
- API endpoints exist: `GET /api/dashboard/today` (returns `date`, `total`, `byStatus`, `upcomingArrivals`) and `GET /api/dashboard/upcoming` (returns `arrivals` for next 2h)
- No frontend page consumes these endpoints
- After login, staff land on `/staff/reservations` (just a table)

### What to Build
Create `src/app/staff/page.tsx` as the dashboard page with:

1. **Today's Summary Cards** — row of stat cards at top:
   - Total reservations today
   - Confirmed (blue)
   - Seated (green)
   - Pending (amber)
   - Cancelled / No-show (red)
   - Each card shows count + icon, clickable to filter reservations list

2. **Upcoming Arrivals Panel** — next 2 hours:
   - List of reservations starting soon (pending + confirmed)
   - Each row: time, customer name, party size, assigned tables, status badge
   - Quick-action buttons: "Seat" (→ confirms + seats), "View" (opens detail drawer)
   - Auto-refreshes via TanStack Query refetchInterval (30s)
   - Empty state: "No upcoming arrivals in the next 2 hours 🎉"

3. **Floor Plan Quick Glance** — mini floor plan thumbnail or table status summary:
   - Simple grid: table name + color dot (available/booked/occupied)
   - Links to full floor plan page

4. **Recent Activity Feed** — last 5 audit log entries:
   - "{customerName} — {action} at {time}" format
   - Requires new API: `GET /api/dashboard/activity` or extend `/api/dashboard/today` to include `recentActivity`

### API Changes Needed
- Extend `GET /api/dashboard/today` response to include `recentActivity: AuditLog[]` (last 5, ordered by `createdAt desc`)
- Or create new `GET /api/dashboard/activity` endpoint

### Files to Create/Modify
- `src/app/staff/page.tsx` — new dashboard page
- `src/app/api/dashboard/today/route.ts` — extend with activity
- `src/app/staff/layout.tsx` — add "Dashboard" as first nav item, make it the default route

### Acceptance Criteria
- [ ] Dashboard loads at `/staff` with today's date and counts
- [ ] Status cards show correct counts from live data
- [ ] Upcoming arrivals list auto-refreshes, shows correct reservations
- [ ] Quick "Seat" action works from arrivals list
- [ ] Activity feed shows recent audit log entries
- [ ] Dashboard is the post-login landing page

---

## Task 2: Confirmation Page

### Feature Description
A proper confirmation page at `/confirm/[id]` that customers see after booking. Also serves as a permalink to view reservation details later (e.g., from an SMS link or email).

### Current State
- After booking, `/book` shows inline "Reservation Confirmed!" text with ID
- No dedicated route — customer can't bookmark or revisit their confirmation
- No way to view reservation details without staff access
- `GET /api/reservations/[id]` exists and returns full detail (tables, payments, audit logs)
- Middleware already allows `/confirm` as a public route

### What to Build
Create `src/app/(public)/confirm/[id]/page.tsx`:

1. **Reservation Summary Card**:
   - Customer name, party size, date, time, table assignment
   - Reservation status badge
   - Notes (if any)

2. **Restaurant Info**:
   - Restaurant name, address, phone (from settings API)
   - "Get directions" link if address exists

3. **Actions**:
   - "Cancel Reservation" button → links to `/cancel/[id]`
   - "Modify Reservation" → for MVP, link to call restaurant (or future edit flow)

4. **States**:
   - Loading: skeleton card
   - Not found: "We couldn't find this reservation" with link back to `/book`
   - Already cancelled: show cancellation notice prominently

5. **Post-booking redirect**: Update booking flow to redirect to `/confirm/[id]` instead of inline confirmation

### API Changes Needed
- None — `GET /api/reservations/[id]` returns everything needed
- Need `GET /api/admin/settings` (public subset) for restaurant info — or add a public `GET /api/restaurant` endpoint that returns name/address/phone without auth

### Files to Create/Modify
- `src/app/(public)/confirm/[id]/page.tsx` — new confirmation page
- `src/app/(public)/book/page.tsx` — change `onSuccess` to `router.push(/confirm/${id})` instead of inline confirm
- `src/lib/store.ts` — remove 'confirm' from BookingStep (no longer needed)
- `src/app/api/restaurant/route.ts` — new public endpoint for restaurant info (name, address, phone)

### Acceptance Criteria
- [ ] Booking completes → redirects to `/confirm/[id]`
- [ ] Confirmation page shows all reservation details
- [ ] Confirmation page works as a permalink (revisitable)
- [ ] Cancelled reservations show clear cancellation notice
- [ ] Not-found reservations show graceful error
- [ ] "Cancel Reservation" link works

---

## Task 3: Reservation Detail Drawer

### Feature Description
A slide-out drawer that shows full reservation details when a staff member clicks a row in the reservations list. This is the primary way staff interact with individual reservations — viewing, editing, and taking actions.

### Current State
- Reservations list (`/staff/reservations`) is a flat table with inline action buttons (Seat, Complete, Cancel, No Show)
- No detail view — can't see customer email, notes, payment status, audit log, or assigned tables in detail
- `useReservationListStore` has `selectedReservationId` but it's never used
- `GET /api/reservations/[id]` returns full detail including `tables`, `payments`, `auditLogs`

### What to Build
Create `src/components/reservations/ReservationDetailDrawer.tsx`:

1. **Drawer Component** (using existing shadcn `Drawer` or `Dialog`):
   - Slides in from right on desktop, bottom sheet on mobile
   - Opens when `selectedReservationId` is set in store
   - Closes on backdrop click or X button

2. **Header Section**:
   - Customer name (large), status badge, party size
   - Quick-status change buttons (pending→confirmed, confirmed→seated, etc.)

3. **Details Section** — two-column layout on desktop:
   - Left: Customer info (name, phone, email, visit count)
   - Right: Reservation info (date, time, duration, notes)
   - Click phone/email to copy

4. **Table Assignment Section**:
   - Shows assigned tables with names + capacities
   - "Reassign Tables" button → opens table picker (dropdown or mini floor plan)
   - Reassignment calls `PATCH /api/reservations/[id]` with new `tableIds`
   - Triggers conflict detection automatically

5. **Payment Section**:
   - Payment records (if any): type, amount, status
   - "Record Deposit" action (future, but show placeholder)

6. **Audit Trail**:
   - Last 10 audit log entries
   - Format: "{action} — {details} — {timestamp}"
   - Read-only

7. **Action Bar** at bottom of drawer:
   - Full set of status transitions (context-aware — only show valid next statuses)
   - "Edit" mode toggle for inline editing of name/phone/email/notes/party size

### Valid Status Transitions
```
pending    → confirmed, cancelled
confirmed  → seated, cancelled, no_show
seated     → completed, no_show
completed  → (terminal)
cancelled  → (terminal)
no_show    → (terminal)
```

### API Changes Needed
- None — all endpoints exist

### Files to Create/Modify
- `src/components/reservations/ReservationDetailDrawer.tsx` — new component
- `src/app/staff/reservations/page.tsx` — wire up drawer, make rows clickable (set `selectedReservationId` on click)
- `src/lib/store.ts` — ensure `selectedReservationId` is used properly

### Acceptance Criteria
- [ ] Clicking a reservation row opens the detail drawer
- [ ] Drawer shows full customer info, reservation details, tables, payments, audit trail
- [ ] Status actions in drawer work (Seat, Complete, Cancel, No Show)
- [ ] "Reassign Tables" opens table picker, saves successfully
- [ ] Edit mode allows inline editing of name/phone/notes/party size
- [ ] Drawer closes on backdrop click or X button
- [ ] Only valid status transitions are shown for current status
- [ ] Table reassignment triggers conflict check (shows error if overlap)

---

## Task 4: Nav Completion

### Feature Description
Complete the staff sidebar navigation to include all staff pages with proper icons, active states, and responsive behavior.

### Current State
- Sidebar has 3 items: Floor Plan, Reservations, Settings
- Missing: Dashboard, Timeline, Walk-ins
- No icons — just text links
- Mobile: sidebar collapses but hamburger toggle is barely visible
- Logout button does nothing

### What to Build
1. **Full nav items**:
   ```
   Dashboard    /staff
   Floor Plan   /staff/floor-plan
   Reservations /staff/reservations
   Walk-ins     /staff/walk-ins
   Timeline     /staff/timeline
   Settings     /staff/settings    (admin only)
   ```

2. **Icons** (use Lucide React — already available with shadcn):
   - Dashboard → `LayoutDashboard`
   - Floor Plan → `Grid3X3`
   - Reservations → `CalendarCheck`
   - Walk-ins → `UserPlus`
   - Timeline → `Clock`
   - Settings → `Settings` (admin only, with lock icon for non-admin)
   - Logout → `LogOut`

3. **Active state**: Current page highlighted with `bg-slate-700` (already exists)

4. **Responsive behavior**:
   - Desktop (>1024px): Permanent sidebar, always visible
   - Tablet (640–1024px): Collapsible sidebar with hamburger button in header
   - Mobile (<640px): Bottom navigation bar with icons only, or hamburger overlay

5. **Logout**: Wire up `signOut()` from NextAuth, redirect to `/login`

6. **Restaurant name**: Show "Mucha Kitchen" in sidebar header (already exists)

### Files to Modify
- `src/app/staff/layout.tsx` — add nav items, icons, responsive sidebar, working logout
- `src/components/ui/sheet.tsx` — may need for mobile sidebar (or use existing Drawer)

### Acceptance Criteria
- [ ] All 6 nav items appear with correct icons
- [ ] Settings only visible to admin role
- [ ] Active page is highlighted in sidebar
- [ ] Logout signs out and redirects to /login
- [ ] Mobile: hamburger menu or bottom nav works
- [ ] Tablet: collapsible sidebar works

---

## Task 5: Auth Polish

### Feature Description
Fix the authentication flow so login, logout, session persistence, and role-based access all work smoothly end-to-end.

### Current State
- Login page works but uses a hacky `getCsrfToken()` + manual form submission
- After login, redirects to `/staff/reservations` (should go to `/staff` dashboard)
- Logout button in sidebar does nothing (no `onClick` handler)
- No session display (no "Logged in as..." indicator)
- Middleware allows `/api/reservations` POST publicly (correct) but also allows GET without auth (should require staff)
- Auth callback doesn't properly handle `redirect: 'false'` response from NextAuth
- No "remember me" or session expiry indicator

### What to Build

1. **Fix Login Flow**:
   - Replace manual CSRF fetch + form post with `signIn('credentials', { redirect: false, ... })` from NextAuth client
   - Handle success/error properly (check for `error` in response)
   - On success: `router.push('/staff')` (dashboard, not reservations)
   - Show proper error messages: "Invalid credentials", "Account disabled"

2. **Fix Logout**:
   - Wire sidebar logout button to `signOut({ callbackUrl: '/login' })` from NextAuth client
   - Clear any client-side state on logout

3. **Session Display**:
   - Show logged-in user name + role in sidebar footer
   - e.g., "staff@demo.com (Staff)" or "admin@demo.com (Admin)"
   - Use `useSession()` from NextAuth

4. **Middleware Fix**:
   - `GET /api/reservations` should require staff/admin auth (currently public in middleware)
   - `POST /api/reservations` should remain public (customer booking)
   - Other staff API routes already protected

5. **Login Page UX**:
   - Show loading state during sign-in
   - Disable submit button while loading
   - Add "Forgot password?" placeholder (links to email or shows "Contact admin")
   - Remove hardcoded demo credentials from visible text (move to tooltip or remove)

6. **Redirect after login**:
   - If user visits `/staff/x` while not logged in, after login redirect back to that URL (not always `/staff`)

### Files to Modify
- `src/app/login/page.tsx` — use `signIn()` from next-auth/react, fix redirect
- `src/app/staff/layout.tsx` — wire logout, show session info
- `src/middleware.ts` — fix `/api/reservations` GET auth requirement, add callbackUrl redirect
- `src/lib/auth.ts` — review auth config for proper session handling

### Acceptance Criteria
- [ ] Login works with `signIn()` from next-auth/react (no manual CSRF hack)
- [ ] After login, redirect to `/staff` (or originally requested URL)
- [ ] Logout works — signs out and redirects to `/login`
- [ ] Sidebar shows logged-in user name + role
- [ ] `GET /api/reservations` requires auth (401 if not logged in)
- [ ] `POST /api/reservations` remains public
- [ ] Login shows proper error states

---

## Task 6: Cancellation Page

### Feature Description
A customer-facing page at `/cancel/[id]` that allows customers to cancel their own reservation without staff involvement.

### Current State
- No cancellation page exists
- Cancellation only possible via staff in the reservations list or `DELETE /api/reservations/[id]`
- `DELETE /api/reservations/[id]` exists but has no auth check for "owner" (customer) access
- Middleware already allows `/cancel` as a public route

### What to Build
Create `src/app/(public)/cancel/[id]/page.tsx`:

1. **Reservation Summary** (read-only):
   - Date, time, party size, customer name, table assignment
   - Status badge (only allow cancellation if status is `pending` or `confirmed`)

2. **Cancellation Flow**:
   - "Cancel this reservation?" confirmation prompt
   - Requires user to type customer name or phone last 4 digits to confirm (prevent accidental clicks)
   - On confirm: `DELETE /api/reservations/[id]`
   - Success: Show "Your reservation has been cancelled" with link back to `/book`

3. **Guard Conditions**:
   - Already cancelled → show "This reservation has already been cancelled"
   - Already seated/completed → show "This reservation cannot be cancelled" with "Please call the restaurant" message
   - No-show → show "This reservation was marked as no-show"
   - Not found → show "Reservation not found"

4. **Security**:
   - The page is public (no login required) but the reservation ID acts as the auth token (unguessable cuid)
   - Rate limit cancellation attempts (rely on existing API rate limiting)
   - Update `DELETE /api/reservations/[id]` to allow unauthenticated access when the request comes from `/cancel/[id]` (i.e., no session required for this specific flow)

### API Changes Needed
- `DELETE /api/reservations/[id]` — update to allow unauthenticated requests (currently has `TODO: Add auth check — staff/admin or owner`). Add logic: if no session, allow cancellation only (not other DELETE operations). Or add a separate public endpoint: `POST /api/reservations/[id]/cancel`

### Files to Create/Modify
- `src/app/(public)/cancel/[id]/page.tsx` — new cancellation page
- `src/app/api/reservations/[id]/route.ts` — update DELETE handler for public access
- OR `src/app/api/reservations/[id]/cancel/route.ts` — new public cancel endpoint (cleaner separation)

### Acceptance Criteria
- [ ] `/cancel/[id]` shows reservation details for valid IDs
- [ ] Cancellation works for pending/confirmed reservations
- [ ] Confirmation step requires typing name or phone digits
- [ ] Already-cancelled/seated/completed/no-show reservations show appropriate messages
- [ ] Not-found reservations show graceful error
- [ ] Success state shows cancellation confirmation + link to rebook
- [ ] Unauthenticated cancellation works (no login required)

---

## Task 7: Walk-in Queue

### Feature Description
A staff page at `/staff/walk-ins` for managing walk-in customers who arrive without a reservation. Staff can quickly create a reservation, seat them, and track their status.

### Current State
- No walk-in page or component exists
- No sidebar nav link for walk-ins
- `POST /api/reservations` can create reservations (reusable for walk-ins)
- `PATCH /api/reservations/[id]` can update status to seated
- No concept of "walk-in" vs "booked" in the data model

### What to Build

1. **Walk-in Creation Form** (top of page):
   - Quick-entry form: Name, Phone, Party Size
   - "Find Available Tables" button → queries availability for right now
   - Table selector: shows available tables with capacity, auto-picks optimal
   - "Seat Now" button → creates reservation with:
     - `startTime = now`, `status = 'seated'` (skip pending/confirmed)
     - `notes` auto-populated with "Walk-in"
   - Alternative: "Add to Waitlist" → creates with `status = 'pending'`, `notes = "Walk-in — waiting"`

2. **Active Walk-ins List** (below form):
   - Shows today's walk-in reservations (filter by `notes` containing "Walk-in" or add a `source` field)
   - Columns: Time seated, Name, Party, Table, Duration (live timer), Status
   - Duration timer: shows elapsed time since seated (e.g., "42 min") — updates every minute
   - Actions: Complete, Mark No-show (for waitlisted), Reassign Table

3. **Waitlist View** (tab or section):
   - Walk-ins with `status = 'pending'` (waiting for a table)
   - Queue position indicator
   - "Seat Now" button when table becomes available
   - Auto-suggest available tables

### Data Model Consideration
- **Option A**: Use `notes` field with "Walk-in" tag — simplest, no schema change
- **Option B**: Add `source` enum to Reservation (`online`, `walk_in`, `phone`) — cleaner but requires migration
- **Recommendation**: Option B for clean queries. Add migration:
  ```prisma
  enum ReservationSource {
    online
    walk_in
    phone
  }
  // Add to Reservation model:
  source ReservationSource @default(online)
  ```

### API Changes Needed
- Add `source` field to `createReservationSchema` and `updateReservationSchema`
- Update `POST /api/reservations` to accept `source` field
- Add `GET /api/walk-ins` endpoint — returns today's walk-in reservations with live duration calculation
  - Or just use `GET /api/reservations?source=walk_in&dateFrom=today`

### Files to Create/Modify
- `src/app/staff/walk-ins/page.tsx` — new walk-in management page
- `prisma/schema.prisma` — add `ReservationSource` enum + `source` field to Reservation
- `prisma/migrations/` — new migration
- `src/lib/schemas.ts` — add `source` to create/update schemas
- `src/app/api/reservations/route.ts` — accept `source` field
- `src/app/api/walk-ins/route.ts` — new endpoint (optional, can use existing reservations API)

### Acceptance Criteria
- [ ] Walk-in form creates reservation with `status: 'seated'` and `source: 'walk_in'`
- [ ] Available tables shown for current time
- [ ] Auto-picks optimal table for party size
- [ ] Active walk-ins list shows today's seated walk-ins
- [ ] Duration timer updates live
- [ ] Waitlist shows pending walk-ins with queue position
- [ ] "Seat Now" works from waitlist
- [ ] Complete/No-show actions work
- [ ] Table reassignment works

---

## Task 8: Extended Staff Actions for Reservations

### Feature Description
Expand the actions available to staff on reservations beyond the basic Seat/Complete/Cancel/No-show buttons. Staff need to edit reservations, reassign tables, move time slots, add notes, and handle special cases.

### Current State
- Reservations list has 4 inline buttons: Seat, Complete, Cancel, No Show
- No edit capability (name, phone, time, party size, notes)
- No table reassignment
- No way to add internal staff notes
- No way to move a reservation to a different time
- No way to mark a pending reservation as confirmed
- `PATCH /api/reservations/[id]` supports all these fields but no UI exposes them
- `updateReservationSchema` supports: `customerName`, `customerPhone`, `customerEmail`, `partySize`, `reservationDate`, `startTime`, `status`, `notes`, `tableIds`

### What to Build

1. **Full Status Transition Panel** (in detail drawer from Task 3):
   ```
   pending    → [Confirm] [Cancel]
   confirmed  → [Seat] [Cancel] [No Show]
   seated     → [Complete] [No Show] [Move Table]
   completed  → [Reopen → confirmed]  (optional)
   cancelled  → [Reopen → pending]    (optional)
   ```
   - Only show valid next states
   - Each status change requires confirmation dialog with reason
   - Audit log entry created for every status change

2. **Edit Reservation Modal** (accessible from detail drawer):
   - Editable fields: customerName, customerPhone, customerEmail, partySize, notes
   - Time change: date picker + time slot selector (re-query availability for new time)
   - Party size change: auto-recheck table assignment if size changes
   - Save calls `PATCH /api/reservations/[id]`
   - If time/party/tables change → conflict detection runs automatically (API handles this)
   - Show warning: "Changing time/party size may require table reassignment"

3. **Table Reassignment** (accessible from detail drawer):
   - Current tables displayed with "Change" button
   - Opens table picker: shows available tables for reservation's time slot
   - Filter by area (Indoor, Outdoor, Bar, Private Room)
   - Show capacity + current booking status per table
   - Multi-select for table groups
   - Save calls `PATCH /api/reservations/[id]` with new `tableIds`
   - If conflict detected → show error, don't save

4. **Add Staff Note**:
   - "Add note" button in detail drawer
   - Quick text input, appends to existing `notes` field with timestamp: `[14:30 Staff] Customer prefers window seat`
   - Or separate `staffNotes` field (requires schema change — recommend using existing `notes` for MVP)

5. **Quick Actions** (accessible from reservations list table, not just drawer):
   - Replace current inline buttons with a "..." dropdown menu per row
   - Dropdown items:
     - View Details (opens drawer)
     - Edit
     - Confirm (pending → confirmed)
     - Seat (confirmed → seated)
     - Complete (seated → completed)
     - Cancel
     - No Show
     - Reassign Table
     - Add Note
   - Only show actions valid for current status
   - Most common action (Seat, Complete) shown as primary button outside dropdown

6. **Bulk Actions** (optional, nice-to-have):
   - Checkbox column for multi-select
   - Bulk: Confirm all selected, Cancel all selected
   - Requires `POST /api/reservations/batch` endpoint (or loop individual PATCH calls)

### API Changes Needed
- None for most actions — `PATCH /api/reservations/[id]` handles all fields
- Optional: `POST /api/reservations/batch` for bulk status updates
- Consider adding `reopen` as a valid status transition (cancelled → pending, completed → confirmed) — update API logic

### Files to Create/Modify
- `src/app/staff/reservations/page.tsx` — replace inline buttons with dropdown menu, add quick-action primary button
- `src/components/reservations/ReservationDetailDrawer.tsx` — add edit mode, table reassignment, notes, full status panel (part of Task 3)
- `src/components/reservations/EditReservationModal.tsx` — new modal component
- `src/components/reservations/TableReassignmentPicker.tsx` — new component
- `src/components/reservations/StaffNoteInput.tsx` — new component
- `src/components/reservations/ReservationActionsDropdown.tsx` — new component

### Acceptance Criteria
- [ ] All valid status transitions available (context-aware per current status)
- [ ] Edit modal allows changing name, phone, email, party size, notes
- [ ] Time change re-queries availability and shows available slots
- [ ] Table reassignment shows available tables for the reservation's time
- [ ] Table reassignment conflict detection works (shows error if overlap)
- [ ] Staff notes can be appended with timestamp
- [ ] Reservations list has "..." dropdown with context-correct actions
- [ ] Primary action button (Seat/Complete) visible without opening dropdown
- [ ] Every status change creates an audit log entry
- [ ] Confirmation dialog for destructive actions (Cancel, No Show)

---

## Execution Plan

### Dependencies & Ordering

```
Task 4 (Nav) ────────────────────────────────┐
Task 5 (Auth) ───────────────────────────────┤
Task 1 (Dashboard) ← depends on Task 4 nav  │
Task 2 (Confirmation) ← independent          ├─→ Phase 1 (parallel)
Task 6 (Cancellation) ← depends on Task 2     │
Task 7 (Walk-in) ← depends on Task 4 nav     │
Task 3 (Detail Drawer) ← independent         ├─→ Phase 2
Task 8 (Extended Actions) ← depends on Task 3┘─→ Phase 3
```

### Phase 1: Foundation (parallel, ~2h each)
1. **Task 4: Nav completion** — quick, unblocks dashboard + walk-ins
2. **Task 5: Auth polish** — independent, fix login/logout/session
3. **Task 2: Confirmation page** — independent, customer-facing

### Phase 2: Core Features (~3h each)
4. **Task 1: Staff Dashboard** — needs nav done, main staff landing
5. **Task 6: Cancellation page** — needs confirmation page pattern from Task 2
6. **Task 3: Reservation Detail Drawer** — independent, but foundational for Task 8

### Phase 3: Enhancement (~2-3h each)
7. **Task 7: Walk-in Queue** — needs nav done, new page + schema change
8. **Task 8: Extended Actions** — needs detail drawer from Task 3

### Suggested Agent Assignments

| Task | Agent | Reason |
|------|-------|--------|
| Task 1 | Frontend Developer | Dashboard UI + API consumption |
| Task 2 | Frontend Developer | Customer-facing page, routing |
| Task 3 | Frontend Developer | Complex drawer component + state |
| Task 4 | Frontend Developer | Layout + responsive work |
| Task 5 | Backend Architect | Auth flow, middleware, security |
| Task 6 | Frontend Developer | Customer-facing page, public API |
| Task 7 | engineering-senior-developer | Schema change + full page + API work |
| Task 8 | Frontend Developer | Multiple components, UI complexity |

### Risk Notes
- **Task 7 (Walk-in)** requires a Prisma migration — must be done carefully to not break existing data
- **Task 5 (Auth)** touches middleware — test all routes after changes
- **Task 8 (Actions)** depends heavily on Task 3 (drawer) — must complete drawer first
- **Task 6 (Cancellation)** needs a decision on public DELETE vs dedicated cancel endpoint — recommend dedicated `/cancel` endpoint for cleaner separation