import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────

export const TableShapeEnum = z.enum(['square', 'booth']);
export const TableAreaEnum = z.enum(['indoor', 'outdoor', 'bar', 'private_room']);
export const ReservationStatusEnum = z.enum([
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
]);

export const ReservationSourceEnum = z.enum(['online', 'walk_in', 'phone']);
export const PaymentStatusEnum = z.enum(['pending', 'completed', 'failed', 'refunded']);
export const PaymentTypeEnum = z.enum(['deposit', 'per_person_deposit', 'no_show_fee', 'full_prepayment']);

// ─── Tables ─────────────────────────────────────────────────────

export const getTablesQuerySchema = z.object({
  area: TableAreaEnum.optional(),
  active: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .default(true),
});

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

export const createReservationSchema = z.object({
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(5).max(20),
  customerEmail: z.string().email().optional(),
  partySize: z.number().min(1).max(12),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
  preferredTableIds: z.array(z.string()).optional(),
  source: ReservationSourceEnum.optional().default('online'),
  status: ReservationStatusEnum.optional(), // walk-ins may pass 'seated' or 'pending'
});

export const listReservationsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
  status: z.string().optional(), // comma-separated
  source: ReservationSourceEnum.optional(),
  search: z.string().optional(),
  tableId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

export const updateReservationSchema = z.object({
  customerName: z.string().min(1).max(100).optional(),
  customerPhone: z.string().min(5).max(20).optional(),
  customerEmail: z.string().email().optional().nullable(),
  partySize: z.number().min(1).max(12).optional(),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time').optional(),
  status: ReservationStatusEnum.optional(),
  notes: z.string().max(500).optional().nullable(),
  tableIds: z.array(z.string()).optional(),
  source: ReservationSourceEnum.optional(),
});

// ─── Availability ────────────────────────────────────────────────

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().min(1).max(12),
});

// ─── Dashboard ──────────────────────────────────────────────────

// No query params needed for today/upcoming

// ─── Square Webhook ─────────────────────────────────────────────

// Webhook body is untyped; we just parse known fields

export const squareWebhookEventSchema = z.object({
  type: z.string(),
  event_id: z.string().optional(),
  data: z.unknown().optional(),
});

// ─── Admin Settings ─────────────────────────────────────────────

export const updateSettingsSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  openingHours: z.record(z.string(), z.any()).optional(),
  turnTimeRules: z.record(z.string(), z.any()).optional(),
  maxPartySize: z.number().min(1).optional(),
  bookingWindowDays: z.number().min(1).optional(),
  depositRules: z.record(z.string(), z.any()).optional().nullable(),
  smsReminderMinutes: z.number().min(0).optional(),
});