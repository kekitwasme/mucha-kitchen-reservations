import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const optimizeSchema = z.object({
  partySize: z.number().int().min(1),
  area: z.string().optional(),
});

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

// POST /api/tables/optimize — Find best table(s) for a party size
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = optimizeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid parameters', 'VALIDATION_ERROR', 400);
    }

    const { partySize, area } = parsed.data;
    const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

    const where: Record<string, unknown> = {
      active: true,
      ...(RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {}),
      ...(area ? { area } : {}),
    };

    // 1. Find single tables that fit
    const allTables = await prisma.table.findMany({ where });

    const singleTables = allTables
      .filter((t) => t.capacity >= partySize && t.minCapacity <= partySize)
      .sort((a, b) => a.capacity - b.capacity); // smallest fit first

    // 2. Find registered combinations
    const combinations = await prisma.tableCombination.findMany({
      where: {
        active: true,
        combinedCapacity: { gte: partySize },
        ...(RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {}),
      },
      include: { tableA: true, tableB: true },
    });

    const registeredCombinations = combinations
      .filter((c) => c.tableA.active && c.tableB.active)
      .filter((c) => !area || (c.tableA.area === area && c.tableB.area === area))
      .map((c) => {
        const dist = Math.sqrt((c.tableA.x - c.tableB.x) ** 2 + (c.tableA.y - c.tableB.y) ** 2);
        return {
          tableA: { id: c.tableA.id, name: c.tableA.name, capacity: c.tableA.capacity, x: c.tableA.x, y: c.tableA.y },
          tableB: { id: c.tableB.id, name: c.tableB.name, capacity: c.tableB.capacity, x: c.tableB.x, y: c.tableB.y },
          combinedCapacity: c.combinedCapacity,
          distance: Math.round(dist),
          isSuggested: false,
        };
      })
      .sort((a, b) => a.distance - b.distance);

    // 3. Suggest nearby tables as combinations (if no registered combos or as extras)
    const smallTables = allTables.filter((t) => t.capacity < partySize);
    const suggestedCombinations: typeof registeredCombinations = [];

    for (let i = 0; i < smallTables.length; i++) {
      for (let j = i + 1; j < smallTables.length; j++) {
        const a = smallTables[i];
        const b = smallTables[j];
        const combinedCap = a.capacity + b.capacity;
        if (combinedCap < partySize) continue;

        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        if (dist > 150) continue; // only suggest nearby tables

        // Skip if already a registered combination
        const isRegistered = registeredCombinations.some(
          (rc) => (rc.tableA.id === a.id && rc.tableB.id === b.id) || (rc.tableA.id === b.id && rc.tableB.id === a.id)
        );
        if (isRegistered) continue;

        suggestedCombinations.push({
          tableA: { id: a.id, name: a.name, capacity: a.capacity, x: a.x, y: a.y },
          tableB: { id: b.id, name: b.name, capacity: b.capacity, x: b.x, y: b.y },
          combinedCapacity: combinedCap,
          distance: Math.round(dist),
          isSuggested: true,
        });
      }
    }

    suggestedCombinations.sort((a, b) => a.distance - b.distance);

    // 4. Find registered table groups (multi-table)
    const tableGroups = await prisma.tableGroup.findMany({
      where: {
        active: true,
        combinedCapacity: { gte: partySize },
        ...(RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {}),
      },
      include: { groupMembers: { include: { table: true }, orderBy: { sortOrder: 'asc' } } },
    });

    const groups = tableGroups
      .filter((g) => g.groupMembers.every((m) => m.table.active))
      .filter((g) => !area || g.groupMembers.every((m) => m.table.area === area))
      .map((g) => ({
        id: g.id,
        name: g.name,
        combinedCapacity: g.combinedCapacity,
        tables: g.groupMembers.map((m) => ({ id: m.table.id, name: m.table.name, capacity: m.table.capacity, x: m.table.x, y: m.table.y })),
      }));

    return NextResponse.json({
      singleTables: singleTables.map((t) => ({
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        shape: t.shape,
        area: t.area,
        x: t.x,
        y: t.y,
      })),
      combinations: [...registeredCombinations, ...suggestedCombinations],
      groups,
    });
  } catch (err) {
    console.error('[POST /api/tables/optimize]', err);
    return errorResponse('Failed to optimize seating', 'INTERNAL_ERROR', 500);
  }
}