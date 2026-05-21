import { prisma } from '@/lib/prisma';
import { createHoldFromSavedCard, releaseHold } from '@/lib/stripe';

const IMMEDIATE_HOLD_WINDOW_HOURS = 24;
const HOLD_AMOUNT_PER_PERSON = 500;

type HoldPlacementResult =
  | { status: 'placed'; paymentIntentId: string; holdAmount: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Returns whether a reservation starts within the immediate hold window measured
 * from the time the booking was created.
 */
function isWithinImmediateHoldWindow(startTime: Date, createdAt: Date, now: Date) {
  const windowEnd = new Date(createdAt.getTime() + IMMEDIATE_HOLD_WINDOW_HOURS * 60 * 60 * 1000);
  return startTime > now && startTime <= windowEnd;
}

/**
 * Places a saved-card payment hold for near-term reservations.
 *
 * The hold is only attempted for active reservations that need a hold, have no
 * existing hold, have a saved Stripe payment method, and start within 24 hours
 * of the original booking time. The database write is idempotent; if another
 * path wins the race after Stripe authorizes the hold, the new hold is released.
 */
export async function placeImmediateHoldIfNeeded(
  reservationId: string,
  source: string
): Promise<HoldPlacementResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { restaurant: true },
  });

  if (!reservation) {
    return { status: 'skipped', reason: 'reservation_not_found' };
  }

  if (!['pending', 'confirmed'].includes(reservation.status)) {
    return { status: 'skipped', reason: 'reservation_not_active' };
  }

  if (!reservation.paymentHoldRequired) {
    return { status: 'skipped', reason: 'hold_not_required' };
  }

  if (reservation.stripePaymentIntentId || reservation.paymentHoldStatus) {
    return { status: 'skipped', reason: 'hold_already_exists' };
  }

  if (!reservation.stripeCustomerId || !reservation.stripePaymentMethodId) {
    return { status: 'skipped', reason: 'missing_saved_card' };
  }

  const now = new Date();
  if (!isWithinImmediateHoldWindow(reservation.startTime, reservation.createdAt, now)) {
    return { status: 'skipped', reason: 'outside_24_hour_booking_window' };
  }

  const holdAmount = reservation.partySize * HOLD_AMOUNT_PER_PERSON;
  const holdResult = await createHoldFromSavedCard({
    reservationId: reservation.id,
    customerId: reservation.stripeCustomerId,
    paymentMethodId: reservation.stripePaymentMethodId,
    amount: holdAmount,
    currency: 'aud',
    restaurantName: reservation.restaurant.name,
  });

  if (!holdResult) {
    return { status: 'failed', reason: 'stripe_hold_failed' };
  }

  const placedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.reservation.updateMany({
        where: {
          id: reservation.id,
          stripePaymentIntentId: null,
          paymentHoldStatus: null,
        },
        data: {
          stripePaymentIntentId: holdResult.paymentIntentId,
          paymentHoldStatus: 'requires_capture',
          holdPlacedAt: placedAt,
          holdReminderSent: true,
          depositAmount: holdAmount,
        },
      });

      if (updateResult.count === 0) {
        throw new Error('HOLD_ALREADY_EXISTS');
      }

      await tx.payment.create({
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
            perPersonAmount: HOLD_AMOUNT_PER_PERSON,
            placedBy: source,
            source: 'saved_card',
            immediateHoldWindowHours: IMMEDIATE_HOLD_WINDOW_HOURS,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: reservation.restaurantId,
          reservationId: reservation.id,
          action: 'payment_received',
          details: {
            type: 'payment_hold_placed_immediate',
            paymentIntentId: holdResult.paymentIntentId,
            amount: holdAmount,
            source,
            immediateHoldWindowHours: IMMEDIATE_HOLD_WINDOW_HOURS,
          },
        },
      });
    });
  } catch (error) {
    await releaseHold(holdResult.paymentIntentId);

    if (error instanceof Error && error.message === 'HOLD_ALREADY_EXISTS') {
      return { status: 'skipped', reason: 'hold_already_exists' };
    }

    console.error(`[PaymentHolds] Failed to persist immediate hold for ${reservation.id}:`, error);
    return { status: 'failed', reason: 'database_update_failed' };
  }

  console.log(
    `[PaymentHolds] Placed immediate hold for reservation ${reservation.id} via ${source}`
  );

  return {
    status: 'placed',
    paymentIntentId: holdResult.paymentIntentId,
    holdAmount,
  };
}
