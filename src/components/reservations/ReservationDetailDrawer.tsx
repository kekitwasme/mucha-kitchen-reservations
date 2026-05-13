'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format, parseISO } from 'date-fns';
import EditReservationModal from '@/components/reservations/EditReservationModal';
import StaffNoteInput from '@/components/reservations/StaffNoteInput';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ── Status config ──────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  seated: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  no_show: 'bg-red-100 text-red-800 border-red-200',
};

const statusTransitions: Record<string, { label: string; status: string; variant: 'default' | 'outline' | 'destructive' }[]> = {
  pending: [
    { label: 'Confirm', status: 'confirmed', variant: 'default' },
    { label: 'Cancel', status: 'cancelled', variant: 'destructive' },
  ],
  confirmed: [
    { label: 'Seat', status: 'seated', variant: 'default' },
    { label: 'Cancel', status: 'cancelled', variant: 'destructive' },
    { label: 'No Show', status: 'no_show', variant: 'destructive' },
  ],
  seated: [
    { label: 'Complete', status: 'completed', variant: 'default' },
    { label: 'No Show', status: 'no_show', variant: 'destructive' },
  ],
  completed: [
    { label: 'Reopen', status: 'confirmed', variant: 'outline' },
  ],
  cancelled: [
    { label: 'Reopen', status: 'pending', variant: 'outline' },
  ],
  no_show: [],
};

// ── Types ──────────────────────────────────────────────────────

interface ReservationDetail {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number;
  reservationDate: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
  tables: { id: string; name: string; capacity: number }[];
  tableIds: string[];
  tableNames: string[];
  auditLogs: {
    id: string;
    action: string;
    createdAt: string;
  }[];
}

interface TableInfo {
  id: string;
  name: string;
  capacity: number;
  area: string;
  active: boolean;
}

