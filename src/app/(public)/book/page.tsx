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
    createReservation.mutate({
      customerName: name,
      customerPhone: phone,
      customerEmail: email || undefined,
      partySize: store.partySize,
      reservationDate: format(store.date, 'yyyy-MM-dd'),
      startTime: store.selectedTime,
      notes: notes || undefined,
    });
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {availability?.slots?.map((slot: { startTime: string }) => (
                <Button
                  key={slot.startTime}
                  variant={store.selectedTime === slot.startTime ? 'default' : 'outline'}
                  onClick={() => store.setSelectedTime(slot.startTime)}
                  className="h-12"
                >
                  {slot.startTime}
                </Button>
              )) || <p className="text-muted-foreground col-span-3 text-center">Select a date and party size...</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Details */}
      {store.step === 'details' && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle>Your Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone *</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412 345 678" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests..." />
            </div>
            {createReservation.isError && <p className="text-red-500 text-sm">Failed to create reservation. Please try again.</p>}
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      <div className="flex flex-col sm:flex-row justify-between gap-3">
          {canGoBack ? (
            <Button variant="outline" onClick={goBack} className="w-full sm:w-auto sm:flex-1 h-12">
              Back
            </Button>
          ) : (
            <div className="hidden sm:block sm:flex-1" />
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
    </div>
  );
}