/**
 * Mucha Kitchen — Zod Validation Schemas
 * ======================================
 *
 * Centralised request/response validation schemas for all API routes.
 * Every endpoint validates input against these schemas before processing.
 *
 * Enums mirror Prisma schema values to keep client and server aligned.
 *
 * @module schemas
 * @see https://zod.dev/
 */
import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────

/** Table shape options: square (standard) or booth (bench-style). */
export const TableShapeEnum = z.enum(['square', 'booth']);

/** Seating area options within the restaurant. */
export const TableAreaEnum = z.enum(['indoor', 'outdoor', 'bar', 'private_room']);

/** Reservation lifecycle states. */
export const ReservationStatusEnum = z.enum([
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
]);

/** How the reservation was created (online widget, walk-in, phone, Square sync). */
export const ReservationSourceEnum = z.enum(['online', 'walk_in', 'phone', 'square']);

/** Payment lifecycle states. */
export const PaymentStatusEnum = z.enum(['pending', 'completed', 'failed', 'refunded']);

/** Types of financial transactions associated with a reservation. */
export const PaymentTypeEnum = z.enum(['deposit', 'per_person_deposit', 'no_show_fee', 'full_prepayment']);

// ─── Tables ─────────────────────────────────────────────────────

/** Query parameters for GET /api/tables — filter by area and active flag. */
export const getTablesQuerySchema = z.object({
  area: TableAreaEnum.optional(),
  active: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .default(true),
});

/** Body schema for POST /api/tables — create a new table. */
export const createTableSchema = z.object({
  name: z.string().min(1).max(20),
  capacity: z.number().min(1).max(50),
  minCapacity: z.number().min(1).optional().default(1),
  shape: TableShapeEnum,
  area: TableAreaEnum,
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
  width: z.number().optional().default(60),
  height: z.number().optional().default(60),
  rotation: z.number().optional().default(0),
});

/** Body schema for PATCH /api/tables/[id] — update an existing table. */
export const updateTableSchema = z.object({
  name: z.string().min(1).max(20).optional(),
  capacity: z.number().min(1).max(50).optional(),
  minCapacity: z.number().min(1).optional(),
  shape: TableShapeEnum.optional(),
  area: TableAreaEnum.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  active: z.boolean().optional(),
});

// ─── Reservations ───────────────────────────────────────────────

/** Body schema for POST /api/reservations — customer creates a booking. */
export const createReservationSchema = z.object({
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(5).max(20),
  customerEmail: z.string().email().optional(),
  partySize: z.number().min(1).max(12),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  startTime: z.string().regex(/^\d{2}:\d{2}$/),            // HH:MM
  notes: z.string().max(500).optional(),
  dietaryRequirements: z.string().max(200).optional(),
  occasion: z.enum(['birthday', 'anniversary', 'business', 'other', 'date_night', 'none']).optional().default('none'),
  highChairs: z.number().min(0).max(10).optional().default(0),
  isReturningGuest: z.boolean().optional().default(false),
  guestType: z.enum(['new', 'returning', 'regular']).optional().default('new'),
  preferredTableIds: z.array(z.string()).optional(),
  seatingChoice: z.enum(['auto', 'manual']).optional().default('auto'),
  tableId: z.string().optional(),
  source: ReservationSourceEnum.optional().default('online'),
  status: ReservationStatusEnum.optional(), // walk-ins may pass 'seated' or 'pending'
  stripeSetupIntentId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  stripePaymentMethodId: z.string().optional(),
});

/** Query parameters for GET /api/reservations — list with filters. */
export const listReservationsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
  status: z.string().optional(), // comma-separated list of statuses
  source: ReservationSourceEnum.optional(),
  search: z.string().optional(),
  tableId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

/** Body schema for PATCH /api/reservations/[id] — edit a reservation. */
export const updateReservationSchema = z.object({
  customerName: z.string().min(1).max(100).optional(),
  customerPhone: z.string().min(5).max(20).optional(),
  customerEmail: z.string().email().optional().nullable(),
  partySize: z.number().min(1).max(12).optional(),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time').optional(),
  status: ReservationStatusEnum.optional(),
  notes: z.string().max(500).optional().nullable(),
  dietaryRequirements: z.string().max(200).optional().nullable(),
  occasion: z.enum(['birthday', 'anniversary', 'business', 'other', 'date_night', 'none']).optional(),
  highChairs: z.number().min(0).max(10).optional(),
  isReturningGuest: z.boolean().optional(),
  guestType: z.enum(['new', 'returning', 'regular']).optional(),
  tableIds: z.array(z.string()).optional(),
  source: ReservationSourceEnum.optional(),
  stripeSetupIntentId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  stripePaymentMethodId: z.string().optional(),
});

// ─── Availability ────────────────────────────────────────────────

/** Query parameters for GET /api/availability — check open slots for a date + party size. */
export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  partySize: z.coerce.number().min(1).max(12),
});

// ─── Dashboard ──────────────────────────────────────────────────

// Dashboard endpoints (GET /api/dashboard, GET /api/dashboard/today, etc.)
// have no query parameters — they derive context from the authenticated session.

// ─── Square Webhook ─────────────────────────────────────────────

/** Body schema for Square webhook events. Fields vary by event type. */
export const squareWebhookEventSchema = z.object({
  type: z.string(),
  event_id: z.string().optional(),
  data: z.unknown().optional(),
});

// ─── Admin Settings ─────────────────────────────────────────────

/** Body schema for PATCH /api/admin/settings — update restaurant configuration. */
export const updateSettingsSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  openingHours: z.record(z.string(), z.any()).optional(),
  turnTimeRules: z.record(z.string(), z.any()).optional(),
  maxPartySize: z.number().min(1).optional(),
  bookingWindowDays: z.number().min(1).optional(),
  blockOutHours: z.number().min(0).optional(),
  depositRules: z.record(z.string(), z.any()).optional().nullable(),
  smsReminderMinutes: z.number().min(0).optional(),
});
