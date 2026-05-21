/**
 * Mucha Kitchen — Zustand State Stores
 * =====================================
 *
 * Global client-side state management using Zustand.
 * One store per domain: booking flow, floor plan, reservation list, sidebar.
 *
 * @module store
 * @see https://docs.pmnd.rs/zustand
 */
import { create } from 'zustand';

// ─── Booking Flow ───────────────────────────────────────────────

/** Steps in the customer booking wizard. */
export type BookingStep = 'date' | 'party' | 'time' | 'details' | 'payment' | 'confirmation';

interface BookingState {
  step: BookingStep;
  date: Date | undefined;
  partySize: number;
  selectedTime: string | null;
  selectedTableId: string | null;
  selectedGroupId: string | null;
  seatingChoice: 'auto' | 'manual' | null;
  // Payment state (used for complete-booking flow, not initial booking)
  paymentIntentId: string | null;
  clientSecret: string | null;
  holdAmount: number;
  // SetupIntent state (card saved at booking time)
  setupIntentId: string | null;
  setupClientSecret: string | null;
  stripeCustomerId: string | null;
  // Reservation ID after creation
  reservationId: string | null;
  setSelectedTableId: (id: string | null) => void;
  setSelectedGroupId: (id: string | null) => void;
  setSeatingChoice: (choice: 'auto' | 'manual' | null) => void;
  setStep: (step: BookingStep) => void;
  setDate: (date: Date | undefined) => void;
  setPartySize: (size: number) => void;
  setSelectedTime: (time: string | null) => void;
  setPaymentData: (data: { paymentIntentId: string; clientSecret: string; holdAmount: number }) => void;
  setSetupData: (data: { setupIntentId: string; setupClientSecret: string; stripeCustomerId: string }) => void;
  setReservationId: (id: string | null) => void;
  reset: () => void;
}

const initialBookingState = {
  step: 'date' as BookingStep,
  date: undefined,
  partySize: 2,
  selectedTime: null,
  selectedTableId: null,
  selectedGroupId: null,
  seatingChoice: null,
  // Payment fields are kept in store but no longer part of initial booking flow
  paymentIntentId: null,
  clientSecret: null,
  holdAmount: 0,
  // SetupIntent fields
  setupIntentId: null,
  setupClientSecret: null,
  stripeCustomerId: null,
  reservationId: null,
};

/** Manages the customer booking wizard state (step, date, party size, time slot, table selection). */
export const useBookingStore = create<BookingState>((set) => ({
  ...initialBookingState,
  setStep: (step) => set({ step }),
  setDate: (date) => set({ date, step: 'party' }),
  setPartySize: (partySize) => set({ partySize, step: 'time' }),
  setSelectedTime: (selectedTime) => set({ selectedTime }),
  setSelectedTableId: (selectedTableId) => set({ selectedTableId, selectedGroupId: null }),
  setSelectedGroupId: (selectedGroupId) => set({ selectedGroupId, selectedTableId: null }),
  setSeatingChoice: (seatingChoice) => set({ seatingChoice }),
  setPaymentData: (data) => set({ paymentIntentId: data.paymentIntentId, clientSecret: data.clientSecret, holdAmount: data.holdAmount }),
  setSetupData: (data) => set({ setupIntentId: data.setupIntentId, setupClientSecret: data.setupClientSecret, stripeCustomerId: data.stripeCustomerId }),
  setReservationId: (reservationId) => set({ reservationId }),
  reset: () => set(initialBookingState),
}));

// ─── Floor Plan ─────────────────────────────────────────────────

interface FloorPlanState {
  selectedDate: Date;
  selectedTime: string;
  zoom: number;
  isEditMode: boolean;
  viewMode: 'live' | 'preview';
  setSelectedDate: (date: Date) => void;
  setSelectedTime: (time: string) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setEditMode: (mode: boolean) => void;
  toggleEditMode: () => void;
  setViewMode: (mode: 'live' | 'preview') => void;
}

/**
 * Manages the interactive floor plan state:
 * - selectedDate / selectedTime: what snapshot of table occupancy to display
 * - zoom: canvas zoom level (clamped 0.3–3.0)
 * - isEditMode: whether the user can drag/resize tables
 * - viewMode: 'live' (real-time) or 'preview' (future date/time simulation)
 */
export const useFloorPlanStore = create<FloorPlanState>((set) => ({
  selectedDate: new Date(),
  selectedTime: '18:00',
  zoom: 1,
  isEditMode: false,
  viewMode: 'live',
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedTime: (selectedTime) => set({ selectedTime }),
  setZoom: (zoom) => set({ zoom: Math.max(0.3, Math.min(3, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(3, s.zoom + 0.2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.3, s.zoom - 0.2) })),
  setEditMode: (isEditMode) => set({ isEditMode }),
  toggleEditMode: () => set((s) => ({ isEditMode: !s.isEditMode })),
  setViewMode: (viewMode) => set({ viewMode }),
}));

// ─── Reservation List ───────────────────────────────────────────

interface ReservationListState {
  dateFilter: string;
  todayDate: string;
  statusFilter: string;
  searchQuery: string;
  selectedReservationId: string | null;
  setDateFilter: (date: string) => void;
  setStatusFilter: (status: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedReservationId: (id: string | null) => void;
}

const todayDateStr = new Date().toISOString().split('T')[0];

/**
 * Manages the staff reservation list filters and selection state.
 * Defaults to today's date; staff can filter by date, status, or search text.
 */
export const useReservationListStore = create<ReservationListState>((set) => ({
  dateFilter: todayDateStr,
  todayDate: todayDateStr,
  statusFilter: '',
  searchQuery: '',
  selectedReservationId: null,
  setDateFilter: (dateFilter) => set({ dateFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedReservationId: (selectedReservationId) => set({ selectedReservationId }),
}));

// ─── Sidebar ────────────────────────────────────────────────────

interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  open: () => void;
}

/** Controls the collapsible sidebar on mobile/desktop staff pages. */
export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  open: () => set({ isOpen: true }),
}));