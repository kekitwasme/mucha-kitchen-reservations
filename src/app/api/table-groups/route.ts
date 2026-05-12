import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

const createSchema = z.object({
  tableIds: z.array(z.string()).min(2, 'A group must have at least 2 tables'),
  name: z.string().optional(),
});

// GET /api/table-groups
export async function GET() {
  try {
    const groups = await prisma.tableGroup.findMany({
      where: RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {},
      include: {
        groupMembers: {
          include: { table: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ groups });
  } catch (err) {
    console.error('[GET /api/table-groups]', err);
    return errorResponse('Failed to fetch table groups', 'INTERNAL_ERROR', 500);
  }
}

// POST /api/table-groups
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid data: ' + parsed.error.issues.map((i) => i.message).join(', '), 'VALIDATION_ERROR', 400);
    }

    const { tableIds, name } = parsed.data;

    // Check for duplicate tableIds
    const uniqueIds = [...new Set(tableIds)];
    if (uniqueIds.length !== tableIds.length) {
      return errorResponse('Duplicate table IDs in group', 'VALIDATION_ERROR', 400);
    }

    // Fetch the tables to calculate capacity and build name
    const tables = await prisma.table.findMany({
      where: { id: { in: tableIds } },
    });

    if (tables.length !== tableIds.length) {
      return errorResponse('One or more tables not found', 'NOT_FOUND', 404);
    }

    // Check all tables belong to same restaurant
    const rid = RESTAURANT_ID || (await prisma.restaurant.findFirst())!.id;
    const wrongRestaurant = tables.find((t) => t.restaurantId !== rid);
    if (wrongRestaurant) {
      return errorResponse('All tables must belong to the same restaurant', 'VALIDATION_ERROR', 400);
    }

    // Check for existing group with same set of tables
    const existingGroups = await prisma.tableGroup.findMany({
      where: { restaurantId: rid, active: true },
      include: { groupMembers: true },
    });

    const sameSetGroup = existingGroups.find((g) => {
      const memberIds = g.groupMembers.map((m) => m.tableId).sort();
      return memberIds.length === uniqueIds.length && memberIds.every((id, i) => id === [...uniqueIds].sort()[i]);
    });

    if (sameSetGroup) {
      return errorResponse('A group with these exact tables already exists', 'DUPLICATE', 409);
    }

    const combinedCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
    const groupName = name || tables.map((t) => t.name).sort().join('+');

    const group = await prisma.tableGroup.create({
      data: {
        restaurantId: rid,
        name: groupName,
        combinedCapacity,
        groupMembers: {
          create: tableIds.map((tableId, index) => ({
            tableId,
            sortOrder: index,
          })),
        },
      },
      include: {
        groupMembers: {
          include: { table: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/table-groups]', err);
    return errorResponse('Failed to create table group', 'INTERNAL_ERROR', 500);
  }
}