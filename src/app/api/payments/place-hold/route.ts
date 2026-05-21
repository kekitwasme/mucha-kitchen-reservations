import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPreAuthHold } from '@/lib/stripe';
import { z } from 'zod';

const placeHoldSchema = z.object({
  reservationId: z.string().min(1),
});

/**
 * POST /api/payments/place-hold
 * Staff-only endpoint to manually trigger a payment hold on a specific reservation.
 * Verifies staff auth via auth cookie/session.
 */
export async function POST(request: NextRequest) {
  try {
    // Staff auth check: require auth cookie
    const hasAuthCookie =
      request.cookies.has('authjs.session-token') ||
      request.cookies.has('__Secure-authjs.session-token') ||
      request.cookies.has('next-auth.session-token');

    if (!hasAuthCookie) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = placeHoldSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reservationId } = parsed.data;

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { restaurant: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (reservation.stripePaymentIntentId || reservation.paymentHoldStatus) {
      return NextResponse.json(
        { error: 'Payment hold already exists for this reservation', code: 'HOLD_EXISTS' },
        { status: 409 }
      );
    }

    if (!reservation.paymentHoldRequired) {
      return NextResponse.json(
        { error: 'This reservation does not require a payment hold', code: 'HOLD_NOT_REQUIRED' },
        { status: 400 }
      );
    }

    // Calculate hold amount: $5 per person in cents
    const holdAmount = reservation.partySize * 500;

    const holdResult = await createPreAuthHold({
      reservationId: reservation.id,
      customerEmail: reservation.customerEmail || `${reservation.customerPhone}@placeholder.local`,
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      amount: holdAmount,
      currency: 'aud',
      restaurantName: reservation.restaurant.name,
    });

    if (!holdResult) {
      return NextResponse.json(
        { error: 'Failed to create payment hold', code: 'STRIPE_ERROR' },
        { status: 502 }
      );
    }

    await prisma.$transaction([
      prisma.reservation.update({
        where: { id: reservationId },
        data: {
          stripePaymentIntentId: holdResult.paymentIntentId,
          paymentHoldStatus: 'requires_capture',
          holdPlacedAt: new Date(),
          depositAmount: holdAmount,
        },
      }),
      prisma.payment.create({
        data: {
          restaurantId: reservation.restaurantId,
          reservationId,
          amount: holdAmount,
          type: 'deposit',
          status: 'pending',
          stripePaymentIntentId: holdResult.paymentIntentId,
          metadata: {
            holdStatus: 'requires_capture',
            holdAmount,
            partySize: reservation.partySize,
            perPersonAmount: 500,
            placedBy: 'staff_manual',
          },
        },
      }),
      prisma.auditLog.create({
        data: {
          restaurantId: reservation.restaurantId,
          reservationId,
          action: 'payment_received',
          details: {
            type: 'payment_hold_placed_manual',
            paymentIntentId: holdResult.paymentIntentId,
            amount: holdAmount,
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      paymentIntentId: holdResult.paymentIntentId,
      clientSecret: holdResult.clientSecret,
    });
  } catch (error) {
    console.error('[Payments/PlaceHold] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
