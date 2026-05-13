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
import ReservationDetailDrawer from '@/components/reservations/ReservationDetailDrawer';
import dynamic from 'next/dynamic';

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

// ── Action configs ─────────────────────────────────────────────

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
  cancelled: null,
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
  cancelled: [
    { label: 'Delete', status: '__delete__', variant: 'destructive' },
  ],
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
      const res = await fetch(`/api/reservations?date=${store.dateFilter}`);
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
          <label className="text-sm font-medium">Date:</label>
          <Input
            type="date"
            value={store.dateFilter}
            onChange={(e) => store.setDateFilter(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Status:</label>
          <select
            value={store.statusFilter}
            onChange={(e) => store.setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="seated">Seated</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Primary action button */}
                          {primary && (
                            <Button
                              size="sm"
                              variant={primary.variant === 'default' ? 'default' : 'outline'}
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
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {primary && (
                            <Button
                              size="sm"
                              variant={primary.variant === 'default' ? 'default' : 'outline'}
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