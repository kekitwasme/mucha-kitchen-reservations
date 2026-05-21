import { NextRequest, NextResponse } from 'next/server';
import { createSetupIntent } from '@/lib/stripe';
import { z } from 'zod';

const setupIntentSchema = z.object({
  customerEmail: z.string().email(),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(5).max(20).optional(),
});

/**
 * POST /api/payments/setup-intent
 * Create a Stripe SetupIntent to save card details at booking time.
 * Does NOT charge the card — just saves it for later off-session hold.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = setupIntentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { customerEmail, customerName, customerPhone } = parsed.data;

    const result = await createSetupIntent({
      customerEmail,
      customerName,
      customerPhone,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create SetupIntent', code: 'STRIPE_ERROR' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      setupIntentId: result.setupIntentId,
      clientSecret: result.clientSecret,
      customerId: result.customerId,
    });
  } catch (error) {
    console.error('[Payments/SetupIntent] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
