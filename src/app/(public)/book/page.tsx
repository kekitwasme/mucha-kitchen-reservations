'use client';

import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBookingStore, type BookingStep } from '@/lib/store';


export default function BookPage() {
  const store = useBookingStore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [dietary, setDietary] = useState('');
  const [occasion, setOccasion] = useState('none');
  const [highChairs, setHighChairs] = useState(0);
  const [guestType, setGuestType] = useState<'new' | 'returning' | 'regular'>('new');

  const steps: BookingStep[] = ['date', 'party', 'time', 'details'];
  const currentStepIndex = steps.indexOf(store.step);

  const goBack = () => {
    if (currentStepIndex > 0) {
      store.setStep(steps[currentStepIndex - 1]);
    }
  };

  const canGoBack = currentStepIndex > 0;

  const { data: availability } = useQuery({
    queryKey: ['availability', format(store.date || new Date(), 'yyyy-MM-dd'), store.partySize],
    queryFn: async () => {
      const res = await fetch(`/api/availability?date=${format(store.date || new Date(), 'yyyy-MM-dd')}&partySize=${store.partySize}`);
      if (!res.ok) throw new Error('Failed to fetch availability');
      return res.json();
    },
    enabled: !!store.date && store.step === 'time',
  });

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
    onSuccess: (data) => {
      router.push(`/confirm/${data.reservation.id}`);
    },
  });

  const handleSubmit = () => {
    if (!store.date || !store.selectedTime) return;

    const payload: Record<string, unknown> = {
      customerName: name,
      customerPhone: phone,
      customerEmail: email || undefined,
      partySize: store.partySize,
      reservationDate: format(store.date, 'yyyy-MM-dd'),
      startTime: store.selectedTime,
      notes: notes || undefined,
      dietaryRequirements: dietary || undefined,
      occasion,
      highChairs,
      isReturningGuest: guestType !== 'new',
      guestType,
      seatingChoice: 'auto',
    };

    createReservation.mutate(payload);
  };

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-center">Book a Table</h1>

      {/* Step progress indicator */}
      <div className="flex items-center justify-center gap-1">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center">
            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${i <= currentStepIndex ? 'bg-primary scale-110' : 'bg-muted'}`} />
            {i < steps.length - 1 && <div className={`w-8 h-0.5 transition-colors duration-500 ${i < currentStepIndex ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      {/* Navigation buttons */}
      <div className={`flex flex-col sm:flex-row gap-3 ${canGoBack ? 'justify-between' : ''}`}>
        {canGoBack && (
          <Button variant="outline" onClick={goBack} className="w-full sm:w-auto sm:flex-1 h-12">
            Back
          </Button>
        )}
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
          className="w-full sm:w-auto sm:flex-1 h-12"
        >
          {store.step === 'details'
            ? createReservation.isPending
              ? 'Confirming...'
              : 'Confirm Booking'
            : 'Continue'}
        </Button>
      </div>

      {/* Step 1: Date */}
      {store.step === 'date' && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle>Select Date</CardTitle>
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
            <CardTitle>Party Size</CardTitle>
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
            <CardTitle>Available Times</CardTitle>
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
                <div className="text-4xl mb-3">🏖️</div>
                <p className="font-medium">Closed on this date.</p>
                <p className="text-sm">Please select a different date.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availability?.slots?.length ? (
                  availability.slots.map((slot: { startTime: string }) => (
                    <Button
                      key={slot.startTime}
                      variant={store.selectedTime === slot.startTime ? 'default' : 'outline'}
                      onClick={() => store.setSelectedTime(slot.startTime)}
                      className="h-12"
                    >
                      {slot.startTime}
                    </Button>
                  ))
                ) : (
                  <div className="text-muted-foreground col-span-3 text-center py-4">
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
            <CardTitle>Your Details</CardTitle>
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

            {/* Occasion */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Occasion</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'none', label: 'None', emoji: '' },
                  { value: 'birthday', label: 'Birthday', emoji: '🎂' },
                  { value: 'anniversary', label: 'Anniversary', emoji: '💍' },
                  { value: 'business', label: 'Business', emoji: '💼' },
                  { value: 'date_night', label: 'Date Night', emoji: '🕯️' },
                  { value: 'other', label: 'Other', emoji: '✨' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOccasion(opt.value)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${
                      occasion === opt.value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-muted hover:border-primary/50'
                    }`}
                  >
                    <span className="text-lg">{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
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

            {/* Guest Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Guest Type</label>
              <div className="flex gap-2">
                {[
                  { value: 'new', label: 'First Visit', emoji: '🆕' },
                  { value: 'returning', label: 'Returning', emoji: '↩️' },
                  { value: 'regular', label: 'Regular', emoji: '⭐' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGuestType(opt.value as 'new' | 'returning' | 'regular')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                      guestType === opt.value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-muted hover:border-primary/50'
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
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

    </div>
  );
}
