import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getTurnTime, combineDateTime } from '@/lib/utils';
import { findAvailableTables } from '@/lib/table-assignment';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

const rescheduleSchema = z.object({
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Invalid time format (HH:MM)'),
});

// POST /api/reservations/[id]/reschedule — Public endpoint for customers to change their reservation time
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid reschedule data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const { reservationDate, startTime } = parsed.data;

    // Fetch existing reservation
    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: { reservationTables: true },
    });

    if (!existing) {
      return errorResponse('Reservation not found', 'NOT_FOUND', 404);
    }

    // Only pending/confirmed reservations can be rescheduled
    if (existing.status !== 'pending' && existing.status !== 'confirmed') {
      return errorResponse('This reservation cannot be rescheduled', 'INVALID_STATUS', 400);
    }

    // Get restaurant config
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: existing.restaurantId },
    });
    if (!restaurant) {
      return errorResponse('Restaurant not found', 'NOT_FOUND', 404);
    }

    const partySize = existing.partySize;
    const dateObj = new Date(reservationDate + 'T00:00:00');
    const turnTimeRules = restaurant.turnTimeRules as Record<string, number>;
    const turnMinutes = getTurnTime(partySize, turnTimeRules);
    const startDateTime = combineDateTime(dateObj, startTime);
    const endDateTime = new Date(startDateTime.getTime() + turnMinutes * 60 * 1000);

    // Check that the new time is in the future
    if (startDateTime <= new Date()) {
      return errorResponse('Cannot reschedule to a past time', 'PAST_TIME', 400);
    }

    // Find available tables, excluding the current reservation from conflict checks
    const currentTableIds = existing.reservationTables.map((rt) => rt.tableId);
    const assignment = await findAvailableTables(
      existing.restaurantId,
      startDateTime,
      endDateTime,
      existing.id // exclude current reservation from conflict checks
    );

    if (!assignment || assignment.tables.length === 0) {
      return errorResponse('No tables available at this time', 'NO_AVAILABILITY', 409);
    }

    // Update the reservation in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Remove old table assignments
      await tx.reservationTable.deleteMany({
        where: { reservationId: existing.id },
      });

      // Create new table assignments
      await tx.reservationTable.createMany({
        data: assignment.tables.map((table) => ({
          reservationId: existing.id,
          tableId: table.id,
        })),
      });

      // Update reservation
      const reservation = await tx.reservation.update({
        where: { id: existing.id },
        data: {
          reservationDate: dateObj,
          startTime: startDateTime,
          endTime: endDateTime,
        },
        include: {
          reservationTables: { include: { table: { select: { id: true, name: true } } } },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          reservationId: existing.id,
          restaurantId: existing.restaurantId,
          action: 'updated',
          details: {
            rescheduled: true,
            previousDate: existing.reservationDate.toISOString().split('T')[0],
            previousTime: existing.startTime.toISOString(),
            newDate: reservationDate,
            newTime: startTime,
            previousTableIds: currentTableIds,
            newTableIds: assignment.tables.map((t) => t.id),
          },
        },
      });

      return reservation;
    });

    return NextResponse.json({
      reservation: {
        id: updated.id,
        customerName: updated.customerName,
        customerPhone: updated.customerPhone,
        customerEmail: updated.customerEmail,
        partySize: updated.partySize,
        reservationDate: updated.reservationDate.toISOString().split('T')[0],
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        status: updated.status,
        notes: updated.notes,
        tableNames: updated.reservationTables.map((rt) => rt.table.name),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[POST /api/reservations/[id]/reschedule]', err);
    return errorResponse('Failed to reschedule reservation', 'INTERNAL_ERROR', 500);
  }
}