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
import { useBookingStore } from '@/lib/store';

// Initialize Stripe — publishable key comes from env
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

interface PaymentStepProps {
  clientSecret: string;
  holdAmount: number;
  partySize: number;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Stripe PaymentElement form for confirming a pre-auth hold.
 * Wraps PaymentElement in Elements provider.
 */
export default function PaymentStep({
  clientSecret,
  holdAmount,
  partySize,
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
        holdAmount={holdAmount}
        partySize={partySize}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  );
}

function PaymentForm({
  holdAmount,
  partySize,
  onSuccess,
  onCancel,
}: {
  holdAmount: number;
  partySize: number;
  onSuccess: () => void;
  onCancel: () => void;
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

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/confirm`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment confirmation failed');
      setIsLoading(false);
      return;
    }

    // Payment confirmed (hold placed)
    setIsLoading(false);
    onSuccess();
  };

  const formattedAmount = `$${(holdAmount / 100).toFixed(2)}`;
  const perPerson = `$${(holdAmount / partySize / 100).toFixed(2)}`;

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader>
        <CardTitle className="text-center">Secure Your Booking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hold info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Hold amount</span>
            <span className="text-lg font-semibold">{formattedAmount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Per person</span>
            <span className="text-sm">{perPerson}</span>
          </div>
          <div className="border-t pt-2 mt-2">
            <p className="text-sm text-muted-foreground">
              Your card will be held, not charged. You will only be charged if you
              don&apos;t show up for your reservation.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
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
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              className="w-full sm:w-auto sm:flex-1 h-12"
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={!stripe || isLoading}
              className="w-full sm:w-auto sm:flex-1 h-12"
            >
              {isLoading ? 'Placing hold...' : `Confirm Hold (${formattedAmount})`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
