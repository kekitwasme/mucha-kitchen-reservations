import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const segmentSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().max(50).optional(),
});

const daySegmentsSchema = z.object({
  segments: z.array(segmentSchema),
});

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

function getDayIndex(day: string): number {
  return DAY_NAMES.indexOf(day.toLowerCase());
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function validateSegments(segments: z.infer<typeof segmentSchema>[]): string | null {
  for (const seg of segments) {
    if (timeToMinutes(seg.startTime) >= timeToMinutes(seg.endTime)) {
      return `Segment "${seg.startTime} – ${seg.endTime}" has invalid times`;
    }
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      const aStart = timeToMinutes(a.startTime);
      const aEnd = timeToMinutes(a.endTime);
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      if (aStart < bEnd && bStart < aEnd) {
        return `"${a.startTime} – ${a.endTime}" overlaps with "${b.startTime} – ${b.endTime}"`;
      }
    }
  }
  return null;
}

// GET /api/admin/operating-hours — list all segments grouped by day
export async function GET() {
  try {
    const restaurantId = process.env.RESTAURANT_ID || '';
    const restaurant = restaurantId
      ? await prisma.restaurant.findUnique({ where: { id: restaurantId } })
      : await prisma.restaurant.findFirst();

    if (!restaurant) return errorResponse('Restaurant not found', 'NOT_FOUND', 404);

    const rules = await prisma.availabilityRule.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: [{ dayOfWeek: 'asc' }, { sortOrder: 'asc' }],
    });

    const grouped: Record<string, { label?: string; start: string; end: string }[]> = {};
    DAY_NAMES.forEach((d) => (grouped[d] = []));

    for (const r of rules) {
      const day = DAY_NAMES[r.dayOfWeek] || 'unknown';
      grouped[day].push({ label: r.label || undefined, start: r.startTime, end: r.endTime });
    }

    return NextResponse.json({ operatingHours: grouped });
  } catch (err) {
    console.error('[GET /api/admin/operating-hours]', err);
    return errorResponse('Failed to fetch operating hours', 'INTERNAL_ERROR', 500);
  }
}

// PUT /api/admin/operating-hours?day=monday — replace all segments for a day
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const day = searchParams.get('day')?.toLowerCase() || '';
    const dayIndex = getDayIndex(day);
    if (dayIndex === -1) return errorResponse('Invalid day', 'VALIDATION_ERROR', 400);

    const body = await request.json();
    const parsed = daySegmentsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const validationErr = validateSegments(parsed.data.segments);
    if (validationErr) {
      return errorResponse(validationErr, 'VALIDATION_ERROR', 400);
    }

    const restaurantId = process.env.RESTAURANT_ID || '';
    const restaurant = restaurantId
      ? await prisma.restaurant.findUnique({ where: { id: restaurantId } })
      : await prisma.restaurant.findFirst();

    if (!restaurant) return errorResponse('Restaurant not found', 'NOT_FOUND', 404);

    // Delete existing segments for this day
    await prisma.availabilityRule.deleteMany({
      where: { restaurantId: restaurant.id, dayOfWeek: dayIndex },
    });

    // Create new segments
    const maxCovers = restaurant.maxPartySize;
    await prisma.availabilityRule.createMany({
      data: parsed.data.segments.map((seg, i) => ({
        restaurantId: restaurant.id,
        dayOfWeek: dayIndex,
        startTime: seg.startTime,
        endTime: seg.endTime,
        label: seg.label || null,
        sortOrder: i,
        slotInterval: 15,
        maxCovers,
      })),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PUT /api/admin/operating-hours]', err);
    return errorResponse('Failed to update operating hours', 'INTERNAL_ERROR', 500);
  }
}
