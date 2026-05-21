import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelSquareBooking } from '@/lib/square-adapter';
import { releaseHold } from '@/lib/stripe';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

/**
 * Public customer cancellation endpoint.
 *
 * If a releasable Stripe hold exists, it is released before the reservation is
 * marked cancelled so we do not leave a cancelled booking with an active hold.
 */
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
    let holdReleased = false;

    if (existing.stripePaymentIntentId && existing.paymentHoldStatus === 'requires_capture') {
      const releaseResult = await releaseHold(existing.stripePaymentIntentId);

      if (!releaseResult.success) {
        console.error('[Cancel] Failed to release payment hold:', releaseResult.error);
        return errorResponse('Failed to release payment hold. Please call the restaurant.', 'HOLD_RELEASE_FAILED', 502);
      }

      holdReleased = true;
    } else if (!existing.stripePaymentIntentId && !existing.paymentHoldStatus && !existing.holdPlacedAt) {
      console.log(`[Cancel] Reservation ${id} has no hold to release. Skipping Stripe.`);
    } else if (existing.paymentHoldStatus === 'captured') {
      console.warn(`[Cancel] Reservation ${id} has a captured payment. Refund must be handled manually.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id },
        data: {
          status: 'cancelled',
          ...(holdReleased ? { paymentHoldStatus: 'canceled' as const } : {}),
        },
      });

      if (holdReleased && existing.stripePaymentIntentId) {
        const payment = await tx.payment.findFirst({
          where: {
            reservationId: id,
            stripePaymentIntentId: existing.stripePaymentIntentId,
          },
        });

        await tx.payment.updateMany({
          where: {
            reservationId: id,
            stripePaymentIntentId: existing.stripePaymentIntentId,
          },
          data: {
            status: 'refunded',
            metadata: {
              ...((payment?.metadata as Record<string, unknown> | null) ?? {}),
              releasedAt: new Date().toISOString(),
              reason: 'customer_cancel',
              hoursBeforeReservation: Math.round(hoursUntilReservation * 10) / 10,
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          restaurantId: existing.restaurantId,
          reservationId: id,
          action: 'cancelled',
          details: {
            previousStatus: existing.status,
            cancelledBy: 'customer',
            hoursUntilReservation: Math.round(hoursUntilReservation * 10) / 10,
            isWithinTwoHours,
            holdReleased,
          },
        },
      });
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

    return NextResponse.json({
      success: true,
      holdReleased,
      isWithinTwoHours,
    });
  } catch (err) {
    console.error('[POST /api/reservations/[id]/cancel]', err);
    return errorResponse('Failed to cancel reservation', 'INTERNAL_ERROR', 500);
  }
}
