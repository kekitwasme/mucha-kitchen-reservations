import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPreAuthHold, captureHold, releaseHold } from '@/lib/stripe';
import { z } from 'zod';

const holdSchema = z.object({
  reservationId: z.string().min(1),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  partySize: z.number().int().min(1),
});

/**
 * POST /api/payments/hold
 * Create a pre-authorization hold for a reservation.
 * Amount = $5 × partySize in cents.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = holdSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reservationId, customerEmail, customerName, customerPhone, partySize } = parsed.data;

    // Get restaurant details for the reservation
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { restaurant: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // Check if hold already exists
    if (reservation.stripePaymentIntentId) {
      return NextResponse.json(
        { error: 'Payment hold already exists for this reservation' },
        { status: 409 }
      );
    }

    // Calculate hold amount: $5 per person in cents
    const holdAmount = partySize * 500; // $5 = 500 cents

    // Create Stripe PaymentIntent with manual capture
    const holdResult = await createPreAuthHold({
      reservationId,
      customerEmail,
      customerName,
      customerPhone,
      amount: holdAmount,
      currency: 'aud',
      restaurantName: reservation.restaurant.name,
    });

    if (!holdResult) {
      return NextResponse.json(
        { error: 'Failed to create payment hold' },
        { status: 502 }
      );
    }

    // Update reservation with PaymentIntent ID and hold status
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        stripePaymentIntentId: holdResult.paymentIntentId,
        paymentHoldStatus: 'requires_capture',
        depositAmount: holdAmount,
      },
    });

    // Create Payment record for audit trail
    await prisma.payment.create({
      data: {
        restaurantId: reservation.restaurantId,
        reservationId,
        amount: holdAmount,
        type: 'deposit',
        status: 'pending',
        stripePaymentIntentId: holdResult.paymentIntentId,
        metadata: {
          holdStatus: 'requires_capture',
          holdAmount: holdAmount,
          partySize,
          perPersonAmount: 500,
        },
      },
    });

    return NextResponse.json({
      success: true,
      clientSecret: holdResult.clientSecret,
      paymentIntentId: holdResult.paymentIntentId,
      holdAmount,
      currency: 'aud',
    });
  } catch (error) {
    console.error('[Payments/Hold] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