interface Props {
  reservationId: string | null;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────

export default function ReservationDetailDrawer({ reservationId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [tableEditMode, setTableEditMode] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [tableError, setTableError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch reservation detail
  const {
    data: detailData,
    isLoading: detailLoading,
  } = useQuery<ReservationDetail>({
    queryKey: ['reservation', reservationId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) throw new Error('Failed to fetch reservation');
      const json = await res.json();
      return json.reservation;
    },
    enabled: !!reservationId,
  });

  const detail = detailData ?? null;

  // Fetch all tables (for table assignment)
  const { data: tablesData } = useQuery<{ tables: TableInfo[] }>({
    queryKey: ['tables'],
    queryFn: async () => {
      const res = await fetch('/api/tables');
      if (!res.ok) throw new Error('Failed to fetch tables');
      return res.json();
    },
    enabled: !!reservationId && tableEditMode,
  });

  const allTables = tablesData?.tables ?? [];

  // Status update mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', reservationId] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  // Table reassignment mutation
  const tableMutation = useMutation({
    mutationFn: async ({ id, tableIds }: { id: string; tableIds: string[] }) => {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === 'OVERLAP') {
          throw new Error('Time slot conflicts with existing reservation');
        }
        throw new Error(err.error || 'Failed to update tables');
      }
      return res.json();
    },
    onSuccess: () => {
      setTableEditMode(false);
      setTableError(null);
      queryClient.invalidateQueries({ queryKey: ['reservation', reservationId] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (error: Error) => {
      setTableError(error.message);
    },
  });

  // Copy to clipboard helper
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // Toggle table selection in edit mode
  const toggleTable = useCallback((tableId: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(tableId)
        ? prev.filter((id) => id !== tableId)
        : [...prev, tableId]
    );
    setTableError(null);
  }, []);

  // Enter table edit mode
  const enterTableEditMode = useCallback(() => {
    if (detail) {
      setSelectedTableIds([...detail.tableIds]);
    }
    setTableError(null);
    setTableEditMode(true);
  }, [detail]);

  // Save table assignment
  const saveTableAssignment = useCallback(() => {
    if (reservationId && selectedTableIds.length > 0) {
      tableMutation.mutate({ id: reservationId, tableIds: selectedTableIds });
    }
  }, [reservationId, selectedTableIds, tableMutation]);

  // Determine which tables are "available" (not currently reserved at this time, excluding this reservation's tables)
  const availableTables = tableEditMode && detail
    ? allTables.filter((t) => t.active)
    : [];

  const isOpen = !!reservationId;

  // Controlled open/close: vaul's Drawer uses boolean for open state
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setTableEditMode(false);
      setTableError(null);
      onClose();
    }
  }, [onClose]);

  return (
    <Drawer
      direction="right"
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <DrawerContent className="sm:max-w-md md:max-w-lg overflow-y-auto">
        {detailLoading && reservationId ? (
          <div className="p-6 space-y-4">
            <div className="h-8 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-6 bg-muted animate-pulse rounded w-1/2" />
            <div className="h-32 bg-muted animate-pulse rounded" />
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <DrawerHeader className="border-b">
              <div className="flex items-center justify-between pr-8">
                <DrawerTitle className="text-xl font-semibold">
                  {detail.customerName}
                </DrawerTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditModalOpen(true)}
                  >
                    Edit
                  </Button>
                  <Badge variant="outline" className={statusColors[detail.status] || 'bg-gray-100'}>
                    {detail.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
              <DrawerDescription className="sr-only">
                Reservation details for {detail.customerName}
              </DrawerDescription>
              {/* Status action buttons */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {statusTransitions[detail.status]?.map((t) => (
                  <Button
                    key={t.status}
                    size="sm"
                    variant={t.variant === 'destructive' ? 'outline' : t.variant}
                    className={t.variant === 'destructive' ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ id: detail.id, status: t.status })
                    }
                  >
                    {t.label}
                  </Button>
                ))}

                {/* Delete button */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Reservation</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this reservation for {detail.customerName}.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError && (
                      <p className="text-sm text-red-600">{deleteError}</p>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={async () => {
                          setDeleteError(null);
                          try {
                            const res = await fetch(`/api/reservations/${detail.id}?hard=true`, {
                              method: 'DELETE',
                            });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}));
                              setDeleteError(err.error || 'Failed to delete');
                              return;
                            }
                            queryClient.invalidateQueries({ queryKey: ['reservations'] });
                            queryClient.invalidateQueries({ queryKey: ['walkIns'] });
                            onClose();
                          } catch {
                            setDeleteError('Network error');
                          }
                        }}
                      >
                        Delete Permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </DrawerHeader>

            {/* Details Grid */}
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {/* Left column */}
              <div>
                <span className="text-muted-foreground">Phone</span>
                <button
                  type="button"
                  className="block text-left hover:underline cursor-pointer"
                  onClick={() => copyToClipboard(detail.customerPhone)}
                  title="Click to copy"
                >
                  {detail.customerPhone}
                </button>
              </div>
              {/* Right column */}
              <div>
                <span className="text-muted-foreground">Date</span>
                <p>{detail.reservationDate}</p>
              </div>

              <div>
                <span className="text-muted-foreground">Email</span>
                {detail.customerEmail ? (
                  <button
                    type="button"
                    className="block text-left hover:underline cursor-pointer"
                    onClick={() => copyToClipboard(String(detail.customerEmail))}
                    title="Click to copy"
                  >
                    {detail.customerEmail}
                  </button>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </div>

              <div>
                <span className="text-muted-foreground">Time</span>
                <p>
                  {format(parseISO(detail.startTime), 'HH:mm')} – {format(parseISO(detail.endTime), 'HH:mm')}
                </p>
              </div>

              <div>
                <span className="text-muted-foreground">Party Size</span>
                <p>{detail.partySize}</p>
              </div>

              <div>
                <span className="text-muted-foreground">Tables</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {detail.tableNames.length > 0
                    ? detail.tableNames.map((name) => (
                        <Badge key={name} variant="secondary" className="text-xs">
                          {name}
                        </Badge>
                      ))
                    : <span className="text-muted-foreground">Unassigned</span>}
                </div>
              </div>

              {/* Notes — full width */}
              {detail.notes && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Table Assignment */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Table Assignment</h3>
                {!tableEditMode && (
                  <Button size="sm" variant="outline" onClick={enterTableEditMode}>
                    Change Tables
                  </Button>
                )}
              </div>

              {/* Current tables (view mode) */}
              {!tableEditMode && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.tableNames.length > 0
                    ? detail.tableNames.map((name) => (
                        <Badge key={name} variant="secondary">
                          {name}
                        </Badge>
                      ))
                    : <span className="text-muted-foreground text-sm">No tables assigned</span>}
                </div>
              )}

              {/* Table selector (edit mode) */}
              {tableEditMode && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {availableTables.map((table) => {
                      const isSelected = selectedTableIds.includes(table.id);
                      return (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() => toggleTable(table.id)}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-input bg-background hover:bg-accent'
                          }`}
                        >
                          {table.name}
                          <span className="text-muted-foreground">({table.capacity})</span>
                        </button>
                      );
                    })}
                  </div>

                  {tableError && (
                    <p className="text-sm text-red-600">{tableError}</p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={selectedTableIds.length === 0 || tableMutation.isPending}
                      onClick={saveTableAssignment}
                    >
                      {tableMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTableEditMode(false);
                        setTableError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Audit Trail */}
            <div className="p-4">
              <h3 className="text-sm font-medium mb-2">Audit Trail</h3>
              {detail.auditLogs.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {detail.auditLogs.slice(0, 10).map((log) => (
                    <li key={log.id} className="flex justify-between">
                      <span className="capitalize">{log.action.replace(/_/g, ' ')}</span>
                      <span>{format(parseISO(log.createdAt), 'dd MMM yyyy, HH:mm')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No audit entries</p>
              )}
            </div>

            <Separator />

            {/* Staff Note Input */}
            <div className="p-4">
              <h3 className="text-sm font-medium mb-2">Add Staff Note</h3>
              <StaffNoteInput
                reservationId={detail.id}
                currentNotes={detail.notes}
              />
            </div>
          </>
        ) : null}

        {/* Edit Reservation Modal */}
        <EditReservationModal
          reservationId={reservationId || ''}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
        />

        {/* Close button — always visible when drawer is open */}
        <DrawerClose className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <span className="h-4 w-4 text-lg leading-none">×</span>
          <span className="sr-only">Close</span>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}