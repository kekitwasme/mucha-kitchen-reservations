'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ReservationStatus } from '@/types';

interface ReservationData {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  reservationDate: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  notes?: string;
  tableNames: string[];
  createdAt: string;
  updatedAt: string;
}

interface AvailabilitySlot {
  startTime: string;
  tablesAvailable: number;
}

const STATUS_CONFIG: Record<
  ReservationStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', variant: 'outline' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  seated: { label: 'Seated', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'destructive' },
};

function formatTime(isoString: string): string {
  const date = parseISO(isoString);
  return format(date, 'h:mm a');
}

export default function ReschedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Fetch reservation
  const { data, isLoading, isError } = useQuery({
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
  const effectiveDate = selectedDate ?? (reservation ? parseISO(reservation.reservationDate) : undefined);

  // Fetch available times for the selected date
  const { data: availability, isLoading: loadingSlots } = useQuery({
    queryKey: ['availability', effectiveDate ? format(effectiveDate, 'yyyy-MM-dd') : '', reservation?.partySize ?? 0],
    queryFn: async () => {
      const dateStr = format(effectiveDate!, 'yyyy-MM-dd');
      const res = await fetch(`/api/availability?date=${dateStr}&partySize=${reservation!.partySize}`);
      if (!res.ok) throw new Error('Failed to fetch availability');
      return res.json() as Promise<{ slots: AvailabilitySlot[] }>;
    },
    enabled: !!effectiveDate && !!reservation,
  });

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/reservations/${id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationDate: format(effectiveDate!, 'yyyy-MM-dd'),
          startTime: selectedTime,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.code || 'RESCHEDULE_FAILED');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      router.push(`/confirm/${id}`);
    },
  });

  // Loading
  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader>
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 w-full bg-muted animate-pulse rounded" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error / not found
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

  const statusConfig = STATUS_CONFIG[reservation.status];
  const isReschedulable = reservation.status === 'pending' || reservation.status === 'confirmed';
  const reservationDateFormatted = format(parseISO(reservation.reservationDate), 'EEEE, d MMMM yyyy');
  const slots = availability?.slots ?? [];

  // Not reschedulable
  if (!isReschedulable) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle>Cannot reschedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This reservation is currently <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge> and cannot be rescheduled.
              Please contact the restaurant for assistance.
            </p>
            <div className="space-y-2 pt-2 border-t">
              <p className="font-medium">{reservation.customerName}</p>
              <p className="text-sm text-muted-foreground">{reservationDateFormatted}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(reservation.startTime)} — {formatTime(reservation.endTime)}
              </p>
              <p className="text-sm text-muted-foreground">
                {reservation.partySize} guest{reservation.partySize !== 1 ? 's' : ''}
              </p>
            </div>
            <Button className="w-full" render={<Link href="/book" />}>
              Book a Table
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (rescheduleMutation.isSuccess) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-green-700">Reservation updated!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Your reservation has been rescheduled. Redirecting...
            </p>
            <Button className="w-full" render={<Link href={`/confirm/${id}`} />}>
              View Reservation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4">
      {/* Current reservation summary */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-xl">Reschedule</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Change the time for {reservation.customerName}&apos;s reservation
            </p>
          </div>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current date</span>
            <span className="font-medium">{reservationDateFormatted}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current time</span>
            <span className="font-medium">{formatTime(reservation.startTime)} — {formatTime(reservation.endTime)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Party size</span>
            <span className="font-medium">{reservation.partySize} guest{reservation.partySize !== 1 ? 's' : ''}</span>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Pick a new date */}
      <Card>
        <CardHeader>
          <CardTitle>Select a new date</CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => date < new Date() || date > new Date(Date.now() + 30 * 86400000)}
            className="rounded-md border mx-auto"
          />
        </CardContent>
      </Card>

      {/* Step 2: Pick a new time */}
      {effectiveDate && (
        <Card>
          <CardHeader>
            <CardTitle>
              Available times for {format(effectiveDate, 'EEEE, d MMMM')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSlots ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No available times for this date. Try another date.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {slots.map((slot: AvailabilitySlot) => {
                  const isSelected = selectedTime === slot.startTime;
                  const isCurrentTime =
                    format(effectiveDate!, 'yyyy-MM-dd') === reservation.reservationDate &&
                    slot.startTime === format(parseISO(reservation.startTime), 'HH:mm');

                  return (
                    <Button
                      key={slot.startTime}
                      variant={isSelected ? 'default' : 'outline'}
                      onClick={() => setSelectedTime(slot.startTime)}
                      className={`h-12 ${isCurrentTime ? 'border-blue-300 bg-blue-50' : ''}`}
                    >
                      {slot.startTime}
                      {isCurrentTime && <span className="ml-1 text-xs">(current)</span>}
                    </Button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm reschedule */}
      {selectedTime && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Confirm new time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">New date</span>
                <span className="font-medium">{format(effectiveDate!, 'EEEE, d MMMM yyyy')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">New time</span>
                <span className="font-medium">{selectedTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Party size</span>
                <span className="font-medium">{reservation.partySize} guest{reservation.partySize !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {rescheduleMutation.isError && (
              <p className="text-sm text-destructive">
                {rescheduleMutation.error instanceof Error && rescheduleMutation.error.message === 'NO_AVAILABILITY'
                  ? 'Sorry, that time is no longer available. Please choose another.'
                  : 'Something went wrong. Please try again.'}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1"
                disabled={rescheduleMutation.isPending}
                onClick={() => rescheduleMutation.mutate()}
              >
                {rescheduleMutation.isPending ? 'Updating...' : 'Confirm New Time'}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                render={<Link href={`/confirm/${id}`} />}
              >
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel link */}
      <p className="text-center text-sm text-muted-foreground">
        Need to cancel instead?{' '}
        <Link href={`/cancel/${id}`} className="text-primary underline">
          Cancel reservation
        </Link>
      </p>
    </div>
  );
}
