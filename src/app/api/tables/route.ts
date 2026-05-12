import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTablesQuerySchema, createTableSchema } from '@/lib/schemas';

// Hardcoded restaurant ID for single-tenant MVP
// In multi-tenant, this would come from auth/subdomain
const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

// GET /api/tables — List tables (public)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawParams: Record<string, string | undefined> = {
      area: searchParams.get('area') ?? undefined,
      active: searchParams.get('active') ?? undefined,
    };

    const parsed = getTablesQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return errorResponse('Invalid query parameters', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const { area, active } = parsed.data;
    const includeActive = searchParams.get('includeActive') === 'true';

    const where: Record<string, unknown> = {
      ...(RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {}),
      ...(area ? { area } : {}),
      active,
    };

    const tables = await prisma.table.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    if (!includeActive) {
      return NextResponse.json({ tables });
    }

    const now = new Date();
    const reservations = await prisma.reservation.findMany({
      where: {
        ...(RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {}),
        status: { in: ['pending', 'confirmed', 'seated'] },
        startTime: { lte: now },
        endTime: { gte: now },
      },
      include: {
        reservationTables: { select: { tableId: true } },
      },
    });

    const tableIdToReservation = new Map<string, typeof reservations[0]>();
    for (const r of reservations) {
      for (const rt of r.reservationTables) {
        tableIdToReservation.set(rt.tableId, r);
      }
    }

    const tablesWithActive = tables.map((t) => ({
      ...t,
      activeReservation: tableIdToReservation.get(t.id)
        ? {
            id: tableIdToReservation.get(t.id)!.id,
            customerName: tableIdToReservation.get(t.id)!.customerName,
            partySize: tableIdToReservation.get(t.id)!.partySize,
            startTime: tableIdToReservation.get(t.id)!.startTime.toISOString(),
            endTime: tableIdToReservation.get(t.id)!.endTime.toISOString(),
            status: tableIdToReservation.get(t.id)!.status,
          }
        : null,
    }));

    return NextResponse.json({ tables: tablesWithActive });
  } catch (err) {
    console.error('[GET /api/tables]', err);
    return errorResponse('Failed to fetch tables', 'INTERNAL_ERROR', 500);
  }
}

// POST /api/tables — Create table (admin only)
export async function POST(request: NextRequest) {
  try {
    // TODO: Add auth check — admin only
    const body = await request.json();
    const parsed = createTableSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid table data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const table = await prisma.table.create({
      data: {
        ...parsed.data,
        restaurantId: RESTAURANT_ID || (await prisma.restaurant.findFirst())!.id,
      },
    });

    return NextResponse.json({ table }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tables]', err);
    return errorResponse('Failed to create table', 'INTERNAL_ERROR', 500);
  }
}

// PATCH and DELETE are handled by /api/tables/[id]/route.ts