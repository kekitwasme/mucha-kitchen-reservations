import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { updateReservationSchema } from '@/lib/schemas';
import { getTurnTime, combineDateTime } from '@/lib/utils';
import { cancelSquareBooking, updateSquareBooking } from '@/lib/square-adapter';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

// GET /api/reservations/[id] — Get reservation detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        reservationTables: { include: { table: true } },
        payments: true,
        auditLogs: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!reservation) {
      return errorResponse('Reservation not found', 'NOT_FOUND', 404);
    }

    const result = {
      ...reservation,
      reservationDate: reservation.reservationDate.toISOString().split('T')[0],
      startTime: reservation.startTime.toISOString(),
      endTime: reservation.endTime.toISOString(),
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
      tables: reservation.reservationTables.map((rt) => rt.table),
      tableIds: reservation.reservationTables.map((rt) => rt.tableId),
      tableNames: reservation.reservationTables.map((rt) => rt.table.name),
    };

    return NextResponse.json({ reservation: result });
  } catch (err) {
    console.error('[GET /api/reservations/[id]]', err);
    return errorResponse('Failed to fetch reservation', 'INTERNAL_ERROR', 500);
  }
}

// PATCH /api/reservations/[id] — Update reservation (staff/admin)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // TODO: Add auth check — staff/admin
    const { id } = await params;
    const body = await request.json();
    const parsed = updateReservationSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse('Invalid update data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const data = parsed.data;

    // Fetch existing reservation
    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: { reservationTables: true },
    });

    if (!existing) {
      return errorResponse('Reservation not found', 'NOT_FOUND', 404);
    }

    // Determine if we need conflict detection (time/party/tables changed)
    const needsConflictCheck =
      data.startTime !== undefined ||
      data.partySize !== undefined ||
      data.tableIds !== undefined ||
      data.reservationDate !== undefined;

    if (needsConflictCheck) {
      // Re-run conflict detection in a transaction
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: existing.restaurantId },
      });
      if (!restaurant) {
        return errorResponse('Restaurant not found', 'NOT_FOUND', 404);
      }

      const partySize = data.partySize ?? existing.partySize;
      const reservationDate = data.reservationDate
        ? new Date(data.reservationDate + 'T00:00:00')
        : existing.reservationDate;
      const startTimeStr = data.startTime ?? existing.startTime.toTimeString().slice(0, 5);
      const turnTimeRules = restaurant.turnTimeRules as Record<string, number>;
      const turnMinutes = getTurnTime(partySize, turnTimeRules);

      const startDateTime = combineDateTime(reservationDate, startTimeStr);
      const endDateTime = new Date(startDateTime.getTime() + turnMinutes * 60000);

      const tableIds = data.tableIds ?? existing.reservationTables.map((rt) => rt.tableId);

      // Check for overlaps in transaction
      await prisma.$transaction(
        async (tx) => {
          const overlapping = await tx.$queryRaw<{ id: string }[]>`
            SELECT DISTINCT r.id
            FROM "Reservation" r
            JOIN "ReservationTable" rt ON rt.reservation_id = r.id
            WHERE r.restaurant_id = ${existing.restaurantId}
              AND r.id != ${id}
              AND r.status NOT IN ('cancelled', 'no_show')
              AND rt.table_id = ANY(${tableIds}::text[])
              AND r.start_time < ${endDateTime}
              AND r.end_time > ${startDateTime}
          `;

          if (overlapping.length > 0) {
            throw new Error('OVERLAP');
          }

          // Update the reservation
          const updateData: Prisma.ReservationUpdateInput = {
            ...(data.customerName && { customerName: data.customerName }),
            ...(data.customerPhone && { customerPhone: data.customerPhone }),
            ...(data.customerEmail !== undefined && { customerEmail: data.customerEmail }),
            ...(data.partySize && { partySize: data.partySize }),
            ...(data.notes !== undefined && { notes: data.notes }),
            ...(data.status && { status: data.status }),
            startTime: startDateTime,
            endTime: endDateTime,
            reservationDate,
          };

          await tx.reservation.update({
            where: { id },
            data: updateData,
          });

          // If tableIds changed, recreate joins
          if (data.tableIds) {
            await tx.reservationTable.deleteMany({
              where: { reservationId: id },
            });
            await tx.reservationTable.createMany({
              data: data.tableIds.map((tableId: string) => ({
                reservationId: id,
                tableId,
              })),
            });
          }

          // Audit log
          await tx.auditLog.create({
            data: {
              restaurantId: existing.restaurantId,
              reservationId: id,
              action: data.status === 'seated' ? 'seated' :
                      data.status === 'completed' ? 'completed' :
                      data.status === 'no_show' ? 'no_show' : 'updated',
              details: data,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      // Async Square sync for updates
      if (existing.squareBookingId) {
        (async () => {
          try {
            if (data.status === 'cancelled') {
              await cancelSquareBooking(existing.squareBookingId);
            } else {
              await updateSquareBooking(existing.squareBookingId, {
                reservationId: id,
                customerName: data.customerName ?? existing.customerName,
                customerPhone: data.customerPhone ?? existing.customerPhone,
                startTime: startDateTime,
                endTime: endDateTime,
                partySize,
                tableNames: [],
                notes: data.notes ?? existing.notes ?? undefined,
              });
            }
          } catch (err) {
            console.error('[Square Sync] Update sync failed:', err);
          }
        })();
      }
    } else {
      // Simple update, no conflict check needed
      const updateData: Prisma.ReservationUpdateInput = {
        ...(data.customerName && { customerName: data.customerName }),
        ...(data.customerPhone && { customerPhone: data.customerPhone }),
        ...(data.customerEmail !== undefined && { customerEmail: data.customerEmail }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status && { status: data.status }),
      };

      await prisma.reservation.update({
        where: { id },
        data: updateData,
      });

      // Audit log for status changes
      if (data.status) {
        await prisma.auditLog.create({
          data: {
            restaurantId: existing.restaurantId,
            reservationId: id,
            action: data.status === 'seated' ? 'seated' :
                    data.status === 'completed' ? 'completed' :
                    data.status === 'no_show' ? 'no_show' :
                    data.status === 'cancelled' ? 'cancelled' : 'updated',
            details: { status: data.status },
          },
        });
      }

      // Async Square sync for simple updates (including cancellation)
      if (existing.squareBookingId) {
        (async () => {
          try {
            if (data.status === 'cancelled') {
              await cancelSquareBooking(existing.squareBookingId);
            } else if (data.status && data.status !== existing.status) {
              // Status change that isn't cancellation — update Square
              await updateSquareBooking(existing.squareBookingId, {
                reservationId: id,
                customerName: data.customerName ?? existing.customerName,
                customerPhone: data.customerPhone ?? existing.customerPhone,
                startTime: existing.startTime,
                endTime: existing.endTime,
                partySize: existing.partySize,
                tableNames: [],
                notes: data.notes ?? existing.notes ?? undefined,
              });
            }
          } catch (err) {
            console.error('[Square Sync] Simple update sync failed:', err);
          }
        })();
      }
    }

    // Fetch updated reservation
    const updated = await prisma.reservation.findUnique({
      where: { id },
      include: {
        reservationTables: { include: { table: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json({
      reservation: {
        ...updated,
        reservationDate: updated!.reservationDate.toISOString().split('T')[0],
        startTime: updated!.startTime.toISOString(),
        endTime: updated!.endTime.toISOString(),
        tableIds: updated!.reservationTables.map((rt) => rt.tableId),
        tableNames: updated!.reservationTables.map((rt) => rt.table.name),
        createdAt: updated!.createdAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'OVERLAP') {
      return errorResponse('Time slot conflicts with an existing reservation', 'OVERLAP', 409);
    }

    console.error('[PATCH /api/reservations/[id]]', err);
    return errorResponse('Failed to update reservation', 'INTERNAL_ERROR', 500);
  }
}

// DELETE /api/reservations/[id] — Cancel reservation
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // TODO: Add auth check — staff/admin or owner
    const { id } = await params;

    const existing = await prisma.reservation.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Reservation not found', 'NOT_FOUND', 404);
    }

    if (existing.status === 'cancelled') {
      return errorResponse('Reservation is already cancelled', 'ALREADY_CANCELLED', 400);
    }

    // Update status to cancelled
    await prisma.reservation.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        restaurantId: existing.restaurantId,
        reservationId: id,
        action: 'cancelled',
        details: { previousStatus: existing.status },
      },
    });

    // Async Square cancel
    if (existing.squareBookingId) {
      (async () => {
        try {
          await cancelSquareBooking(existing.squareBookingId);
        } catch (err) {
          console.error('[Square Sync] Cancel booking failed:', err);
        }
      })();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/reservations/[id]]', err);
    return errorResponse('Failed to cancel reservation', 'INTERNAL_ERROR', 500);
  }
}