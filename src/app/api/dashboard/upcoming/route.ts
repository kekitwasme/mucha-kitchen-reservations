import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

/**
 * Get "now" in the restaurant's timezone.
 * Defaults to Australia/Perth if the restaurant timezone isn't set.
 */
function getNowInTimezone(timezone: string): Date {
  const tz = timezone || 'Australia/Perth';
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const parts = Object.fromEntries(formatted.map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
}

// GET /api/dashboard/upcoming — Arrivals in next 2 hours
export async function GET(_request: NextRequest) {
  try {
    const restaurantId = process.env.RESTAURANT_ID || '';

    let actualRestaurantId = restaurantId;
    let restaurantTimezone = 'Australia/Perth';

    if (!actualRestaurantId) {
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return NextResponse.json({ arrivals: [] });
      }
      actualRestaurantId = restaurant.id;
      restaurantTimezone = restaurant.timezone || 'Australia/Perth';
    } else {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: actualRestaurantId } });
      if (restaurant) {
        restaurantTimezone = restaurant.timezone || 'Australia/Perth';
      }
    }

    const now = getNowInTimezone(restaurantTimezone);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId: actualRestaurantId,
        startTime: { gte: now, lte: twoHoursFromNow },
        status: { in: ['pending', 'confirmed'] },
      },
      include: {
        reservationTables: { include: { table: { select: { id: true, name: true } } } },
      },
      orderBy: { startTime: 'asc' },
    });

    const arrivals = reservations.map((r) => ({
      id: r.id,
      customerName: r.customerName,
      partySize: r.partySize,
      startTime: r.startTime.toISOString(),
      tableNames: r.reservationTables.map((rt) => rt.table.name),
      status: r.status,
    }));

    return NextResponse.json({ arrivals });
  } catch (err) {
    console.error('[GET /api/dashboard/upcoming]', err);
    return errorResponse('Failed to fetch upcoming arrivals', 'INTERNAL_ERROR', 500);
  }
}