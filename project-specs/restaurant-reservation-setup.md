# Restaurant Reservation & Table Management System — Project Spec

## Project Overview

Build a modern restaurant reservation and table assignment platform using:
- Next.js for frontend + backend
- PostgreSQL for persistence
- Square APIs for:
 - booking records
 - customer notifications
 - SMS reminders
 - payment/deposit handling

The application itself is the source of truth for all reservation logic.

Square is used as:
- notification layer
- payment layer
- customer management layer
- external booking sync layer

The system must support:
- visual floor plan management
- real-time table assignment
- booking conflict detection
- reservation lifecycle management
- staff operational workflows

---

# Core Architecture

Customer UI
 ↓
Next.js Frontend
 ↓
Next.js API / Backend
 ↓
Postgres Database
 ↓
Reservation Engine
 ↓
Square API Adapter
 ↓
Square Bookings API
Square Customers API
Square Payments API

---

# Tech Stack

## Frontend
- Next.js
- React
- TypeScript
- TailwindCSS
- React Query / TanStack Query
- Zustand or Redux
- React Konva (for floor plan editor)

## Backend
- Next.js Route Handlers or API routes
- TypeScript
- Prisma ORM or Drizzle ORM

## Database
- sup-abase

## External APIs
- Square Bookings API
- Square Customers API
- Square Payments API
- Square Webhooks

## Hosting
Preferred:
- Vercel



---

# 1. Reservation Engine

The application must own all reservation logic.

Square must NOT determine:
- table availability
- seating logic
- overlap detection
- turn duration
- table assignment

## Reservation Fields

Reservation {
 id
 customerName
 customerPhone
 customerEmail
 partySize
 reservationDate
 startTime
 endTime
 status
 notes
 tableIds[]
 squareBookingId
 squareCustomerId
 depositAmount
 createdAt
 updatedAt
}

## Reservation Statuses

pending
confirmed
seated
completed
cancelled
no_show

---

# 2. Table Management

## Table Fields

Table {
 id
 name
 capacity
 minCapacity
 shape
 area
 x
 y
 width
 height
 active
}

## Table Areas

Support:
- indoor
- outdoor
- bar
- private room

## Table Shapes

Support:
- square
- round
- booth
- rectangle

---

# 3. Floor Plan UI

## Requirements

Interactive restaurant floor plan.

### Features
- visual table icons
- drag-and-drop positioning
- zoom/pan
- click table to view bookings
- show booking status by time
- responsive UI

## Table States

available
booked
occupied
reserved_soon

## Visual Behaviour

Tables must update live based on:
- selected date
- selected time
- active reservations

---

# 4. Availability Logic

## Conflict Detection

System must prevent overlapping bookings.

Overlap condition:

reservation.startTime < selectedEndTime &&
reservation.endTime > selectedStartTime

## Turn Time Rules

Dynamic reservation durations.

Example:
- 1-2 guests → 90 min
- 3-4 guests → 105 min
- 5-6 guests → 120 min
- 7+ guests → custom

Rules must be configurable.

---

# 5. Table Assignment Engine

## Requirements

System must:
- assign optimal table
- support combined tables
- minimise wasted seats
- prevent impossible seating layouts

## Example

Party of 2
→ prefer table capacity 2 or 4

Party of 7
→ combine tables 3 + 4

---

# 6. Staff Dashboard

## Main Dashboard Features
- floor plan view
- reservation timeline
- booking search
- today's bookings
- upcoming arrivals
- walk-ins
- waitlist
- no-show management

## Staff Actions
- seat guest
- move reservation
- reassign table
- cancel reservation
- mark no-show
- complete reservation
- block table
- merge tables

---

# 7. Booking Creation Flow

## Customer Flow

Select date
→ Select party size
→ View available times
→ Enter customer details
→ Optional deposit/payment
→ Confirm reservation
→ Create Square booking
→ Send SMS confirmation

---

# 8. Square Integration

## Responsibilities of Square

Use Square for:
- SMS reminders
- booking confirmations
- customer profiles
- deposits/payments
- webhook notifications

Do NOT use Square for:
- seating logic
- table optimisation
- floor plans
- availability calculation

---

# 9. Square API Flow

## Reservation Creation

1. Internal reservation created
2. Internal table assignment completed
3. Create/find Square customer
4. Create Square booking
5. Store Square booking ID
6. Sync webhook updates

## Webhooks

Handle:
- booking.updated
- booking.cancelled
- payment.updated

---

# 10. Payments & Deposits

Support:
- fixed deposit
- per-person deposit
- no-show fee
- full prepayment

## Example

$10 per guest
Party of 4
→ $40 deposit

---

# 11. Admin Settings

## Configurable Rules
- opening hours
- max party size
- turn times
- booking windows
- blackout dates
- SMS reminder timing
- deposit rules

---

# 12. Non-Functional Requirements

## Performance
- floor plan updates < 100ms
- reservation search < 200ms

## Reliability

Must prevent:
- double bookings
- race conditions

Use:
- DB transactions
- row locking
- optimistic concurrency

---

# 13. MVP Scope

## MVP 1
- reservations
- floor plan
- table assignment
- Square sync
- SMS confirmations

## MVP 2
- drag/drop floor plan editor
- deposits
- waitlist
- combined tables

## MVP 3
- analytics
- AI table optimisation
- forecasting
- multi-location support

---

# 14. Recommended Database Tables

restaurants
tables
table_combinations
reservations
reservation_tables
customers
payments
availability_rules
blocked_times
audit_logs
staff_users

---

# 15. UI Views

## Staff Views
- Live Floor Plan
- Timeline View
- Reservation List
- Table Editor
- Walk-In Queue

## Customer Views
- Booking Widget
- Booking Confirmation
- Modify Reservation
- Cancellation Page

---

# 16. Security Requirements

- authentication
- role-based access
- API validation
- webhook signature verification
- rate limiting
- audit logs

---

# 17. Future Expansion

Potential future features:
- QR ordering
- POS sync
- kitchen pacing
- waitlist SMS
- loyalty
- analytics
- multi-venue support
- AI seating optimisation
- predictive no-show scoring

---

# Key Architectural Principle

The application database is the canonical reservation system.

Square is an external service integration layer only.

Never rely on Square as the reservation engine.
