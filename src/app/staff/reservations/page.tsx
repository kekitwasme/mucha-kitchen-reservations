'use client';

import React, { Suspense, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useReservationListStore } from '@/lib/store';
import dynamic from 'next/dynamic';

const ReservationDetailDrawer = dynamic(
  () => import('@/components/reservations/ReservationDetailDrawer'),
  { ssr: false }
);
const EditReservationModal = dynamic(
  () => import('@/components/reservations/EditReservationModal'),
  { ssr: false }
);
import { format, parseISO } from 'date-fns';

interface Reservation {
  id: string;
  customerName: string;
  partySize: number;
  startTime: string;
  endTime: string;
  status: string;
  customerPhone: string;
  notes: string | null;
  reservationTables: { table: { name: string } }[];
  // Payment hold fields
  depositAmount?: number;
  paymentHoldStatus?: string;
}

// ── Status colors ──────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  seated: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  no_show: 'bg-red-100 text-red-800 border-red-200',
};

// ── Hold status colors ──────────────────────────────────────────

const holdStatusColors: Record<string, string> = {
  none: 'bg-gray-100 text-gray-700 border-gray-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  placed: 'bg-blue-100 text-blue-800 border-blue-200',
  captured: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

function getHoldStatusLabel(reservation: Reservation): { label: string; key: string } {
  if (reservation.status === 'cancelled') {
    return { label: 'Cancelled', key: 'cancelled' };
  }
  if (!reservation.depositAmount || reservation.depositAmount === 0) {
    return { label: 'No Hold', key: 'none' };
  }
  const status = reservation.paymentHoldStatus;
  if (status === 'requires_capture') return { label: 'Hold Placed', key: 'placed' };
  if (status === 'captured') return { label: 'Captured', key: 'captured' };
  if (status === 'canceled') return { label: 'Cancelled', key: 'cancelled' };
  if (status === 'failed') return { label: 'Failed', key: 'failed' };
  return { label: 'No Hold', key: 'none' };
}

interface ActionItem {
  label: string;
  status: string;
  variant: 'default' | 'outline' | 'destructive';
}

const primaryActions: Record<string, ActionItem | null> = {
  pending: null, // Auto-accepted on creation, no confirm needed
  confirmed: { label: 'Seat', status: 'seated', variant: 'default' },
  seated: { label: 'Complete', status: 'completed', variant: 'default' },
  completed: null,
  cancelled: { label: 'Delete', status: '__delete__', variant: 'destructive' },
  no_show: null,
};

const dropdownActions: Record<string, ActionItem[]> = {
  pending: [
    { label: 'Edit', status: '__edit__', variant: 'outline' },
    { label: 'Cancel', status: 'cancelled', variant: 'destructive' },
  ],
  confirmed: [
    { label: 'Seat', status: 'seated', variant: 'default' },
    { label: 'Edit', status: '__edit__', variant: 'outline' },
    { label: 'Cancel', status: 'cancelled', variant: 'destructive' },
    { label: 'No Show', status: 'no_show', variant: 'destructive' },
    { label: 'Reassign Table', status: '__reassign__', variant: 'outline' },
  ],
  seated: [
    { label: 'Complete', status: 'completed', variant: 'default' },
    { label: 'No Show', status: 'no_show', variant: 'destructive' },
    { label: 'Reassign Table', status: '__reassign__', variant: 'outline' },
    { label: 'Add Note', status: '__note__', variant: 'outline' },
  ],
  completed: [
    { label: 'Delete', status: '__delete__', variant: 'destructive' },
  ],
  cancelled: [],
  no_show: [
    { label: 'Delete', status: '__delete__', variant: 'destructive' },
  ],
};

// ── Component ──────────────────────────────────────────────────

export default function ReservationsPage() {
  const store = useReservationListStore();
  const queryClient = useQueryClient();
  const [editModalId, setEditModalId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', store.dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (store.dateFilter) params.set('date', store.dateFilter);
      const res = await fetch(`/api/reservations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch reservations');
      return res.json();
    },
  });

  // Future reservations come from the same API response
  const futureReservations: Reservation[] = (data?.futureReservations || []) as Reservation[];

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  const deleteReservation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/reservations/${id}?hard=true`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      if (store.selectedReservationId) store.setSelectedReservationId(null);
    },
  });

  const reservations: Reservation[] = data?.reservations || [];

  const filtered = reservations.filter((r) => {
    if (store.statusFilter && r.status !== store.statusFilter) return false;
    if (store.searchQuery) {
      const q = store.searchQuery.toLowerCase();
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q)
      );
    }
    return true;
  });

  const handleAction = (reservationId: string, action: ActionItem) => {
    if (action.status === '__edit__') {
      setEditModalId(reservationId);
      return;
    }
    if (action.status === '__reassign__') {
      store.setSelectedReservationId(reservationId);
      return;
    }
    if (action.status === '__note__') {
      store.setSelectedReservationId(reservationId);
      return;
    }
    if (action.status === '__delete__') {
      if (confirm('Delete this reservation permanently? This cannot be undone.')) {
        deleteReservation.mutate(reservationId);
      }
      return;
    }
    updateStatus.mutate({ id: reservationId, status: action.status });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={store.dateFilter === store.todayDate ? 'default' : store.dateFilter === '' ? 'secondary' : 'outline'}
            onClick={() => {
              if (store.dateFilter === store.todayDate) {
                store.setDateFilter('');
              } else {
                store.setDateFilter(store.todayDate);
              }
            }}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant={store.dateFilter && store.dateFilter !== store.todayDate ? 'default' : 'outline'}
            onClick={() => {
              const dateInput = document.getElementById('date-filter-input') as HTMLInputElement | null;
              dateInput?.showPicker();
            }}
            className="relative"
          >
            {store.dateFilter && store.dateFilter !== store.todayDate
              ? store.dateFilter
              : 'Custom Date'}
            <input
              id="date-filter-input"
              type="date"
              value={store.dateFilter}
              onChange={(e) => store.setDateFilter(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </Button>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { value: '', label: 'All' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'seated', label: 'Seated' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ].map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={store.statusFilter === opt.value ? 'default' : 'outline'}
              onClick={() => store.setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <Input
          placeholder="Search name or phone..."
          value={store.searchQuery}
          onChange={(e) => store.setSearchQuery(e.target.value)}
          className="w-56"
        />
      </div>

      {isLoading ? (
        <div className="h-32 bg-slate-100 animate-pulse rounded-lg" />
      ) : (
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Tables</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hold</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No reservations found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const primary = primaryActions[r.status];
                  const actions = dropdownActions[r.status] || [];

                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => store.setSelectedReservationId(r.id)}
                    >
                      <TableCell className="font-medium">
                        {format(parseISO(r.startTime), 'HH:mm')}
                      </TableCell>
                      <TableCell>{r.customerName}</TableCell>
                      <TableCell>{r.partySize}</TableCell>
                      <TableCell>
                        {r.reservationTables.map((rt) => rt.table.name).join(', ') || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[r.status] || 'bg-gray-100'}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const holdStatus = getHoldStatusLabel(r);
                          return (
                            <Badge
                              variant="outline"
                              className={holdStatusColors[holdStatus.key] || 'bg-gray-100'}
                            >
                              {holdStatus.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Primary action button */}
                          {primary && (
                            <Button
                              size="sm"
                              variant={primary.variant === 'default' ? 'default' : 'outline'}
                              className={primary.variant === 'destructive' ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}
                              onClick={() => handleAction(r.id, primary)}
                              disabled={updateStatus.isPending}
                            >
                              {primary.label}
                            </Button>
                          )}

                          {/* More actions dropdown */}
                          {actions.length > 0 && (
                            <Popover>
                              <PopoverTrigger render={<button type="button" className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground">⋮</button>}>
                              </PopoverTrigger>
                              <PopoverContent align="end" side="bottom" className="w-44 p-1">
                                <div className="flex flex-col gap-0.5">
                                  {actions.map((action) => (
                                    <button
                                      key={action.label}
                                      type="button"
                                      className={`flex w-full items-center rounded-md px-3 py-1.5 text-sm text-left transition-colors ${
                                        action.variant === 'destructive'
                                          ? 'text-red-600 hover:bg-red-50'
                                          : 'hover:bg-accent'
                                      }`}
                                      onClick={() => handleAction(r.id, action)}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Future Reservations Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming Reservations</h2>
        {futureReservations.length === 0 ? (
          <div className="border rounded-lg bg-white p-6 text-center text-muted-foreground">
            No upcoming reservations
          </div>
        ) : (
          <div className="border rounded-lg bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hold</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {futureReservations.map((r) => {
                  const primary = primaryActions[r.status];
                  const actions = dropdownActions[r.status] || [];

                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => store.setSelectedReservationId(r.id)}
                    >
                      <TableCell className="text-muted-foreground">
                        {format(parseISO(r.startTime), 'EEE d MMM')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {format(parseISO(r.startTime), 'HH:mm')}
                      </TableCell>
                      <TableCell>{r.customerName}</TableCell>
                      <TableCell>{r.partySize}</TableCell>
                      <TableCell>
                        {r.reservationTables.map((rt) => rt.table.name).join(', ') || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[r.status] || 'bg-gray-100'}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const holdStatus = getHoldStatusLabel(r);
                          return (
                            <Badge
                              variant="outline"
                              className={holdStatusColors[holdStatus.key] || 'bg-gray-100'}
                            >
                              {holdStatus.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {primary && (
                            <Button
                              size="sm"
                              variant={primary.variant === 'default' ? 'default' : 'outline'}
                              className={primary.variant === 'destructive' ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}
                              onClick={() => handleAction(r.id, primary)}
                              disabled={updateStatus.isPending}
                            >
                              {primary.label}
                            </Button>
                          )}
                          {actions.length > 0 && (
                            <Popover>
                              <PopoverTrigger render={<button type="button" className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground">⋮</button>}>
                              </PopoverTrigger>
                              <PopoverContent align="end" side="bottom" className="w-44 p-1">
                                <div className="flex flex-col gap-0.5">
                                  {actions.map((action) => (
                                    <button
                                      key={action.label}
                                      type="button"
                                      className={`flex w-full items-center rounded-md px-3 py-1.5 text-sm text-left transition-colors ${
                                        action.variant === 'destructive'
                                          ? 'text-red-600 hover:bg-red-50'
                                          : 'hover:bg-accent'
                                      }`}
                                      onClick={() => handleAction(r.id, action)}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Reservation Detail Drawer */}
      <ReservationDetailDrawer
        reservationId={store.selectedReservationId}
        onClose={() => store.setSelectedReservationId(null)}
      />

      {/* Edit Reservation Modal */}
      {editModalId && (
        <EditReservationModal
          reservationId={editModalId}
          open={!!editModalId}
          onOpenChange={(open) => {
            if (!open) setEditModalId(null);
          }}
        />
      )}
    </div>
  );
}