import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPreAuthHold } from '@/lib/stripe';
import { ReservationStatus } from '@prisma/client';

/**
 * POST /api/cron/place-holds
 * Cron endpoint that places payment holds for reservations coming up soon.
 *
 * Reads `holdHoursBefore` from restaurant settings (default 48h).
 * Finds all confirmed/pending reservations where:
 *   - paymentHoldRequired = true
 *   - paymentHoldStatus is null (no hold placed yet)
 *   - startTime is within next holdHoursBefore hours but >0 hours away
 *
 * Idempotent — running twice should not double-place holds because we
 * filter for paymentHoldStatus = null.
 *
 * Returns: { placed: number, failed: number, skipped: number }
 */
export async function POST(request: NextRequest) {
  try {
    // Optional simple auth: verify a CRON_SECRET header if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
      }
    }

    const restaurant = await prisma.restaurant.findFirst();
    if (!restaurant) {
      return NextResponse.json({ error: 'No restaurant found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const holdHoursBefore = (restaurant.holdHoursBefore as number | undefined) ?? 48;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + holdHoursBefore * 60 * 60 * 1000);

    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId: restaurant.id,
        status: { in: ['pending', 'confirmed'] as ReservationStatus[] },
        paymentHoldRequired: true,
        paymentHoldStatus: null,
        startTime: {
          gt: now,
          lte: windowEnd,
        },
      },
      include: { restaurant: true },
    });

    let placed = 0;
    let failed = 0;
    let skipped = 0;

    for (const reservation of reservations) {
      try {
        // Double-check idempotency inside loop
        if (reservation.stripePaymentIntentId || reservation.paymentHoldStatus) {
          skipped++;
          continue;
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
          failed++;
          console.error(`[Cron/PlaceHolds] Failed to create hold for reservation ${reservation.id}`);
          continue;
        }

        await prisma.$transaction([
          prisma.reservation.update({
            where: { id: reservation.id },
            data: {
              stripePaymentIntentId: holdResult.paymentIntentId,
              paymentHoldStatus: 'requires_capture',
              holdPlacedAt: new Date(),
              holdReminderSent: true,
              depositAmount: holdAmount,
            },
          }),
          prisma.payment.create({
            data: {
              restaurantId: reservation.restaurantId,
              reservationId: reservation.id,
              amount: holdAmount,
              type: 'deposit',
              status: 'pending',
              stripePaymentIntentId: holdResult.paymentIntentId,
              metadata: {
                holdStatus: 'requires_capture',
                holdAmount,
                partySize: reservation.partySize,
                perPersonAmount: 500,
                placedBy: 'cron',
              },
            },
          }),
          prisma.auditLog.create({
            data: {
              restaurantId: reservation.restaurantId,
              reservationId: reservation.id,
              action: 'payment_received',
              details: {
                type: 'payment_hold_placed_cron',
                paymentIntentId: holdResult.paymentIntentId,
                amount: holdAmount,
                holdHoursBefore,
              },
            },
          }),
        ]);

        placed++;
      } catch (innerError) {
        failed++;
        console.error(`[Cron/PlaceHolds] Error processing reservation ${reservation.id}:`, innerError);
        // Continue with next reservation
      }
    }

    return NextResponse.json({
      placed,
      failed,
      skipped,
      holdHoursBefore,
      checkedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[Cron/PlaceHolds] Fatal error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
