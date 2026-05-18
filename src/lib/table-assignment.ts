/**
 * Mucha Kitchen — Table Assignment Engine
 * ========================================
 *
 * Core logic for finding available tables, assigning optimal tables to reservations,
 * and generating time-slot availability for the booking widget.
 *
 * Key algorithms:
 * - `findAvailableTables`: overlap detection using Prisma query + in-memory filter
 * - `assignTables`: greedy assignment (exact match → smallest wasted seats → table groups)
 * - `generateAvailabilitySlots`: batched 3-query approach (was 144+ queries before optimisation)
 *
 * @module table-assignment
 */
import { prisma } from './prisma';
import { getTurnTime } from './utils';

export interface AvailableTable {
  id: string;
  name: string;
  capacity: number;
  minCapacity: number;
}

export interface AvailableGroup {
  id: string;
  name: string;
  combinedCapacity: number;
  tableIds: string[];
  tableNames: string[];
}

/**
 * Find all tables that are available for a given time range.
 * Uses a raw query for overlap detection.
 */
export async function findAvailableTables(
  restaurantId: string,
  startTime: Date,
  endTime: Date,
  excludeReservationId?: string
): Promise<{ tables: AvailableTable[]; occupiedIds: string[] }> {
  const occupiedReservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      status: { notIn: ['cancelled', 'no_show'] },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      AND: [
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } },
      ],
    },
    select: {
      reservationTables: { select: { tableId: true } },
    },
  });

  const occupiedIds = occupiedReservations.flatMap((r) =>
    r.reservationTables.map((rt) => rt.tableId)
  );

  const tables = await prisma.table.findMany({
    where: {
      restaurantId,
      active: true,
      ...(occupiedIds.length > 0 ? { id: { notIn: occupiedIds } } : {}),
    },
    select: { id: true, name: true, capacity: true, minCapacity: true },
    orderBy: { capacity: 'asc' },
  });

  return { tables, occupiedIds };
}

/**
 * Assign optimal table(s) for a reservation.
 * Returns assigned table IDs or null if no tables available.
 */
export async function assignTables(
  restaurantId: string,
  partySize: number,
  startTime: Date,
  endTime: Date,
  preferredTableIds?: string[],
  excludeReservationId?: string
): Promise<{ tableIds: string[]; tableNames: string[] } | null> {
  const { tables: available, occupiedIds } = await findAvailableTables(
    restaurantId,
    startTime,
    endTime,
    excludeReservationId
  );

  if (available.length === 0) {
    // No single table fits — try table groups
    const groups = await prisma.tableGroup.findMany({
      where: {
        restaurantId,
        active: true,
        combinedCapacity: { gte: partySize },
      },
      include: { groupMembers: { include: { table: true }, orderBy: { sortOrder: 'asc' } } },
    });

    for (const group of groups) {
      const allAvailable = group.groupMembers.every(
        (m) => !occupiedIds.includes(m.table.id) && m.table.active
      );
      if (allAvailable) {
        return {
          tableIds: group.groupMembers.map((m) => m.table.id),
          tableNames: group.groupMembers.map((m) => m.table.name),
        };
      }
    }
    return null;
  }

  // Prefer exact capacity match
  const exactMatch = available.find(
    (t) => t.capacity === partySize && t.minCapacity <= partySize
  );
  if (exactMatch) {
    return { tableIds: [exactMatch.id], tableNames: [exactMatch.name] };
  }

  // Prefer smallest wasted seats
  const candidates = available
    .filter((t) => t.capacity >= partySize && t.minCapacity <= partySize)
    .map((t) => ({
      ...t,
      wasted: t.capacity - partySize,
    }))
    .sort((a, b) => a.wasted - b.wasted);

  if (candidates.length > 0) {
    return {
      tableIds: [candidates[0].id],
      tableNames: [candidates[0].name],
    };
  }

  // No single table fits — try table groups
  const groups = await prisma.tableGroup.findMany({
    where: {
      restaurantId,
      active: true,
      combinedCapacity: { gte: partySize },
    },
    include: { groupMembers: { include: { table: true }, orderBy: { sortOrder: 'asc' } } },
  });

  for (const group of groups) {
    const allAvailable = group.groupMembers.every(
      (m) => !occupiedIds.includes(m.table.id) && m.table.active
    );
    if (allAvailable) {
      return {
        tableIds: group.groupMembers.map((m) => m.table.id),
        tableNames: group.groupMembers.map((m) => m.table.name),
      };
    }
  }

  return null;
}

/**
 * Generate time slots for a date + party size.
 *
 * Optimised: fetches all data in 3 queries (reservations, tables, groups)
 * then computes availability for each slot in memory.
 * Previously: 3 queries per slot (48+ slots × 3 = 144+ DB round trips).
 */
