import { create } from 'zustand';

export type BookingStep = 'date' | 'party' | 'time' | 'details';

interface BookingState {
  step: BookingStep;
  date: Date | undefined;
  partySize: number;
  selectedTime: string | null;
  setStep: (step: BookingStep) => void;
  setDate: (date: Date | undefined) => void;
  setPartySize: (size: number) => void;
  setSelectedTime: (time: string | null) => void;
  reset: () => void;
}

const initialBookingState = {
  step: 'date' as BookingStep,
  date: undefined,
  partySize: 2,
  selectedTime: null,
};

export const useBookingStore = create<BookingState>((set) => ({
  ...initialBookingState,
  setStep: (step) => set({ step }),
  setDate: (date) => set({ date, step: 'party' }),
  setPartySize: (partySize) => set({ partySize, step: 'time' }),
  setSelectedTime: (selectedTime) => set({ selectedTime, step: 'details' }),
  reset: () => set(initialBookingState),
}));

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

interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  open: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  open: () => set({ isOpen: true }),
}));