'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBookingStore, type BookingStep } from '@/lib/store';
import PaymentStep from './_components/payment-step';

const STEP_META: Record<BookingStep, { label: string; title: string; description: string }> = {
  date: {
    label: 'Date',
    title: 'Choose a date',
    description: 'Bookings are available up to 30 days ahead.',
  },
  party: {
    label: 'Guests',
    title: 'How many guests?',
    description: 'Select the total number of people in your party.',
  },
  time: {
    label: 'Time',
    title: 'Pick a time',
    description: 'Available times update for your selected date and party size.',
  },
  details: {
    label: 'Details',
    title: 'Your details',
    description: 'We will use these details to secure and manage your booking.',
  },
  payment: {
    label: 'Card',
    title: 'Secure your booking',
    description: 'Save a card so the restaurant can place the required hold.',
  },
  confirmation: {
    label: 'Done',
    title: 'Booking confirmed',
    description: 'Your reservation is ready.',
  },
};

interface AvailabilitySlot {
  startTime: string;
}

/**
 * Converts a 24-hour time string into minutes from midnight for grouping.
 */
function timeStringToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Customer booking wizard for date, party, time, details, saved-card payment,
 * and confirmation. The payment step saves card details so the server can place
 * immediate holds for reservations booked within 24 hours.
 */
