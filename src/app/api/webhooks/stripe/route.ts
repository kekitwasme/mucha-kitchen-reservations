import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyStripeWebhookSignature } from '@/lib/stripe';

/**
 * POST /api/webhooks/stripe
 * Receives Stripe webhook events for PaymentIntent status changes.
 * 
 * Events handled:
 * - payment_intent.amount_capturable_updated → hold is ready
 * - payment_intent.payment_failed → hold failed
 * - payment_intent.canceled → hold was canceled
 * - payment_intent.succeeded → hold was captured
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
        const pi = event.data.object;
        await updatePaymentHoldStatus(pi.id, 'requires_capture', pi.amount_capturable ?? pi.amount);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await updatePaymentHoldStatus(pi.id, 'failed', pi.amount);
        break;
      }

      case 'payment_intent.canceled': {
        const pi = event.data.object;
        await updatePaymentHoldStatus(pi.id, 'canceled', pi.amount);
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        await updatePaymentHoldStatus(pi.id, 'captured', pi.amount_received ?? pi.amount);
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
        paymentHoldStatus: mappedStatus as any,
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
        status: paymentStatusMap[mappedStatus] as any,
        ...(amount ? { amount } : {}),
      },
    });

    console.log(`[Stripe Webhook] Updated reservation ${reservation.id} hold status to ${mappedStatus}`);
  } catch (error) {
    console.error('[Stripe Webhook] updatePaymentHoldStatus failed:', error);
  }
}
