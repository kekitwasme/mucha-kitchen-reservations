'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ReservationStatus } from '@/types';

interface AuditLogEntry {
  id: string;
  action: string;
  details?: unknown;
  createdAt: string;
}

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
  auditLogs?: AuditLogEntry[];
  createdAt: string;
  updatedAt: string;
  // Payment hold fields
  depositAmount?: number;
  paymentHoldStatus?: string;
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

const CANCELLABLE_STATUSES: ReservationStatus[] = ['pending', 'confirmed'];

function formatTime(isoString: string): string {
  const date = parseISO(isoString);
  return format(date, 'h:mm a');
}

function getCancelledAt(auditLogs?: AuditLogEntry[]): string | null {
  if (!auditLogs) return null;
  const cancelLog = auditLogs.find((log) => log.action === 'cancelled');
  if (!cancelLog) return null;
  return format(parseISO(cancelLog.createdAt), "EEEE, d MMMM yyyy 'at' h:mm a");
}

export default function CancelPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [nameInput, setNameInput] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

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

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/reservations/${id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.code || 'CANCEL_FAILED');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
    },
  });

  const reservation = data?.reservation;

  // Loading state
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
            <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
            <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not found / fetch error
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
  const isCancelled = reservation.status === 'cancelled';
  const isCancellable = CANCELLABLE_STATUSES.includes(reservation.status);
  const isTerminal = ['seated', 'completed'].includes(reservation.status);
  const isNoShow = reservation.status === 'no_show';
  const cancelledAt = getCancelledAt(reservation.auditLogs);
  const reservationDateFormatted = format(parseISO(reservation.reservationDate), 'EEEE, d MMMM yyyy');
  const nameMatches = nameInput.trim().toLowerCase() === reservation.customerName.trim().toLowerCase();

  // Already cancelled
  if (isCancelled) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-400">
              This reservation has already been cancelled
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cancelledAt && (
              <p className="text-sm text-muted-foreground">
                Cancelled on {cancelledAt}
              </p>
            )}
            <div className="space-y-2 pt-2 border-t border-red-200 dark:border-red-900">
              <p className="font-medium">{reservation.customerName}</p>
              <p className="text-sm text-muted-foreground">{reservationDateFormatted}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(reservation.startTime)} — {formatTime(reservation.endTime)}
              </p>
              <p className="text-sm text-muted-foreground">
                {reservation.partySize} guest{reservation.partySize !== 1 ? 's' : ''}
              </p>
              {reservation.tableNames.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Table{reservation.tableNames.length !== 1 ? 's' : ''}{' '}
                  {reservation.tableNames.join(', ')}
                </p>
              )}
            </div>
            <Button className="w-full mt-4" render={<Link href="/book" />}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add to Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Seated or completed
  if (isTerminal) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle className="text-xl">{reservation.customerName}</CardTitle>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This reservation cannot be cancelled. Please call the restaurant for assistance.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{reservationDateFormatted}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(reservation.startTime)} — {formatTime(reservation.endTime)}
              </p>
              <p className="text-sm text-muted-foreground">
                {reservation.partySize} guest{reservation.partySize !== 1 ? 's' : ''}
              </p>
              {reservation.tableNames.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Table{reservation.tableNames.length !== 1 ? 's' : ''}{' '}
                  {reservation.tableNames.join(', ')}
                </p>
              )}
            </div>
            <Card className="mt-2">
              <CardContent className="pt-6 space-y-1">
                <p className="font-medium">Mucha Kitchen</p>
                <p className="text-sm text-muted-foreground">(08) 9221 1234</p>
              </CardContent>
            </Card>
            <Button className="w-full mt-2" render={<Link href="/book" />}>
              Book a Table
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No-show
  if (isNoShow) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-700 dark:text-amber-400">
              This reservation was marked as no-show
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium">{reservation.customerName}</p>
              <p className="text-sm text-muted-foreground">{reservationDateFormatted}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(reservation.startTime)} — {formatTime(reservation.endTime)}
              </p>
              <p className="text-sm text-muted-foreground">
                {reservation.partySize} guest{reservation.partySize !== 1 ? 's' : ''}
              </p>
              {reservation.tableNames.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Table{reservation.tableNames.length !== 1 ? 's' : ''}{' '}
                  {reservation.tableNames.join(', ')}
                </p>
              )}
            </div>
            <Button className="w-full mt-4" render={<Link href="/book" />}>
              Book a Table
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Cancellation success state
  if (cancelMutation.isSuccess) {
    const holdReleased = (cancelMutation.data as { holdReleased?: boolean })?.holdReleased;

    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-400">
              Your reservation has been cancelled
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              The reservation for {reservation.customerName} on {reservationDateFormatted} has been cancelled.
            </p>
            {reservation.depositAmount && reservation.depositAmount > 0 && (
              <div className="bg-white/60 rounded-lg p-3 space-y-1">
                {holdReleased ? (
                  <>
                    <p className="text-sm text-green-600 font-medium">✅ Payment hold released</p>
                    <p className="text-xs text-muted-foreground">
                      Your card hold of ${(reservation.depositAmount / 100).toFixed(2)} has been released. No charges apply.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-amber-600 font-medium">⚠️ Cancellation within 2 hours</p>
                    <p className="text-xs text-muted-foreground">
                      Your reservation was cancelled less than 2 hours before the scheduled time. The payment hold of ${(reservation.depositAmount / 100).toFixed(2)} may still be captured as a no-show fee. Please contact the restaurant for assistance.
                    </p>
                  </>
                )}
              </div>
            )}
            <Button className="w-full" render={<Link href="/book" />}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add to Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Cancellable reservation — show details and cancellation flow
  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4">
      {/* Reservation summary */}
      <Card className="animate-in fade-in duration-500">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-xl">{reservation.customerName}</CardTitle>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Date</p>
            <p className="font-medium">{reservationDateFormatted}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Time</p>
            <p className="font-medium">
              {formatTime(reservation.startTime)} — {formatTime(reservation.endTime)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Party Size</p>
            <p className="font-medium">
              {reservation.partySize} guest{reservation.partySize !== 1 ? 's' : ''}
            </p>
          </div>
          {reservation.tableNames.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground">Table{reservation.tableNames.length !== 1 ? 's' : ''}</p>
              <p className="font-medium">{reservation.tableNames.join(', ')}</p>
            </div>
          )}
          {reservation.notes && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">Notes</p>
              <p className="text-sm text-muted-foreground mt-1">{reservation.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancellation prompt */}
      {isCancellable && !showConfirm && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle>Cancel this reservation?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to cancel this reservation? This action cannot be undone.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="destructive" className="flex-1" onClick={() => setShowConfirm(true)}>
                Yes, Cancel Reservation
              </Button>
              <Button variant="outline" className="flex-1" render={<Link href={`/confirm/${id}`} />}>
                Keep Reservation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation step — type customer name */}
      {isCancellable && showConfirm && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle>Confirm cancellation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Please type the name on the reservation to confirm cancellation.
            </p>
            <div>
              <label htmlFor="name-confirm" className="text-sm font-medium">
                Customer name
              </label>
              <Input
                id="name-confirm"
                type="text"
                placeholder={reservation.customerName}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="mt-1.5"
                autoComplete="off"
              />
            </div>

            {cancelMutation.isError && (
              <p className="text-sm text-destructive">
                {cancelMutation.error instanceof Error && cancelMutation.error.message === 'ALREADY_CANCELLED'
                  ? 'This reservation has already been cancelled.'
                  : 'Something went wrong. Please try again.'}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!nameMatches || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancellation'}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowConfirm(false);
                  setNameInput('');
                }}
              >
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}