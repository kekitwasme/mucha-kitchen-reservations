import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createReservationSchema, listReservationsQuerySchema } from '@/lib/schemas';
import { getTurnTime, combineDateTime, toDateOnly } from '@/lib/utils';
import { assignTables } from '@/lib/table-assignment';
import { createOrFindCustomer, createSquareBooking } from '@/lib/square-adapter';
import { ReservationStatus, ReservationSource } from '@prisma/client';

const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

// GET /api/reservations — List with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawParams: Record<string, string | undefined> = {
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      source: searchParams.get('source') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      tableId: searchParams.get('tableId') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    };

    const parsed = listReservationsQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return errorResponse('Invalid query parameters', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const { dateFrom, dateTo, status, source, search, tableId, limit, offset } = parsed.data;

    const where: Record<string, unknown> = {
      ...(RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {}),
      ...(dateFrom || dateTo
        ? {
            reservationDate: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
      ...(status
        ? {
            status: {
              in: status.split(',') as ReservationStatus[],
            },
          }
        : {}),
      ...(source ? { source } : {}),
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search } },
              { customerEmail: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(tableId
        ? {
            reservationTables: {
              some: { tableId },
            },
          }
        : {}),
    };

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          reservationTables: { include: { table: true } },
          payments: true,
        },
        orderBy: { startTime: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.reservation.count({ where }),
    ]);

    return NextResponse.json({ reservations, total });
  } catch (err) {
    console.error('[GET /api/reservations]', err);
    return errorResponse('Failed to fetch reservations', 'INTERNAL_ERROR', 500);
  }
}

