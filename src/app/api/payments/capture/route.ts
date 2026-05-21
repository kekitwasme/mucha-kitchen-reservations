import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { captureHold } from '@/lib/stripe';
import { z } from 'zod';

const captureSchema = z.object({
  reservationId: z.string().min(1),
});

/**
 * POST /api/payments/capture
 * Capture a pre-authorization hold (staff only).
 * Converts hold to actual charge. Used when guest is marked no-show.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = captureSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reservationId } = parsed.data;

    // Get the reservation with payment details
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { payments: true },
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

    if (reservation.paymentHoldStatus !== 'requires_capture') {
      return NextResponse.json(
        { error: `Hold status is ${reservation.paymentHoldStatus}, cannot capture` },
        { status: 400 }
      );
    }

    // Capture the hold via Stripe
    const result = await captureHold(reservation.stripePaymentIntentId);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to capture hold', details: result.error },
        { status: 502 }
      );
    }

    // Update reservation
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        paymentHoldStatus: 'captured',
      },
    });

    // Update payment record
    await prisma.payment.updateMany({
      where: {
        reservationId,
        stripePaymentIntentId: reservation.stripePaymentIntentId,
      },
      data: {
        status: 'completed',
        type: 'no_show_fee',
        metadata: {
          capturedAt: new Date().toISOString(),
          capturedAmount: result.capturedAmount,
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        restaurantId: reservation.restaurantId,
        reservationId,
        action: 'payment_received',
        details: {
          type: 'no_show_fee_capture',
          amount: reservation.depositAmount,
          paymentIntentId: reservation.stripePaymentIntentId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      capturedAmount: result.capturedAmount,
      paymentIntentId: reservation.stripePaymentIntentId,
    });
  } catch (error) {
    console.error('[Payments/Capture] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
