import { NextRequest, NextResponse } from 'next/server';
import { availabilityQuerySchema } from '@/lib/schemas';
import { generateAvailabilitySlots } from '@/lib/table-assignment';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

// GET /api/availability — Query available time slots
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

    // Hardcoded restaurant ID for MVP
    const restaurantId = process.env.RESTAURANT_ID || '';
    if (!restaurantId) {
      // Try to get first restaurant from DB
      const { prisma } = await import('@/lib/prisma');
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return errorResponse('No restaurant configured', 'NOT_CONFIGURED', 500);
      }
      const slots = await generateAvailabilitySlots(restaurant.id, dateObj, partySize);
      return NextResponse.json({ date, partySize, slots });
    }

    const slots = await generateAvailabilitySlots(restaurantId, dateObj, partySize);
    return NextResponse.json({ date, partySize, slots });
  } catch (err) {
    console.error('[GET /api/availability]', err);
    return errorResponse('Failed to fetch availability', 'INTERNAL_ERROR', 500);
  }
}
