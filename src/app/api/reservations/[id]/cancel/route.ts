import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelSquareBooking } from '@/lib/square-adapter';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

// POST /api/reservations/[id]/cancel — Public cancellation endpoint (no auth required)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.reservation.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Reservation not found', 'NOT_FOUND', 404);
    }

    if (existing.status === 'cancelled') {
      return errorResponse('Reservation is already cancelled', 'ALREADY_CANCELLED', 400);
    }

    // Only pending and confirmed reservations can be cancelled by customers
    if (!['pending', 'confirmed'].includes(existing.status)) {
      return errorResponse(
        `Reservation with status '${existing.status}' cannot be cancelled online. Please call the restaurant.`,
        'INVALID_STATUS',
        400
      );
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
        details: { previousStatus: existing.status, cancelledBy: 'customer' },
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
    console.error('[POST /api/reservations/[id]/cancel]', err);
    return errorResponse('Failed to cancel reservation', 'INTERNAL_ERROR', 500);
  }
}