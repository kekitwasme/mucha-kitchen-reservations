import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelSquareBooking } from '@/lib/square-adapter';
import { releaseHold } from '@/lib/stripe';

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

    // Check if cancellation is within 2-hour window
    const now = new Date();
    const startTime = new Date(existing.startTime);
    const hoursUntilReservation = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isWithinTwoHours = hoursUntilReservation <= 2;

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
        details: {
          previousStatus: existing.status,
          cancelledBy: 'customer',
          hoursUntilReservation: Math.round(hoursUntilReservation * 10) / 10,
          isWithinTwoHours,
        },
      },
    });

    // Release Stripe hold if one exists and is in requires_capture state
    if (existing.stripePaymentIntentId && existing.paymentHoldStatus === 'requires_capture') {
      const releaseResult = await releaseHold(existing.stripePaymentIntentId);
      if (releaseResult.success) {
        await prisma.reservation.update({
          where: { id },
          data: { paymentHoldStatus: 'canceled' },
        });
        await prisma.payment.updateMany({
          where: {
            reservationId: id,
            stripePaymentIntentId: existing.stripePaymentIntentId,
          },
          data: {
            status: 'refunded',
            metadata: {
              releasedAt: new Date().toISOString(),
              reason: 'customer_cancel',
              hoursBeforeReservation: Math.round(hoursUntilReservation * 10) / 10,
            },
          },
        });
      }
    } else if (!existing.stripePaymentIntentId && !existing.paymentHoldStatus && !existing.holdPlacedAt) {
      // No Stripe interaction needed — hold was never placed (e.g. deferred hold, far-future reservation)
      console.log(`[Cancel] Reservation ${id} has no hold to release. Skipping Stripe.`);
    } else if (existing.paymentHoldStatus === 'captured') {
      // Already a charge — refund is out of scope, log for manual handling
      console.warn(`[Cancel] Reservation ${id} has a captured payment. Refund must be handled manually.`);
    }

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

    return NextResponse.json({
      success: true,
      holdReleased:
        existing.stripePaymentIntentId != null &&
        existing.paymentHoldStatus === 'requires_capture',
      isWithinTwoHours,
    });
  } catch (err) {
    console.error('[POST /api/reservations/[id]/cancel]', err);
    return errorResponse('Failed to cancel reservation', 'INTERNAL_ERROR', 500);
  }
}