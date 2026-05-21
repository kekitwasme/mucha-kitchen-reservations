import Stripe from 'stripe';

// Stripe SDK client — lazy initialization to avoid build-time errors
let _stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (_stripeClient) return _stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  if (!secretKey) {
    console.warn('[Stripe] No STRIPE_SECRET_KEY configured');
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  _stripeClient = new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil',
    typescript: true,
  });

  return _stripeClient;
}

// Export a getter that lazy-initializes the client
export function getStripe(): Stripe {
  return getStripeClient();
}

interface HoldData {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  amount: number; // in cents
  currency?: string; // default 'aud'
  restaurantName?: string;
}

/**
 * Create a PaymentIntent with capture_method: 'manual' (pre-auth hold).
 * Returns the PaymentIntent ID and client_secret for the frontend.
 */
export async function createPreAuthHold(data: HoldData): Promise<{
  paymentIntentId: string;
  clientSecret: string;
  status: string;
} | null> {
  try {
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: data.amount,
      currency: data.currency || 'aud',
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      metadata: {
        reservationId: data.reservationId,
        restaurantName: data.restaurantName || 'Restaurant',
      },
      receipt_email: data.customerEmail,
      description: `Booking hold for ${data.customerName} — $${(data.amount / 100).toFixed(2)}`,
    });

    if (!paymentIntent.id || !paymentIntent.client_secret) {
      console.error('[Stripe] PaymentIntent created but missing id or client_secret');
      return null;
    }

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
    };
  } catch (error) {
    console.error('[Stripe] createPreAuthHold failed:', error);
    return null;
  }
}

/**
 * Capture a held PaymentIntent (convert hold to charge).
 * Returns true if successful.
 */
export async function captureHold(paymentIntentId: string): Promise<{
  success: boolean;
  capturedAmount?: number;
  error?: string;
}> {
  try {
    const paymentIntent = await getStripe().paymentIntents.capture(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        error: `PaymentIntent status is ${paymentIntent.status}, expected succeeded`,
      };
    }

    return {
      success: true,
      capturedAmount: paymentIntent.amount_received,
    };
  } catch (error) {
    console.error('[Stripe] captureHold failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Cancel/release a held PaymentIntent (returns funds to customer).
 * Returns true if successful.
 */
export async function releaseHold(paymentIntentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const paymentIntent = await getStripe().paymentIntents.cancel(paymentIntentId);

    if (paymentIntent.status !== 'canceled') {
      return {
        success: false,
        error: `PaymentIntent status is ${paymentIntent.status}, expected canceled`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[Stripe] releaseHold failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Refund a captured payment (partial or full).
 * amount in cents — omit for full refund.
 */
export async function refundPayment(
  paymentIntentId: string,
  amount?: number
): Promise<{
  success: boolean;
  refundId?: string;
  error?: string;
}> {
  try {
    // First, get the charge ID from the PaymentIntent
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
    const chargeId = pi.latest_charge as string | undefined;

    if (!chargeId) {
      return { success: false, error: 'No charge found on PaymentIntent' };
    }

    const refund = await getStripe().refunds.create({
      charge: chargeId,
      ...(amount ? { amount } : {}),
    });

    return { success: true, refundId: refund.id };
  } catch (error) {
    console.error('[Stripe] refundPayment failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retrieve PaymentIntent status from Stripe.
 */
export async function getPaymentIntentStatus(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent | null> {
  try {
    return await getStripe().paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error('[Stripe] getPaymentIntentStatus failed:', error);
    return null;
  }
}

/**
 * Verify Stripe webhook signature.
 */
export async function verifyStripeWebhookSignature(
  body: string | Buffer,
  signature: string,
  secret: string
): Promise<Stripe.Event | null> {
  try {
    return getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    console.warn('[Stripe Webhook] Signature verification failed:', error);
    return null;
  }
}
