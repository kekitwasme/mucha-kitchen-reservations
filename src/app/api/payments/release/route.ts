import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { releaseHold } from '@/lib/stripe';
import { z } from 'zod';

const releaseSchema = z.object({
  reservationId: z.string().min(1),
  reason: z.enum(['customer_cancel', 'staff_cancel', 'seated', 'completed', 'other']).optional(),
});

/**
 * POST /api/payments/release
 * Release/cancel a pre-authorization hold.
 * Called when:
 * - Guest cancels ≥2h before reservation (customer_cancel)
 * - Staff cancels or marks seated/completed (staff_cancel, seated, completed)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = releaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reservationId, reason = 'other' } = parsed.data;

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (!reservation.stripePaymentIntentId) {
      return NextResponse.json(
        { error: 'No payment hold found for this reservation' },
        { status: 404 }
      );
    }

    // Can only release holds that are in 'requires_capture' state
    if (reservation.paymentHoldStatus !== 'requires_capture') {
      return NextResponse.json(
        { error: `Hold already ${reservation.paymentHoldStatus}, cannot release` },
        { status: 400 }
      );
    }

    // Release via Stripe
    const result = await releaseHold(reservation.stripePaymentIntentId);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to release hold', details: result.error },
        { status: 502 }
      );
    }

    // Update reservation
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        paymentHoldStatus: 'canceled',
      },
    });

    // Update payment record
    await prisma.payment.updateMany({
      where: {
        reservationId,
        stripePaymentIntentId: reservation.stripePaymentIntentId,
      },
      data: {
        status: 'refunded',
        metadata: {
          releasedAt: new Date().toISOString(),
          reason,
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        restaurantId: reservation.restaurantId,
        reservationId,
        action: 'updated',
        details: {
          type: 'payment_hold_released',
          paymentIntentId: reservation.stripePaymentIntentId,
          reason,
          amount: reservation.depositAmount,
        },
      },
    });

    return NextResponse.json({
      success: true,
      released: true,
      paymentIntentId: reservation.stripePaymentIntentId,
    });
  } catch (error) {
    console.error('[Payments/Release] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