export default function BookPage() {
  const store = useBookingStore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [dietary, setDietary] = useState('');
  const [highChairs, setHighChairs] = useState(0);
  const activeStepRef = useRef<HTMLDivElement>(null);

  const steps: BookingStep[] = ['date', 'party', 'time', 'details', 'payment', 'confirmation'];
  const currentStepIndex = steps.indexOf(store.step);
  const currentStepMeta = STEP_META[store.step];

  useEffect(() => {
    window.requestAnimationFrame(() => {
      activeStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      activeStepRef.current?.focus({ preventScroll: true });
    });
  }, [store.step]);

  /**
   * Moves the booking wizard back one step when a previous step exists.
   */
  const goBack = () => {
    if (currentStepIndex > 0) {
      store.setStep(steps[currentStepIndex - 1]);
    }
  };

  const canGoBack = currentStepIndex > 0;

  const { data: availability } = useQuery({
    queryKey: ['availability', format(store.date || new Date(), 'yyyy-MM-dd'), store.partySize],
    queryFn: async () => {
      if (!store.partySize) throw new Error('Party size is required');
      const res = await fetch(`/api/availability?date=${format(store.date || new Date(), 'yyyy-MM-dd')}&partySize=${store.partySize}`);
      if (!res.ok) throw new Error('Failed to fetch availability');
      return res.json();
    },
    enabled: !!store.date && !!store.partySize && store.step === 'time',
  });

  const groupedTimeSlots = useMemo(() => {
    const slots = (availability?.slots ?? []) as AvailabilitySlot[];

    return {
      lunch: slots.filter((slot) => timeStringToMinutes(slot.startTime) < 17 * 60),
      dinner: slots.filter((slot) => timeStringToMinutes(slot.startTime) >= 17 * 60),
    };
  }, [availability?.slots]);

  /**
   * Creates the reservation, then creates a Stripe SetupIntent used by the
   * payment step to save the guest's card for future or immediate holds.
   */
  const createReservation = useMutation({
    mutationFn: async (data: unknown) => {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create reservation');
      return res.json();
    },
    onSuccess: async (data) => {
      const reservation = data.reservation;
      store.setReservationId(reservation.id);

      // Create SetupIntent to save card details
      const setupRes = await fetch('/api/payments/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: email || `${phone}@placeholder.local`,
          customerName: name,
          customerPhone: phone,
        }),
      });

      if (!setupRes.ok) {
        const body = await setupRes.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create SetupIntent');
      }

      const setupData = await setupRes.json();
      store.setSetupData({
        setupIntentId: setupData.setupIntentId,
        setupClientSecret: setupData.clientSecret,
        stripeCustomerId: setupData.customerId,
      });

      store.setStep('payment');
    },
  });
  const continueLabel =
    store.step === 'date' && !store.date ? 'Select a date' :
    store.step === 'party' && !store.partySize ? 'Select guests' :
    store.step === 'time' && !store.selectedTime ? 'Select a time' :
    store.step === 'details' && (!name || !phone) ? 'Enter name and phone' :
    store.step === 'details' && createReservation.isPending ? 'Creating reservation...' :
    'Continue';

  /**
   * Submits the selected booking details to the reservation creation mutation.
   */
  const handleSubmit = () => {
    if (!store.date || !store.partySize || !store.selectedTime) return;

    const payload: Record<string, unknown> = {
      customerName: name,
      customerPhone: phone,
      customerEmail: email || undefined,
      partySize: store.partySize,
      reservationDate: format(store.date, 'yyyy-MM-dd'),
      startTime: store.selectedTime,
      notes: notes || undefined,
      dietaryRequirements: dietary || undefined,
      highChairs,
      seatingChoice: 'auto',
    };

    createReservation.mutate(payload);
  };

  /**
   * Commits the chosen time and advances straight to the guest details form.
   */
  const selectTime = (time: string) => {
    store.setSelectedTime(time);
    store.setStep('details');
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8 space-y-5">
      <section className="space-y-3 text-center">
        <Image
          src="/logo.png"
          alt="Mucha Kitchen"
          width={1134}
          height={823}
          priority
          className="mx-auto h-16 w-auto sm:h-20"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reservation</p>
        <h1 className="text-3xl font-bold tracking-tight">Reserve a table</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Choose a date, party size, and time. We&apos;ll save your card securely before confirming.
        </p>
      </section>

      {/* Step progress indicator */}
      <div className="grid grid-cols-6 gap-1 rounded-lg border bg-background p-2">
        {steps.map((step, i) => (
          <div key={step} className="flex flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full transition-colors duration-300 ${i <= currentStepIndex ? 'bg-primary' : 'bg-muted'}`} />
            <span className={`text-[0.65rem] font-medium sm:text-xs ${i === currentStepIndex ? 'text-foreground' : 'text-muted-foreground'}`}>
              {STEP_META[step].label}
            </span>
          </div>
        ))}
      </div>

      {(store.date || store.partySize || store.selectedTime) && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-background p-3 text-center text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="truncate font-medium">{store.date ? format(store.date, 'd MMM') : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Guests</p>
            <p className="font-medium">{store.partySize || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Time</p>
            <p className="font-medium">{store.selectedTime || '-'}</p>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className={`flex gap-3 ${canGoBack ? 'justify-between' : ''}`}>
        {canGoBack && store.step !== 'confirmation' && (
          <Button variant="outline" onClick={goBack} className="h-12 flex-1">
            Back
          </Button>
        )}
        {store.step !== 'payment' && store.step !== 'confirmation' && (
          <Button
            variant="default"
            onClick={store.step === 'details' ? handleSubmit : () => {
              if (currentStepIndex < steps.length - 1) {
                store.setStep(steps[currentStepIndex + 1]);
              }
            }}
            disabled={
              (store.step === 'date' && !store.date) ||
              (store.step === 'party' && !store.partySize) ||
              (store.step === 'time' && !store.selectedTime) ||
              (store.step === 'details' && (!name || !phone || createReservation.isPending))
            }
            className="h-12 flex-1"
          >
            {continueLabel}
          </Button>
        )}
      </div>

      <div ref={activeStepRef} tabIndex={-1} className="scroll-mt-5 focus:outline-none">
        {/* Step 1: Date */}
        {store.step === 'date' && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CardHeader>
              <CardTitle className="text-left">{currentStepMeta.title}</CardTitle>
              <CardDescription>{currentStepMeta.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={store.date}
                onSelect={store.setDate}
                disabled={(date) => date < new Date() || date > new Date(Date.now() + 30 * 86400000)}
                className="rounded-md border mx-auto"
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2: Party Size */}
        {store.step === 'party' && store.date && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CardHeader>
              <CardTitle className="text-left">{currentStepMeta.title}</CardTitle>
              <CardDescription>{currentStepMeta.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((size) => (
                  <Button
                    key={size}
                    variant={store.partySize === size ? 'default' : 'outline'}
                    onClick={() => store.setPartySize(size)}
                    className="h-12 text-base"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Time */}
        {store.step === 'time' && store.date && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CardHeader>
              <CardTitle className="text-left">{currentStepMeta.title}</CardTitle>
              <CardDescription>{currentStepMeta.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {availability?.blockOutHours > 0 && availability?.segments && (
                <div className="mb-3 text-sm text-muted-foreground bg-muted/50 rounded-lg p-2.5 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-500">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>
                    Bookings must be made at least <strong>{availability.blockOutHours} hour{availability.blockOutHours !== 1 ? 's' : ''}</strong> in advance.
                    {availability.allSegmentsBlocked && ' No times available for today.'}
                  </span>
                </div>
              )}
              {availability?.fromSpecialHours && availability?.segments?.length > 0 && (
                <div className="mb-3 text-sm text-muted-foreground bg-muted/50 rounded-lg p-2.5 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-500">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  <span>Special hours today: {availability.segments.map((s: {start: string; end: string}) => `${s.start}–${s.end}`).join(', ')}</span>
                </div>
              )}
              {availability?.dayClosed ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-4xl mb-3">Closed</div>
                  <p className="font-medium">Closed on this date.</p>
                  <p className="text-sm">Please select a different date.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {availability?.slots?.length ? (
                    ([
                      ['Lunch', groupedTimeSlots.lunch],
                      ['Dinner', groupedTimeSlots.dinner],
                    ] as const).map(([label, slots]) => (
                      slots.length > 0 && (
                        <section key={label} className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-border" />
                            <h3 className="min-w-20 text-center text-sm font-semibold">{label}</h3>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {slots.map((slot) => (
                              <Button
                                key={slot.startTime}
                                variant={store.selectedTime === slot.startTime ? 'default' : 'outline'}
                                onClick={() => selectTime(slot.startTime)}
                                className="h-12"
                              >
                                {slot.startTime}
                              </Button>
                            ))}
                          </div>
                        </section>
                      )
                    ))
                  ) : (
                    <div className="text-muted-foreground text-center py-4">
                      {availability === undefined ? (
                        <>
                          <span className="inline-flex gap-1 mr-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                          </span>
                          Finding available times…
                        </>
                      ) : (
                        'No times available for this date and party size. Try a different date.'
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Details */}
        {store.step === 'details' && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="text-left">{currentStepMeta.title}</CardTitle>
            <CardDescription>{currentStepMeta.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="name">Name *</label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="phone">Phone *</label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412 345 678" autoComplete="tel" />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>

            {/* Dietary */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="dietary">Dietary Requirements</label>
              <Input
                id="dietary"
                value={dietary}
                onChange={(e) => setDietary(e.target.value)}
                placeholder="e.g. Vegetarian, nut allergy, gluten free"
              />
            </div>

            {/* High chairs */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">High Chairs</label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHighChairs(Math.max(0, highChairs - 1))}
                  disabled={highChairs <= 0}
                  className="h-9 w-9 p-0"
                >
                  −
                </Button>
                <span className="text-sm font-medium w-6 text-center">{highChairs}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHighChairs(Math.min(10, highChairs + 1))}
                  disabled={highChairs >= 10}
                  className="h-9 w-9 p-0"
                >
                  +
                </Button>
              </div>
            </div>

            {/* Special Requests */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="notes">Special Requests</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requests or notes..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              />
            </div>

            {createReservation.isError && (
              <p className="text-red-500 text-sm">Failed to create reservation. Please try again.</p>
            )}
          </CardContent>
          </Card>
        )}

        {/* Step 5: Payment */}
        {store.step === 'payment' && store.reservationId && store.setupClientSecret && (
          <PaymentStep
            reservationId={store.reservationId}
            setupIntentId={store.setupIntentId || ''}
            clientSecret={store.setupClientSecret}
            stripeCustomerId={store.stripeCustomerId || ''}
            onSuccess={() => store.setStep('confirmation')}
            onCancel={() => store.setStep('details')}
          />
        )}

        {/* Step 6: Confirmation */}
        {store.step === 'confirmation' && store.reservationId && (
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-8">
            <CardContent className="space-y-4">
              <div className="text-6xl">Confirmed</div>
              <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
              <p className="text-muted-foreground">
                Your reservation is confirmed and secured with your card on file.
                <br />
                If your reservation starts within 24 hours, the hold may be placed now; otherwise it will be placed 24-48 hours before your reservation time.
              </p>
              <Button
                onClick={() => {
                  router.push(`/confirm/${store.reservationId}`);
                }}
                className="h-12"
              >
                View Booking Details
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}
