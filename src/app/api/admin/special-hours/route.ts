import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const specialHoursSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isClosed: z.boolean().optional().default(false),
  segments: z
    .array(
      z.object({
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        label: z.string().max(50).optional(),
      })
    )
    .optional(),
  note: z.string().max(200).optional(),
});

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

function getRestaurantId() {
  return process.env.RESTAURANT_ID || '';
}

async function getRestaurant() {
  const rid = getRestaurantId();
  return rid
    ? await prisma.restaurant.findUnique({ where: { id: rid } })
    : await prisma.restaurant.findFirst();
}

// GET /api/admin/special-hours — list all special date overrides
export async function GET() {
  try {
    const restaurant = await getRestaurant();
    if (!restaurant) return errorResponse('Restaurant not found', 'NOT_FOUND', 404);

    const overrides = await prisma.specialHoursOverride.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json({
      overrides: overrides.map((o) => ({
        id: o.id,
        date: o.date.toISOString().split('T')[0],
        isClosed: o.isClosed,
        segments: o.segments as { startTime: string; endTime: string; label?: string }[] | undefined,
        note: o.note,
      })),
    });
  } catch (err) {
    console.error('[GET /api/admin/special-hours]', err);
    return errorResponse('Failed to fetch special hours', 'INTERNAL_ERROR', 500);
  }
}

// POST /api/admin/special-hours — add a new override
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = specialHoursSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const restaurant = await getRestaurant();
    if (!restaurant) return errorResponse('Restaurant not found', 'NOT_FOUND', 404);

    const override = await prisma.specialHoursOverride.create({
      data: {
        restaurantId: restaurant.id,
        date: new Date(parsed.data.date + 'T00:00:00.000Z'),
        isClosed: parsed.data.isClosed,
        segments: parsed.data.segments || [],
        note: parsed.data.note || null,
      },
    });

    return NextResponse.json({
      id: override.id,
      date: override.date.toISOString().split('T')[0],
      isClosed: override.isClosed,
      segments: override.segments as { startTime: string; endTime: string; label?: string }[] | undefined,
      note: override.note,
    });
  } catch (err) {
    console.error('[POST /api/admin/special-hours]', err);
    return errorResponse('Failed to create special hours', 'INTERNAL_ERROR', 500);
  }
}
