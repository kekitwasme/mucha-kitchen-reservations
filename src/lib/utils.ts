import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Date / Time Helpers ─────────────────────────────────────────

export function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function toDateOnly(d: Date | string): Date {
  const date = typeof d === 'string' ? new Date(d) : d;
  // Return at UTC midnight to avoid timezone shift issues
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function combineDateTime(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
}

// ─── Overlap Detection ──────────────────────────────────────────

/**
 * Check if two time ranges overlap.
 * Condition: a.start < b.end && a.end > b.start
 */
export function hasOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA < endB && endA > startB;
}

// ─── Turn Time Rules ────────────────────────────────────────────

/**
 * Calculate reservation duration from party size and restaurant rules.
 * Rules format: { "1-2": 90, "3-4": 105, "5-6": 120, "7+": 150 }
 */
export function getTurnTime(
  partySize: number,
  rules: Record<string, number>
): number {
  for (const [range, minutes] of Object.entries(rules)) {
    if (range === 'default') continue; // handled below
    if (range.endsWith('+')) {
      const min = parseInt(range, 10);
      if (partySize >= min) return minutes;
    } else {
      const [min, max] = range.split('-').map(Number);
      if (partySize >= min && partySize <= max) return minutes;
    }
  }
  return rules.default ?? 90; // use configured default, fallback to 90
}

// ─── Table Assignment Helpers ───────────────────────────────────

export interface AssignmentCandidate {
  tableIds: string[];
  totalCapacity: number;
  wastedSeats: number;
}

/**
 * Find the best table assignment for a party size.
 * Strategy:
 * 1. Single table with exact capacity match (best)
 * 2. Single table with smallest wasted seats
 * 3. Combined tables (MVP2+)
 */
export function findOptimalTable(
  partySize: number,
  availableTables: { id: string; capacity: number; minCapacity: number }[]
): AssignmentCandidate | null {
  const candidates: AssignmentCandidate[] = [];

  // Single table candidates
  for (const t of availableTables) {
    if (t.capacity >= partySize && t.minCapacity <= partySize) {
      candidates.push({
        tableIds: [t.id],
        totalCapacity: t.capacity,
        wastedSeats: t.capacity - partySize,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: lowest wasted seats, then fewest tables
  candidates.sort((a, b) => {
    if (a.wastedSeats !== b.wastedSeats) return a.wastedSeats - b.wastedSeats;
    return a.tableIds.length - b.tableIds.length;
  });

  return candidates[0];
}
