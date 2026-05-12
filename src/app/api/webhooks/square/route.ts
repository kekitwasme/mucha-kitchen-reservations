import { NextRequest, NextResponse } from 'next/server';
import { verifySquareWebhookSignature } from '@/lib/square';
import { prisma } from '@/lib/prisma';

// POST /api/webhooks/square — Square webhook receiver
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-signature') || '';
    const webhookSecret = process.env.SQUARE_WEBHOOK_SECRET || '';

    // Verify signature if secret is configured
    if (webhookSecret) {
      const isValid = verifySquareWebhookSignature(body, signature, webhookSecret);
      if (!isValid) {
        console.warn('[Square Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' }, { status: 400 });
      }
    } else {
      console.warn('[Square Webhook] No webhook secret configured, skipping signature verification');
    }

    const event = JSON.parse(body);
    const eventType = event.type || '';

    console.log('[Square Webhook] Received event:', eventType, event.event_id);

    // Handle booking.updated
    if (eventType === 'booking.updated') {
      const squareBookingId = event.data?.id;
      const newStatus = event.data?.status;

      if (squareBookingId) {
        // Find our reservation by Square booking ID
        const reservation = await prisma.reservation.findFirst({
          where: { squareBookingId },
        });

        if (reservation) {
          // Map Square status to our status
          let mappedStatus: string | null = null;
          if (newStatus === 'ACCEPTED' || newStatus === 'CONFIRMED') mappedStatus = 'confirmed';
          else if (newStatus === 'CANCELLED_BY_CUSTOMER' || newStatus === 'CANCELLED_BY_SELLER') mappedStatus = 'cancelled';
          else if (newStatus === 'NO_SHOW') mappedStatus = 'no_show';

          if (mappedStatus && mappedStatus !== reservation.status) {
            await prisma.$transaction(async (tx) => {
              await tx.reservation.update({
                where: { id: reservation.id },
                data: { status: mappedStatus as any },
              });

              await tx.auditLog.create({
                data: {
                  restaurantId: reservation.restaurantId,
                  reservationId: reservation.id,
                  action: 'webhook_received',
                  details: { squareEvent: eventType, squareStatus: newStatus, mappedStatus },
                },
              });
            });

            console.log(`[Square Webhook] Updated reservation ${reservation.id} to ${mappedStatus}`);
          }
        }
      }
    }

    // Handle booking.cancelled
    if (eventType === 'booking.cancelled') {
      const squareBookingId = event.data?.id;
      if (squareBookingId) {
        const reservation = await prisma.reservation.findFirst({
          where: { squareBookingId },
        });

        if (reservation && reservation.status !== 'cancelled') {
          await prisma.$transaction(async (tx) => {
            await tx.reservation.update({
              where: { id: reservation.id },
              data: { status: 'cancelled' },
            });

            await tx.auditLog.create({
              data: {
                restaurantId: reservation.restaurantId,
                reservationId: reservation.id,
                action: 'webhook_received',
                details: { squareEvent: eventType, reason: 'Square booking cancelled' },
              },
            });
          });

          console.log(`[Square Webhook] Cancelled reservation ${reservation.id}`);
        }
      }
    }

    // Handle payment.updated
    if (eventType === 'payment.updated') {
      const squarePaymentId = event.data?.id;
      const paymentStatus = event.data?.status;

      if (squarePaymentId) {
        const payment = await prisma.payment.findFirst({
          where: { squarePaymentId },
        });

        if (payment) {
          let mappedStatus: string | null = null;
          if (paymentStatus === 'COMPLETED') mappedStatus = 'completed';
          else if (paymentStatus === 'FAILED') mappedStatus = 'failed';
          else if (paymentStatus === 'CANCELED') mappedStatus = 'refunded';

          if (mappedStatus) {
            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: mappedStatus as any },
            });

            console.log(`[Square Webhook] Updated payment ${payment.id} to ${mappedStatus}`);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[POST /api/webhooks/square]', err);
    return NextResponse.json({ error: 'Webhook processing failed', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