// POST /api/reservations — Create with transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid reservation data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const {
      customerName,
      customerPhone,
      customerEmail,
      partySize,
      reservationDate: dateStr,
      startTime: startTimeStr,
      notes,
      preferredTableIds,
      source,
      status: requestedStatus,
    } = parsed.data;

    const restaurant = RESTAURANT_ID
      ? await prisma.restaurant.findUnique({ where: { id: RESTAURANT_ID } })
      : await prisma.restaurant.findFirst();

    if (!restaurant) {
      return errorResponse('Restaurant not found', 'NOT_FOUND', 404);
    }

    const date = toDateOnly(new Date(dateStr));
    const startTime = combineDateTime(date, startTimeStr);
    const turnTime = getTurnTime(partySize, restaurant.turnTimeRules as Record<string, number>);
    const endTime = new Date(startTime.getTime() + turnTime * 60000);

    // Conflict detection + table assignment in a transaction
    const result = await prisma.$transaction(
      async (tx) => {
        // Find occupied table IDs for this time range
        const occupiedReservations = await tx.reservation.findMany({
          where: {
            restaurantId: restaurant.id,
            status: { notIn: ['cancelled', 'no_show'] },
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gt: startTime } },
            ],
          },
          select: {
            reservationTables: { select: { tableId: true } },
          },
        });

        const occupiedIds = occupiedReservations.flatMap((r) =>
          r.reservationTables.map((rt) => rt.tableId)
        );

        const availableTables = await tx.table.findMany({
          where: {
            restaurantId: restaurant.id,
            active: true,
            ...(occupiedIds.length > 0 ? { id: { notIn: occupiedIds } } : {}),
            ...(preferredTableIds?.length
              ? { id: { in: preferredTableIds, notIn: occupiedIds } }
              : {}),
          },
          select: { id: true, name: true, capacity: true, minCapacity: true },
          orderBy: { capacity: 'asc' },
        });

        if (availableTables.length === 0) {
          return { error: 'NO_AVAILABILITY', message: 'No tables available for the selected time' };
        }

        // Find optimal table (single or group)
        const singleMatch = availableTables
          .filter((t) => t.capacity >= partySize && t.minCapacity <= partySize)
          .sort((a, b) => a.capacity - b.capacity)[0];

        let candidate: { id: string; name: string; capacity: number } | null = singleMatch
          ? { id: singleMatch.id, name: singleMatch.name, capacity: singleMatch.capacity }
          : null;
        let candidateTableIds: string[] = singleMatch ? [singleMatch.id] : [];
        let candidateTableNames: string[] = singleMatch ? [singleMatch.name] : [];

        // No single table fits — try table groups
        if (!candidate) {
          const groups = await tx.tableGroup.findMany({
            where: {
              restaurantId: restaurant.id,
              active: true,
              combinedCapacity: { gte: partySize },
            },
            include: { groupMembers: { include: { table: true }, orderBy: { sortOrder: 'asc' } } },
          });

          for (const group of groups) {
            const allAvailable = group.groupMembers.every(
              (m) => m.table.active && !occupiedIds.includes(m.table.id)
            );
            if (allAvailable) {
              candidate = { id: group.id, name: group.name, capacity: group.combinedCapacity };
              candidateTableIds = group.groupMembers.map((m) => m.table.id);
              candidateTableNames = group.groupMembers.map((m) => m.table.name);
              break;
            }
          }
        }

        if (!candidate) {
          return { error: 'NO_AVAILABILITY', message: 'No suitable table for party size' };
        }

        // Check opening hours
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[date.getDay()];
        const hours = (restaurant.openingHours as Record<string, { open: string; close: string }>)?.[dayName];

        if (hours) {
          const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
          const openMinutes = parseInt(hours.open.split(':')[0]) * 60 + parseInt(hours.open.split(':')[1]);
          const closeMinutes = parseInt(hours.close.split(':')[0]) * 60 + parseInt(hours.close.split(':')[1]);
          const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();

          if (startMinutes < openMinutes || endMinutes > closeMinutes) {
            return { error: 'OUTSIDE_HOURS', message: 'Reservation time is outside opening hours' };
          }
        }

        // Check blocked times
        const blocked = await tx.blockedTime.findFirst({
          where: {
            restaurantId: restaurant.id,
            startTime: { lte: endTime },
            endTime: { gte: startTime },
            OR: [{ affectsAll: true }, { tableIds: { has: candidate.id } }],
          },
        });

        if (blocked) {
          return { error: 'BLOCKED_TIME', message: 'Selected time is blocked' };
        }

        // Create customer record (upsert by phone)
        const customer = await tx.customer.upsert({
          where: { email: customerEmail || `${customerPhone}@placeholder.local` },
          update: { name: customerName, visitCount: { increment: 1 } },
          create: {
            restaurantId: restaurant.id,
            name: customerName,
            phone: customerPhone,
            email: customerEmail || `${customerPhone}@placeholder.local`,
          },
        });

        // Create reservation
        const reservation = await tx.reservation.create({
          data: {
            restaurantId: restaurant.id,
            customerName,
            customerPhone,
            customerEmail: customerEmail || null,
            partySize,
            reservationDate: date,
            startTime,
            endTime,
            status: requestedStatus || 'confirmed',
            source: (source || 'online') as ReservationSource,
            notes: notes || null,
          },
        });

        // Link table(s)
        for (const tableId of candidateTableIds) {
          await tx.reservationTable.create({
            data: {
              reservationId: reservation.id,
              tableId,
            },
          });
        }

        // Audit log
        await tx.auditLog.create({
          data: {
            restaurantId: restaurant.id,
            reservationId: reservation.id,
            action: 'created',
            details: { partySize, tableIds: candidateTableIds, tableNames: candidateTableNames },
          },
        });

        return {
          reservation,
          tableIds: candidateTableIds,
          tableNames: candidateTableNames,
          customer,
        };
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 }
    );

    if ('error' in result) {
      const err = result as { error: string; message: string };
      return errorResponse(err.message, err.error, 409);
    }

    const { reservation, tableNames } = result;

    // Async Square sync — do not await, don't block response
    const restaurantConfig = await prisma.restaurant.findUnique({
      where: { id: restaurant.id },
      select: { squareLocationId: true },
    });

    // Fire-and-forget Square sync
    (async () => {
      try {
        const squareCustomerId = await createOrFindCustomer(restaurant.id, {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
        });

        const squareBookingId = await createSquareBooking(
          {
            reservationId: reservation.id,
            customerName,
            customerPhone,
            customerEmail,
            partySize,
            startTime,
            endTime,
            tableNames: tableNames,
            notes,
          },
          squareCustomerId
        );

        if (squareBookingId) {
          await prisma.reservation.update({
            where: { id: reservation.id },
            data: { squareBookingId, squareCustomerId },
          });
        }
      } catch (syncErr) {
        console.error('[Square Sync] Failed for reservation', reservation.id, syncErr);
      }
    })();

    // Fetch the full reservation with tables for the response
    const fullReservation = await prisma.reservation.findUnique({
      where: { id: reservation.id },
      include: { reservationTables: { include: { table: true } } },
    });

    return NextResponse.json(
      {
        reservation: {
          id: fullReservation!.id,
          customerName: fullReservation!.customerName,
          partySize: fullReservation!.partySize,
          reservationDate: dateStr, // Use the original date string to avoid timezone issues
          startTime: `${String(fullReservation!.startTime.getHours()).padStart(2, '0')}:${String(fullReservation!.startTime.getMinutes()).padStart(2, '0')}`,
          endTime: `${String(fullReservation!.endTime.getHours()).padStart(2, '0')}:${String(fullReservation!.endTime.getMinutes()).padStart(2, '0')}`,
          status: fullReservation!.status,
          tableIds: fullReservation!.reservationTables.map((rt) => rt.tableId),
          tableNames: fullReservation!.reservationTables.map((rt) => rt.table.name),
          depositAmount: fullReservation!.depositAmount,
          createdAt: fullReservation!.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/reservations]', err);
    return errorResponse('Failed to create reservation', 'INTERNAL_ERROR', 500);
  }
}
