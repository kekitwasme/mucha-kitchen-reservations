import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyStripeWebhookSignature } from '@/lib/stripe';

/**
 * POST /api/webhooks/stripe
 * Receives Stripe webhook events for PaymentIntent status changes
 * and SetupIntent completion.
 *
 * Events handled:
 * - payment_intent.amount_capturable_updated → hold is ready
 * - payment_intent.payment_failed → hold failed
 * - payment_intent.canceled → hold was canceled
 * - payment_intent.succeeded → hold was captured
 * - setup_intent.succeeded → card saved successfully, store payment method
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature') || '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!webhookSecret) {
      console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    // Verify webhook signature
    const event = await verifyStripeWebhookSignature(payload, signature, webhookSecret);

    if (!event) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    // Handle relevant events
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated': {
        const pi = event.data.object as { id: string; amount_capturable?: number; amount: number };
        await updatePaymentHoldStatus(pi.id, 'requires_capture', pi.amount_capturable ?? pi.amount);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as { id: string; amount: number };
        await updatePaymentHoldStatus(pi.id, 'failed', pi.amount);
        break;
      }

      case 'payment_intent.canceled': {
        const pi = event.data.object as { id: string; amount: number };
        await updatePaymentHoldStatus(pi.id, 'canceled', pi.amount);
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as { id: string; amount_received?: number; amount: number };
        await updatePaymentHoldStatus(pi.id, 'captured', pi.amount_received ?? pi.amount);
        break;
      }

      case 'setup_intent.succeeded': {
        const si = event.data.object as {
          id: string;
          customer: string | { id: string };
          payment_method: string | { id: string } | null;
        };
        await handleSetupIntentSucceeded(si);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle setup_intent.succeeded — store the saved payment method on the reservation.
 */
async function handleSetupIntentSucceeded(
  setupIntent: {
    id: string;
    customer: string | { id: string };
    payment_method: string | { id: string } | null;
  }
) {
  try {
    const setupIntentId = setupIntent.id;
    const customerId =
      typeof setupIntent.customer === 'string'
        ? setupIntent.customer
        : setupIntent.customer?.id;

    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!setupIntentId || !customerId || !paymentMethodId) {
      console.warn('[Stripe Webhook] SetupIntent missing required fields', {
        setupIntentId,
        customerId,
        paymentMethodId,
      });
      return;
    }

    // Find reservation by SetupIntent ID
    const reservation = await prisma.reservation.findFirst({
      where: { stripeSetupIntentId: setupIntentId },
    });

    if (!reservation) {
      console.warn(`[Stripe Webhook] No reservation found for SetupIntent ${setupIntentId}`);
      return;
    }

    // Update reservation with customer ID and saved payment method
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        stripeCustomerId: customerId,
        stripePaymentMethodId: paymentMethodId,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        restaurantId: reservation.restaurantId,
        reservationId: reservation.id,
        action: 'updated',
        details: {
          type: 'setup_intent_succeeded',
          setupIntentId,
          customerId,
          paymentMethodId,
        },
      },
    });

    console.log(
      `[Stripe Webhook] Updated reservation ${reservation.id} with saved payment method ${paymentMethodId}`
    );
  } catch (error) {
    console.error('[Stripe Webhook] handleSetupIntentSucceeded failed:', error);
  }
}

/**
 * Update reservation and payment records based on Stripe webhook events.
 */
async function updatePaymentHoldStatus(
  paymentIntentId: string,
  status: string,
  amount?: number
) {
  try {
    // Find reservation by PaymentIntent ID
    const reservation = await prisma.reservation.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!reservation) {
      console.warn(`[Stripe Webhook] No reservation found for PaymentIntent ${paymentIntentId}`);
      return;
    }

    // Map Stripe status to our PaymentHoldStatus
    const holdStatusMap: Record<string, string> = {
      requires_capture: 'requires_capture',
      failed: 'failed',
      canceled: 'canceled',
      captured: 'captured',
    };

    const mappedStatus = holdStatusMap[status] || status;

    // Update reservation
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        paymentHoldStatus: mappedStatus as 'requires_capture' | 'captured' | 'canceled' | 'failed',
      },
    });

    // Update payment record
    const paymentStatusMap: Record<string, string> = {
      requires_capture: 'pending',
      captured: 'completed',
      canceled: 'refunded',
      failed: 'failed',
    };

    await prisma.payment.updateMany({
      where: {
        reservationId: reservation.id,
        stripePaymentIntentId: paymentIntentId,
      },
      data: {
        status: paymentStatusMap[mappedStatus] as 'pending' | 'completed' | 'refunded' | 'failed',
        ...(amount ? { amount } : {}),
      },
    });

    console.log(`[Stripe Webhook] Updated reservation ${reservation.id} hold status to ${mappedStatus}`);
  } catch (error) {
    console.error('[Stripe Webhook] updatePaymentHoldStatus failed:', error);
  }
}
