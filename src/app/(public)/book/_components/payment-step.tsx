'use client';

import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Initialize Stripe — publishable key comes from env
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

interface PaymentStepProps {
  reservationId: string;
  setupIntentId: string;
  clientSecret: string;
  stripeCustomerId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

/**
 * Stripe PaymentElement form for saving card details via SetupIntent.
 *
 * Wraps PaymentElement in Elements and passes the saved payment method back to
 * the reservation API so near-term bookings can receive an immediate hold.
 */
export default function PaymentStep({
  reservationId,
  setupIntentId,
  clientSecret,
  stripeCustomerId,
  onSuccess,
  onCancel,
}: PaymentStepProps) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#0f172a',
            colorBackground: '#ffffff',
            colorText: '#0f172a',
            colorDanger: '#ef4444',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            spacingUnit: '4px',
            borderRadius: '8px',
          },
        },
      }}
    >
      <PaymentForm
        reservationId={reservationId}
        setupIntentId={setupIntentId}
        stripeCustomerId={stripeCustomerId}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  );
}

/**
 * Renders the card-saving form and finalizes the reservation payment metadata.
 *
 * On successful SetupIntent confirmation it patches the reservation with the
 * SetupIntent, customer, and payment method IDs. The server then decides whether
 * the booking qualifies for an immediate hold.
 */
function PaymentForm({
  reservationId,
  setupIntentId,
  stripeCustomerId,
  onSuccess,
  onCancel,
}: {
  reservationId: string;
  setupIntentId: string;
  stripeCustomerId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Payment validation failed');
      setIsLoading(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/confirm/${reservationId}`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Card setup failed');
      setIsLoading(false);
      return;
    }

    // Use the setupIntent ID from the response if available, otherwise fall back to the prop
    const confirmedSetupIntentId = setupIntent?.id || setupIntentId;
    const paymentMethod = setupIntent?.payment_method;
    const stripePaymentMethodId =
      typeof paymentMethod === 'string' ? paymentMethod : paymentMethod?.id;

    // SetupIntent confirmed — update reservation with SetupIntent ID and Customer ID
    try {
      const res = await fetch(`/api/reservations/${reservationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripeSetupIntentId: confirmedSetupIntentId,
          stripeCustomerId,
          stripePaymentMethodId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update reservation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize booking');
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    onSuccess();
  };

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader>
        <CardTitle className="text-center">Secure Your Reservation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            We require a card to secure your reservation.
            <strong> You won&apos;t be charged unless you don&apos;t show up.</strong>
          </p>
          <div className="border-t pt-2 mt-2 space-y-1">
            <p className="text-sm text-muted-foreground">
              Your card details will be saved securely. If your reservation starts within 24 hours, a hold may be placed now; otherwise it may be placed 24-48 hours before your reservation.
            </p>
            <p className="text-sm text-muted-foreground">
              Cancel at least 2 hours before your reservation to avoid any charges.
            </p>
          </div>
        </div>

        {/* Stripe Payment Element */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border rounded-lg p-3">
            <PaymentElement options={{ layout: 'tabs' }} />
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                className="w-full sm:w-auto sm:flex-1 h-12"
              >
                Back
              </Button>
            )}
            <Button
              type="submit"
              disabled={!stripe || isLoading}
              className="w-full sm:w-auto sm:flex-1 h-12"
            >
              {isLoading ? 'Saving card...' : 'Save Card & Confirm'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
