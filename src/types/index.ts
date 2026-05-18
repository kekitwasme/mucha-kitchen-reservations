/**
 * Mucha Kitchen — TypeScript Domain Types
 * ========================================
 *
 * Application-level types that extend or mirror Prisma-generated types.
 * Used across API routes, components, and utility functions.
 *
 * These types are kept in sync with the Prisma schema manually.
 * If the schema changes, update this file accordingly.
 *
 * @module types
 */
import { ReservationStatus, TableShape, TableArea, PaymentStatus, PaymentType, AuditAction } from '@prisma/client';

export { ReservationStatus, TableShape, TableArea, PaymentStatus, PaymentType, AuditAction };

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone: string;
  openingHours: Record<string, { open: string; close: string }>;
  turnTimeRules: Record<string, number>;
  maxPartySize: number;
  bookingWindowDays: number;
  depositRules?: { type: string; amount: number } | null;
  smsReminderMinutes: number;
  squareLocationId?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Table {
  id: string;
  restaurantId: string;
  name: string;
  capacity: number;
  minCapacity: number;
  shape: TableShape;
  area: TableArea;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  activeReservation?: ActiveReservation | null;
}

export interface ActiveReservation {
  id: string;
  customerName: string;
  partySize: number;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
}

export interface Reservation {
  id: string;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  reservationDate: Date;
  startTime: Date;
  endTime: Date;
  status: ReservationStatus;
  notes?: string;
  squareBookingId?: string;
  squareCustomerId?: string;
  depositAmount?: number;
  createdAt: Date;
  updatedAt: Date;
  tables?: Table[];
  payments?: Payment[];
  auditLogs?: AuditLog[];
}

export interface ReservationTable {
  id: string;
  reservationId: string;
  tableId: string;
}

export interface Customer {
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  email?: string;
  squareCustomerId?: string;
  visitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  restaurantId: string;
  reservationId: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  squarePaymentId?: string;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilityRule {
  id: string;
  restaurantId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotInterval: number;
  maxCovers: number;
  active: boolean;
}

export interface BlockedTime {
  id: string;
  restaurantId: string;
  startTime: Date;
  endTime: Date;
  reason?: string;
  affectsAll: boolean;
  tableIds: string[];
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  restaurantId: string;
  reservationId?: string;
  staffUserId?: string;
  action: AuditAction;
  details?: unknown;
  ipAddress?: string;
  createdAt: Date;
}

export interface StaffUser {
  id: string;
  restaurantId: string;
  userId: string;
  role: string;
  active: boolean;
  createdAt: Date;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  availableTableIds: string[];
  availableTableNames: string[];
}

export interface DashboardSummary {
  date: string;
  total: number;
  byStatus: Record<ReservationStatus, number>;
  upcomingArrivals: UpcomingArrival[];
}

export interface UpcomingArrival {
  id: string;
  customerName: string;
  partySize: number;
  startTime: string;
  tableNames: string[];
  status: ReservationStatus;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
