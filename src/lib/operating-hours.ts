/**
 * Mucha Kitchen — Operating Hours Engine
 * =========================================
 *
 * Handles:
 * - Segmented operating hours (multiple segments per day)
 * - Block-out window filtering
 * - Special hours overrides (holiday overrides)
 *
 * @module operating-hours
 * @see {@link ./table-assignment.ts} — slot generation engine
 */
import type { PrismaClient } from '@prisma/client';

export interface OperatingSegment {
  label?: string;
  startTime: string; // "09:00"
  endTime: string;   // "11:00"
}

export interface SpecialHours {
  date: string;      // "YYYY-MM-DD"
  isClosed: boolean;
  segments?: OperatingSegment[];
  note?: string;
}

/**
 * Convert a time string like "18:30" to minutes from midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check if two segments overlap.
 */
export function segmentsOverlap(a: OperatingSegment, b: OperatingSegment): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Validate that segments don't overlap and that start < end.
 * Returns null if valid, error message otherwise.
 */
export function validateSegments(segments: OperatingSegment[]): string | null {
  for (const seg of segments) {
    if (timeToMinutes(seg.startTime) >= timeToMinutes(seg.endTime)) {
      return `Segment "${seg.startTime} – ${seg.endTime}" has invalid times (start must be before end)`;
    }
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segmentsOverlap(segments[i], segments[j])) {
        return `Segments "${segments[i].startTime} – ${segments[i].endTime}" and "${segments[j].startTime} – ${segments[j].endTime}" overlap`;
      }
    }
  }
  return null;
}

/**
 * Get the day-of-week name (lowercase) from a Date object.
 */
export function getDayOfWeekName(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

/**
 * Fetch operating segments for a given date, considering special hours overrides.
 */
export async function getOperatingSegments(
  restaurantId: string,
  date: Date,
  prisma: PrismaClient
): Promise<{ segments: OperatingSegment[]; fromSpecial: boolean }> {
  const dateStr = date.toISOString().split('T')[0];

  // Check special hours override first
  const special = await prisma.specialHoursOverride.findUnique({
    where: { restaurantId_date: { restaurantId, date: new Date(dateStr + 'T00:00:00.000Z') } },
  });

  if (special) {
    if (special.isClosed) {
      return { segments: [], fromSpecial: true };
    }
    const segments = (special.segments as unknown as OperatingSegment[]) || [];
    return { segments, fromSpecial: true };
  }

  // Fall back to day-of-week availability rules
  const rules = await prisma.availabilityRule.findMany({
    where: { restaurantId, dayOfWeek: date.getDay(), active: true },
    orderBy: { sortOrder: 'asc' },
  });

  const segments: OperatingSegment[] = rules.map((r) => ({
    label: r.label || undefined,
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  return { segments, fromSpecial: false };
}

/**
 * Get the earliest bookable time for a date, applying the block-out window.
 * If the block-out pushes past all segments, returns null.
 */
export function getEarliestBookableTime(
  segments: OperatingSegment[],
  blockOutHours: number,
  now: Date
): Date | null {
  if (segments.length === 0) return null;

  const earliestBooking = new Date(now.getTime() + blockOutHours * 60 * 60 * 1000);

  // Find the first segment that still has available time after the block-out
  for (const seg of segments) {
    const segEnd = timeToMinutes(seg.endTime);
    const earliestMins = earliestBooking.getHours() * 60 + earliestBooking.getMinutes();

    if (earliestMins < segEnd) {
      return earliestBooking;
    }
  }

  return null; // Block-out window exceeds all segments
}
