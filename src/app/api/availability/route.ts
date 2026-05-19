/**
 * Mucha Kitchen — Availability API (v2)
 * =====================================
 *
 * GET /api/availability?date=YYYY-MM-DD&partySize=N
 *
 * Returns available time slots with segmented operating hours
 * and block-out window applied.
 *
 * @module api/availability
 * @see {@link ../../lib/operating-hours.ts} — operating hours engine
 * @see {@link ../../lib/table-assignment.ts} — slot generation engine
 */
import { NextRequest, NextResponse } from 'next/server';
import { availabilityQuerySchema } from '@/lib/schemas';
import { generateAvailabilitySlots } from '@/lib/table-assignment';
import { getOperatingSegments, getEarliestBookableTime } from '@/lib/operating-hours';
import { prisma } from '@/lib/prisma';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

function nowInTimezone(timezone: string): Date {
  // For MVP, use local server time. Production would use timezone-aware Date handling.
  return new Date();
}

// GET /api/availability — Query available time slots with block-out + operating hours
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawParams = {
      date: searchParams.get('date') ?? undefined,
      partySize: searchParams.get('partySize') ?? undefined,
    };

    const parsed = availabilityQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return errorResponse('Invalid query parameters', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const { date, partySize } = parsed.data;
    const dateObj = new Date(date + 'T00:00:00');

    const restaurantId = process.env.RESTAURANT_ID || '';
    if (!restaurantId) {
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return errorResponse('No restaurant configured', 'NOT_CONFIGURED', 500);
      }
      const slots = await generateAvailabilitySlots(restaurant.id, dateObj, partySize);
      return NextResponse.json({ date, partySize, slots });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        blockOutHours: true,
        timezone: true,
        turnTimeRules: true,
        maxPartySize: true,
      },
    });

    if (!restaurant) {
      return errorResponse('Restaurant not found', 'NOT_FOUND', 404);
    }

    // Fetch operating segments for the date
    const { segments, fromSpecial } = await getOperatingSegments(restaurantId, dateObj, prisma);

    // Check if the date is closed (no segments and not a special override)
    if (segments.length === 0) {
      return NextResponse.json({
        date,
        partySize,
        slots: [],
        dayClosed: true,
        blockOutHours: Number(restaurant.blockOutHours),
      });
    }

    // Apply block-out window: filter segments to only those with available time
    const now = nowInTimezone(restaurant.timezone);
    const isToday = dateObj.toDateString() === now.toDateString();

    let effectiveSegments = segments;
    if (isToday && Number(restaurant.blockOutHours) > 0) {
      const earliestBooking = new Date(now.getTime() + Number(restaurant.blockOutHours) * 60 * 60 * 1000);
      const earliestMins = earliestBooking.getHours() * 60 + earliestBooking.getMinutes();
      effectiveSegments = segments.filter((seg) => {
        const segEnd = parseInt(seg.endTime.split(':')[0]) * 60 + parseInt(seg.endTime.split(':')[1]);
        return earliestMins < segEnd;
      });
    }

    if (effectiveSegments.length === 0) {
      return NextResponse.json({
        date,
        partySize,
        slots: [],
        blockOutHours: Number(restaurant.blockOutHours),
        dayClosed: false,
        allSegmentsBlocked: true,
      });
    }

    // Generate slots using the table-assignment engine
    const slots = await generateAvailabilitySlots(restaurantId, dateObj, partySize);

    // Filter slots to only those within effective operating segments + block-out
    const filteredSlots = slots.filter((slot) => {
      const slotMins = parseInt(slot.startTime.split(':')[0]) * 60 + parseInt(slot.startTime.split(':')[1]);
      for (const seg of effectiveSegments) {
        const segStart = parseInt(seg.startTime.split(':')[0]) * 60 + parseInt(seg.startTime.split(':')[1]);
        const segEnd = parseInt(seg.endTime.split(':')[0]) * 60 + parseInt(seg.endTime.split(':')[1]);
        if (slotMins >= segStart && slotMins < segEnd) {
          // Apply block-out on today
          if (isToday && Number(restaurant.blockOutHours) > 0) {
            const earliestBooking = new Date(now.getTime() + Number(restaurant.blockOutHours) * 60 * 60 * 1000);
            const earliestMins = earliestBooking.getHours() * 60 + earliestBooking.getMinutes();
            return slotMins >= earliestMins;
          }
          return true;
        }
      }
      return false;
    });

    return NextResponse.json({
      date,
      partySize,
      slots: filteredSlots,
      blockOutHours: Number(restaurant.blockOutHours),
      dayClosed: false,
      fromSpecialHours: fromSpecial,
      segments: effectiveSegments.map((s) => ({
        label: s.label,
        start: s.startTime,
        end: s.endTime,
      })),
    });
  } catch (err) {
    console.error('[GET /api/availability]', err);
    return errorResponse('Failed to fetch availability', 'INTERNAL_ERROR', 500);
  }
}
