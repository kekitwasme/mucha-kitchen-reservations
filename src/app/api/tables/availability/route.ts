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

export interface FloorObjectData {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  opacity: number;
  zIndex: number;
}

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

export interface TableGroupAvailability {
  id: string;
  name: string;
  tableIds: string[];
  combinedCapacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  status: TableAvailabilityStatus;
  suitable: boolean;
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

    // Fetch all active table groups with members and their tables
    const tableGroups = await prisma.tableGroup.findMany({
      where: { restaurantId: restaurant.id, active: true },
      include: {
        groupMembers: {
          include: {
            table: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Fetch floor objects for visual context
    const floorObjects = await prisma.floorObject.findMany({
      where: { restaurantId: restaurant.id },
      select: {
        id: true,
        type: true,
        label: true,
        x: true,
        y: true,
        width: true,
        height: true,
        rotation: true,
        color: true,
        opacity: true,
        zIndex: true,
      },
      orderBy: [{ zIndex: 'asc' }, { createdAt: 'asc' }],
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

    // Build tableGroups response
    const tableGroupResults: TableGroupAvailability[] = tableGroups.map((tg) => {
      const memberTables = tg.groupMembers.map((gm) => gm.table);
      const tableIds = memberTables.map((t) => t.id);

      // Combined capacity from members (fallback to stored combinedCapacity if needed)
      const combinedCapacity = memberTables.reduce((sum, t) => sum + t.capacity, 0);

      // Bounding box with 10px padding
      const minX = Math.min(...memberTables.map((t) => t.x));
      const minY = Math.min(...memberTables.map((t) => t.y));
      const maxRight = Math.max(...memberTables.map((t) => t.x + t.width));
      const maxBottom = Math.max(...memberTables.map((t) => t.y + t.height));
      const padding = 10;
      const x = minX - padding;
      const y = minY - padding;
      const width = maxRight - minX + padding * 2;
      const height = maxBottom - minY + padding * 2;

      // Status: available only if ALL members available and suitable
      const anyBooked = memberTables.some((t) => occupiedTableIds.has(t.id));
      const suitable = combinedCapacity >= partySize;

      let status: TableAvailabilityStatus;
      if (!suitable) {
        status = 'unsuitable';
      } else if (anyBooked) {
        status = 'booked';
      } else {
        status = 'available';
      }

      return {
        id: tg.id,
        name: tg.name,
        tableIds,
        combinedCapacity,
        x,
        y,
        width,
        height,
        status,
        suitable,
      };
    });

    return NextResponse.json({
      date,
      time,
      partySize,
      turnTimeMinutes: turnTime,
      tables: result,
      tableGroups: tableGroupResults,
      floorObjects,
    });
  } catch (err) {
    console.error('[GET /api/tables/availability]', err);
    return errorResponse('Failed to fetch table availability', 'INTERNAL_ERROR', 500);
  }
}
