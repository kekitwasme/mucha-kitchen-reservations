/**
 * Mucha Kitchen — Table Availability API (Customer-Facing)
 * =========================================================
 *
 * GET /api/tables/availability?date=YYYY-MM-DD&time=HH:MM&partySize=N
 *
 * Returns every table with its availability status for a specific
 * date/time/partySize combo, plus position data so the floor plan
 * can be rendered client-side.
 *
 * Status mapping:
 *   available  → table is free for the full turn-time window
 *   booked     → table is occupied by an existing reservation
 *   unsuitable → table capacity < partySize (always shown, greyed)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getTurnTime, combineDateTime, toDateOnly } from '@/lib/utils';

const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.coerce.number().min(1).max(50),
});

export type TableAvailabilityStatus = 'available' | 'booked' | 'unsuitable';

export interface TableAvailability {
  id: string;
  name: string;
  capacity: number;
  minCapacity: number;
  shape: 'square' | 'booth';
  area: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: TableAvailabilityStatus;
  suitable: boolean;
  conflict?: {
    customerName: string;
    partySize: number;
    startTime: string;
    endTime: string;
  } | null;
}

// GET /api/tables/availability
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = {
      date: searchParams.get('date') ?? undefined,
      time: searchParams.get('time') ?? undefined,
      partySize: searchParams.get('partySize') ?? undefined,
    };

    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse('Invalid query parameters', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const { date, time, partySize } = parsed.data;
    const dateObj = toDateOnly(new Date(date + 'T00:00:00'));
    const startTime = combineDateTime(dateObj, time);

    const restaurant = RESTAURANT_ID
      ? await prisma.restaurant.findUnique({ where: { id: RESTAURANT_ID } })
      : await prisma.restaurant.findFirst();

    if (!restaurant) {
      return errorResponse('Restaurant not found', 'NOT_FOUND', 404);
    }

    const turnTime = getTurnTime(partySize, restaurant.turnTimeRules as Record<string, number>);
    const endTime = new Date(startTime.getTime() + turnTime * 60000);

    // Find all reservations overlapping the requested window
    const occupiedReservations = await prisma.reservation.findMany({
      where: {
        restaurantId: restaurant.id,
        status: { notIn: ['cancelled', 'no_show'] },
        AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
      },
      select: {
        id: true,
        customerName: true,
        partySize: true,
        startTime: true,
        endTime: true,
        reservationTables: { select: { tableId: true } },
      },
    });

    const occupiedTableIds = new Map<string, (typeof occupiedReservations)[0]>();
    for (const r of occupiedReservations) {
      for (const rt of r.reservationTables) {
        occupiedTableIds.set(rt.tableId, r);
      }
    }

    // Fetch all tables with position data
    const tables = await prisma.table.findMany({
      where: { restaurantId: restaurant.id, active: true },
      select: {
        id: true,
        name: true,
        capacity: true,
        minCapacity: true,
        shape: true,
        area: true,
        x: true,
        y: true,
        width: true,
        height: true,
        rotation: true,
      },
      orderBy: [{ area: 'asc' }, { name: 'asc' }],
    });

    const result: TableAvailability[] = tables.map((t) => {
      const suitable = t.capacity >= partySize;
      const conflict = occupiedTableIds.get(t.id) ?? null;
      let status: TableAvailabilityStatus;
      if (!suitable) {
        status = 'unsuitable';
      } else if (conflict) {
        status = 'booked';
      } else {
        status = 'available';
      }

      return {
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        minCapacity: t.minCapacity,
        shape: t.shape,
        area: t.area,
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        rotation: t.rotation,
        status,
        suitable,
        conflict: conflict
          ? {
              customerName: conflict.customerName,
              partySize: conflict.partySize,
              startTime: `${String(conflict.startTime.getHours()).padStart(2, '0')}:${String(conflict.startTime.getMinutes()).padStart(2, '0')}`,
              endTime: `${String(conflict.endTime.getHours()).padStart(2, '0')}:${String(conflict.endTime.getMinutes()).padStart(2, '0')}`,
            }
          : null,
      };
    });

    return NextResponse.json({
      date,
      time,
      partySize,
      turnTimeMinutes: turnTime,
      tables: result,
    });
  } catch (err) {
    console.error('[GET /api/tables/availability]', err);
    return errorResponse('Failed to fetch table availability', 'INTERNAL_ERROR', 500);
  }
}
