/**
 * Mucha Kitchen — Dashboard API
 * =============================
 *
 * GET /api/dashboard
 *
 * Returns today's summary stats and upcoming arrivals for the staff dashboard.
 * Combines what were previously 2 separate API calls (today + upcoming).
 *
 * Response shape:
 *   { date: string, total: number, byStatus: {...}, upcomingArrivals: [...] }
 *
 * @module api/dashboard
 */
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

// Simple in-memory cache for restaurant config (timezone rarely changes)
let cachedRestaurant: { id: string; timezone: string; fetchedAt: number } | null = null;
const RESTAURANT_CACHE_MS = 5 * 60 * 1000; // 5 minutes

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

// GET /api/dashboard — Combined today summary + upcoming arrivals (single API call)
export async function GET(_request: NextRequest) {
  try {
    const restaurant = await getRestaurant();
    if (!restaurant) {
      return NextResponse.json({
        date: new Date().toISOString().split('T')[0],
        total: 0,
        byStatus: {},
        upcomingArrivals: [],
      });
    }
    const { id: actualRestaurantId, timezone: restaurantTimezone } = restaurant;

    // Use restaurant's timezone for "today"
    const now = getNowInTimezone(restaurantTimezone);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Single query: fetch all today's reservations
    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId: actualRestaurantId,
        reservationDate: { gte: todayStart, lt: tomorrowStart },
      },
      select: {
        id: true,
        customerName: true,
        partySize: true,
        startTime: true,
        status: true,
        reservationTables: {
          select: {
            table: { select: { name: true } },
          },
        },
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

    return NextResponse.json(
      {
        date: todayStart.toISOString().split('T')[0],
        total: reservations.length,
        byStatus,
        upcomingArrivals,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (err) {
    console.error('[GET /api/dashboard]', err);
    return errorResponse('Failed to fetch dashboard', 'INTERNAL_ERROR', 500);
  }
}