'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, differenceInHours } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CompleteBookingStep from '../../book/_components/payment-step';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

interface ReservationData {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  reservationDate: string;
  startTime: string;
  endTime: string;
  status: string;
  depositAmount?: number;
  paymentHoldStatus?: string;
}

export default function CompleteBookingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['reservation', id],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('NOT_FOUND');
        throw new Error('FETCH_ERROR');
      }
      return res.json() as Promise<{ reservation: ReservationData }>;
    },
    enabled: !!id,
  });

  const reservation = data?.reservation;

  // Create PaymentIntent for completing booking
  const createHold = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payments/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to create payment intent' }));
        throw new Error(body.error || 'Failed to create payment intent');
      }
      return res.json() as Promise<{
        paymentIntentId: string;
        clientSecret: string;
        holdAmount: number;
      }>;
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader>
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-4 w-full bg-muted animate-pulse rounded" />
            <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !reservation) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Reservation not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This reservation may not exist or the link may be incorrect.
            </p>
            <Button className="w-full" render={<Link href="/book" />}>
              Book a Table
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If hold already placed, redirect to confirmation
  if (reservation.paymentHoldStatus === 'requires_capture') {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-400">
              Payment Hold Already Active
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              A payment hold has already been placed on this reservation.
            </p>
            <Button className="w-full" onClick={() => router.push(`/confirm/${reservation.id}`)}>
              View Reservation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If reservation is cancelled or completed
  if (['cancelled', 'completed', 'no_show'].includes(reservation.status)) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Reservation Unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This reservation is {reservation.status.replace('_', ' ')} and cannot be modified.
            </p>
            <Button className="w-full" render={<Link href="/book" />}>
              Book a Table
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const reservationDate = parseISO(reservation.reservationDate);
  const startTime = parseISO(reservation.startTime);
  const hoursUntil = differenceInHours(startTime, new Date());
  const isUrgent = hoursUntil <= 48;
  const reservationDateFormatted = format(reservationDate, 'EEEE, d MMMM yyyy');

  if (success) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-400">
              Payment Hold Confirmed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Your payment hold has been successfully placed. Your reservation is now fully secured.
            </p>
            <Button className="w-full" onClick={() => router.push(`/confirm/${reservation.id}`)}>
              View Reservation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Need to create PaymentIntent first
  if (!createHold.isPending && !createHold.isSuccess && !createHold.isError) {
    createHold.mutate();
  }

  if (createHold.isPending) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Preparing Secure Payment…</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-flex gap-1 mr-2">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
              </span>
              Fetching payment details…
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (createHold.isError) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-400">
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {createHold.error instanceof Error ? createHold.error.message : 'Unable to set up payment. Please try again.'}
            </p>
            <Button className="w-full" onClick={() => createHold.mutate()}>
              Try Again
            </Button>
            <Button variant="outline" className="w-full" render={<Link href={`/confirm/${reservation.id}`} />}>
              Back to Reservation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const holdData = createHold.data;
  if (!holdData) return null;

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Complete Your Booking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="font-medium">{reservation.customerName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Date</span>
            <span className="font-medium">{reservationDateFormatted}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Time</span>
            <span className="font-medium">
              {format(startTime, 'h:mm a')} — {format(parseISO(reservation.endTime), 'h:mm a')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Party</span>
            <span className="font-medium">{reservation.partySize} guests</span>
          </div>
          {isUrgent && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mt-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">⏰</span>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                  Your reservation is coming up soon
                </p>
              </div>
              <p className="text-sm text-amber-800/80 dark:text-amber-400 mt-1">
                Please complete your card details now to secure your reservation.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment form */}
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: holdData.clientSecret,
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
        <CompleteBookingStep
          reservationId={reservation.id}
          clientSecret={holdData.clientSecret}
          holdAmount={holdData.holdAmount}
          partySize={reservation.partySize}
          onSuccess={() => setSuccess(true)}
        />
      </Elements>
    </div>
  );
}
