'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const TERMINAL_STATUSES: ReservationStatus[] = ['seated', 'completed', 'no_show'];

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

export default function ConfirmPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

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
            <CardTitle>We couldn&apos;t find this reservation</CardTitle>
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
  const isTerminal = TERMINAL_STATUSES.includes(reservation.status);
  const cancelledAt = getCancelledAt(reservation.auditLogs);
  const reservationDateFormatted = format(parseISO(reservation.reservationDate), 'EEEE, d MMMM yyyy');

  // Cancelled state
  if (isCancelled) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-400">
              This reservation has been cancelled
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
              Book Another Table
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active / terminal-status reservation
  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4">
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

      {/* Restaurant info */}
      <Card>
        <CardContent className="pt-6 space-y-1">
          <p className="font-medium">Mucha Kitchen</p>
          <p className="text-sm text-muted-foreground">(08) 9221 1234</p>
        </CardContent>
      </Card>

      {/* Terminal status notice */}
      {isTerminal && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              This reservation is marked as {statusConfig.label.toLowerCase()}. Please contact the
              restaurant for any changes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button className="flex-1" render={<Link href="/book" />}>
          Book Another Table
        </Button>
        {!isTerminal && (
          <Button variant="outline" className="flex-1" render={<Link href={`/cancel/${id}`} />}>
            Cancel Reservation
          </Button>
        )}
      </div>
    </div>
  );
}