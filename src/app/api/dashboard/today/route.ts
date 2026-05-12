import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ReservationStatus } from '@prisma/client';

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

// GET /api/dashboard/today — Today's summary with counts by status + upcoming arrivals (next 2h)
export async function GET(_request: NextRequest) {
  try {
    const restaurantId = process.env.RESTAURANT_ID || '';

    let actualRestaurantId = restaurantId;
    let restaurantTimezone = 'Australia/Perth';

    if (!actualRestaurantId) {
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return NextResponse.json({
          date: new Date().toISOString().split('T')[0],
          total: 0,
          byStatus: {} as Record<string, number>,
          upcomingArrivals: [],
        });
      }
      actualRestaurantId = restaurant.id;
      restaurantTimezone = restaurant.timezone || 'Australia/Perth';
    } else {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: actualRestaurantId } });
      if (restaurant) {
        restaurantTimezone = restaurant.timezone || 'Australia/Perth';
      }
    }

    // Use restaurant's timezone for "today"
    const now = getNowInTimezone(restaurantTimezone);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId: actualRestaurantId,
        reservationDate: { gte: todayStart, lt: tomorrowStart },
      },
      include: {
        reservationTables: { include: { table: { select: { name: true } } } },
      },
      orderBy: { startTime: 'asc' },
    });

    // Count by status
    const byStatus: Record<string, number> = {};
    for (const status of Object.values(ReservationStatus)) {
      byStatus[status] = 0;
    }
    for (const r of reservations) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }

    // Upcoming arrivals (next 2 hours, excluding completed/cancelled/no_show)
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const upcomingArrivals = reservations
      .filter(
        (r) =>
          r.startTime >= now &&
          r.startTime <= twoHoursFromNow &&
          r.status !== 'cancelled' &&
          r.status !== 'no_show' &&
          r.status !== 'completed'
      )
      .map((r) => ({
        id: r.id,
        customerName: r.customerName,
        partySize: r.partySize,
        startTime: r.startTime.toISOString(),
        tableNames: r.reservationTables.map((rt) => rt.table.name),
        status: r.status,
      }));

    return NextResponse.json({
      date: todayStart.toISOString().split('T')[0],
      total: reservations.length,
      byStatus,
      upcomingArrivals,
    });
  } catch (err) {
    console.error('[GET /api/dashboard/today]', err);
    return errorResponse('Failed to fetch dashboard', 'INTERNAL_ERROR', 500);
  }
}