export async function generateAvailabilitySlots(
  restaurantId: string,
  date: Date,
  partySize: number
): Promise<{ startTime: string; endTime: string; availableTableIds: string[]; availableTableNames: string[] }[]> {
  const dayOfWeek = date.getDay();

  // ── Batch fetch: 3 queries total ──────────────────────────────────────

  const [rules, restaurant, allTables, allGroups, occupiedReservations] = await Promise.all([
    prisma.availabilityRule.findFirst({
      where: { restaurantId, dayOfWeek, active: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { turnTimeRules: true },
    }),
    prisma.table.findMany({
      where: { restaurantId, active: true },
      select: { id: true, name: true, capacity: true, minCapacity: true },
      orderBy: { capacity: 'asc' },
    }),
    prisma.tableGroup.findMany({
      where: { restaurantId, active: true, combinedCapacity: { gte: partySize } },
      include: { groupMembers: { include: { table: true }, orderBy: { sortOrder: 'asc' } } },
    }),
    // All reservations for the day (with a buffer for turn time) in one query
    prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { notIn: ['cancelled', 'no_show'] },
        // Fetch the whole service window so we have all overlaps pre-loaded
        startTime: {
          gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0),
          lt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59),
        },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        reservationTables: { select: { tableId: true } },
      },
    }),
  ]);

  if (!rules || !restaurant) return [];

  const turnTime = getTurnTime(partySize, restaurant.turnTimeRules as Record<string, number>);
  const startMinutes = parseInt(rules.startTime.split(':')[0]) * 60 + parseInt(rules.startTime.split(':')[1]);
  const endMinutes = parseInt(rules.endTime.split(':')[0]) * 60 + parseInt(rules.endTime.split(':')[1]);

  // ── Build in-memory lookup: tableId → list of (start, end) occupied intervals ──

  const tableOccupancy = new Map<string, { start: Date; end: Date }[]>();
  for (const res of occupiedReservations) {
    for (const rt of res.reservationTables) {
      const intervals = tableOccupancy.get(rt.tableId) || [];
      intervals.push({ start: res.startTime, end: res.endTime });
      tableOccupancy.set(rt.tableId, intervals);
    }
  }

  /**
   * Check if a table is free during [slotStart, slotEnd).
   * A table is occupied if ANY interval overlaps: interval.start < slotEnd && interval.end > slotStart.
   */
  function isTableFree(tableId: string, slotStart: Date, slotEnd: Date): boolean {
    const intervals = tableOccupancy.get(tableId);
    if (!intervals) return true; // No reservations for this table at all
    return intervals.every((iv) => iv.start >= slotEnd || iv.end <= slotStart);
  }

  // ── Compute slots in memory ────────────────────────────────────────────

  const slots: { startTime: string; endTime: string; availableTableIds: string[]; availableTableNames: string[] }[] = [];

  for (let m = startMinutes; m + turnTime <= endMinutes; m += rules.slotInterval) {
    const startH = Math.floor(m / 60);
    const startMin = m % 60;
    const endH = Math.floor((m + turnTime) / 60);
    const endMin = (m + turnTime) % 60;

    const startStr = `${String(startH).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

    const slotStart = new Date(date);
    slotStart.setHours(startH, startMin, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(endH, endMin, 0, 0);

    // Find fitting individual tables
    const fitting = allTables.filter(
      (t) => t.capacity >= partySize && t.minCapacity <= partySize && isTableFree(t.id, slotStart, slotEnd)
    );

    // If no single table fits, check table groups
    const availableGroups: AvailableGroup[] = [];
    if (fitting.length === 0) {
      for (const group of allGroups) {
        const allAvailable = group.groupMembers.every(
          (m) => m.table.active && isTableFree(m.table.id, slotStart, slotEnd)
        );
        if (allAvailable) {
          availableGroups.push({
            id: group.id,
            name: group.name,
            combinedCapacity: group.combinedCapacity,
            tableIds: group.groupMembers.map((m) => m.table.id),
            tableNames: group.groupMembers.map((m) => m.table.name),
          });
        }
      }
    }

    if (fitting.length > 0 || availableGroups.length > 0) {
      slots.push({
        startTime: startStr,
        endTime: endStr,
        availableTableIds: fitting.length > 0 ? fitting.map((t) => t.id) : availableGroups.flatMap((g) => g.tableIds),
        availableTableNames: fitting.length > 0 ? fitting.map((t) => t.name) : availableGroups.flatMap((g) => g.tableNames),
      });
    }
  }

  return slots;
}