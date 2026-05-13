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

async function getRestaurant() {
  const restaurantId = process.env.RESTAURANT_ID || '';
  if (cachedRestaurant && Date.now() - cachedRestaurant.fetchedAt < RESTAURANT_CACHE_MS) {
    return { id: cachedRestaurant.id, timezone: cachedRestaurant.timezone };
  }
  let actualId = restaurantId;
  let timezone = 'Australia/Perth';
  if (!actualId) {
    const restaurant = await prisma.restaurant.findFirst();
    if (!restaurant) return null;
    actualId = restaurant.id;
    timezone = restaurant.timezone || 'Australia/Perth';
  } else {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: actualId } });
    if (restaurant) timezone = restaurant.timezone || 'Australia/Perth';
  }
  cachedRestaurant = { id: actualId, timezone, fetchedAt: Date.now() };
  return { id: actualId, timezone };
}

let cachedRestaurant: { id: string; timezone: string; fetchedAt: number } | null = null;
const RESTAURANT_CACHE_MS = 5 * 60 * 1000;

export async function GET(_request: NextRequest) {
  try {
    const restaurant = await getRestaurant();
    if (!restaurant) {
      return NextResponse.json({ arrivals: [] });
    }
    const { id: actualRestaurantId, timezone: restaurantTimezone } = restaurant;

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

    return NextResponse.json(
      { arrivals },
      {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (err) {
    console.error('[GET /api/dashboard/upcoming]', err);
    return errorResponse('Failed to fetch upcoming arrivals', 'INTERNAL_ERROR', 500);
  }
}