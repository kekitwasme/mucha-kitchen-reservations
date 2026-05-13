'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';

const Calendar = dynamic(
  () => import('@/components/ui/calendar').then((m) => m.Calendar),
  { ssr: false }
);
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
}

interface AvailabilitySlot {
  startTime: string;
  available: boolean;
}

interface Props {
  reservationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Component ──────────────────────────────────────────────────

export default function EditReservationModal({
  reservationId,
  open,
  onOpenChange,
}: Props) {
  const queryClient = useQueryClient();

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Track original values for dirty detection
  const [originalValues, setOriginalValues] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    partySize: 2,
    reservationDate: '',
    startTime: '',
    notes: '',
  });

  // Fetch reservation detail
  const { data: detailData } = useQuery<ReservationDetail>({
    queryKey: ['reservation', reservationId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) throw new Error('Failed to fetch reservation');
      const json = await res.json();
      return json.reservation;
    },
    enabled: !!reservationId && open,
  });

  // Populate form from fetched data
  useEffect(() => {
    if (detailData) {
      setName(detailData.customerName);
      setPhone(detailData.customerPhone);
      setEmail(detailData.customerEmail ?? '');
      setPartySize(detailData.partySize);
      setDate(new Date(detailData.reservationDate + 'T00:00:00'));
      setTimeSlot(detailData.startTime.includes('T')
        ? format(new Date(detailData.startTime), 'HH:mm')
        : detailData.startTime);
      setNotes(detailData.notes ?? '');

      setOriginalValues({
        customerName: detailData.customerName,
        customerPhone: detailData.customerPhone,
        customerEmail: detailData.customerEmail ?? '',
        partySize: detailData.partySize,
        reservationDate: detailData.reservationDate,
        startTime: detailData.startTime.includes('T')
          ? format(new Date(detailData.startTime), 'HH:mm')
          : detailData.startTime,
        notes: detailData.notes ?? '',
      });
    }
  }, [detailData]);

  // Fetch availability when date or party size changes (and differs from original)
  const dateStr = date ? format(date, 'yyyy-MM-dd') : '';
  const needsAvailability =
    dateStr !== originalValues.reservationDate ||
    partySize !== originalValues.partySize;

  const { data: availabilityData } = useQuery<{ slots: AvailabilitySlot[] }>({
    queryKey: ['availability', dateStr, partySize],
    queryFn: async () => {
      const res = await fetch(
        `/api/availability?date=${dateStr}&partySize=${partySize}`
      );
      if (!res.ok) throw new Error('Failed to fetch availability');
      return res.json();
    },
    enabled: open && !!dateStr && needsAvailability,
  });

  // Determine if time/date/party changed (for conflict warning)
  const hasTimeConflictPotential = useCallback(() => {
    if (!detailData) return false;
    const timeChanged =
      timeSlot !==
      (detailData.startTime.includes('T')
        ? format(new Date(detailData.startTime), 'HH:mm')
        : detailData.startTime);
    const dateChanged = dateStr !== detailData.reservationDate;
    const partyChanged = partySize !== detailData.partySize;
    return timeChanged || dateChanged || partyChanged;
  }, [detailData, timeSlot, dateStr, partySize]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = {};

      if (name !== originalValues.customerName) patch.customerName = name;
      if (phone !== originalValues.customerPhone) patch.customerPhone = phone;
      if (email !== originalValues.customerEmail)
        patch.customerEmail = email || null;
      if (partySize !== originalValues.partySize) patch.partySize = partySize;
      if (notes !== originalValues.notes) patch.notes = notes || null;

      // If date or time changed, send those
      if (dateStr !== originalValues.reservationDate)
        patch.reservationDate = dateStr;
      if (timeSlot !== originalValues.startTime) patch.startTime = timeSlot;

      const res = await fetch(`/api/reservations/${reservationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === 'OVERLAP') {
          throw new Error(
            'TIME_CONFLICT: The selected time conflicts with an existing reservation.'
          );
        }
        throw new Error(err.error || 'Failed to save changes');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', reservationId] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      if (error.message.startsWith('TIME_CONFLICT:')) {
        setFormError(error.message.replace('TIME_CONFLICT: ', ''));
      } else {
        setFormError(error.message);
      }
    },
  });

  const handleSave = () => {
    setFormError(null);

    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!phone.trim()) {
      setFormError('Phone is required');
      return;
    }
    if (!timeSlot) {
      setFormError('Please select a time slot');
      return;
    }

    saveMutation.mutate();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFormError(null);
    }
    onOpenChange(newOpen);
  };

  const availableSlots = availabilityData?.slots ?? [];
  // If availability hasn't been fetched (no change to date/party), show current time as available
  const displaySlots = needsAvailability
    ? availableSlots
    : detailData
      ? [
          {
            startTime: detailData.startTime.includes('T')
              ? format(new Date(detailData.startTime), 'HH:mm')
              : detailData.startTime,
            available: true,
          },
        ]
      : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Reservation</DialogTitle>
          <DialogDescription>
            Update reservation details. Changing time, date, or party size may
            require table reassignment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
            />
          </div>

          {/* Phone & Email row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone *</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0412 345 678"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>

          {/* Party Size */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Party Size *</label>
            <Select
              value={String(partySize)}
              onValueChange={(v) => setPartySize(Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select party size" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {n === 1 ? 'guest' : 'guests'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date *</label>
            <Popover>
              <PopoverTrigger>
                <Button variant="outline" className="w-full justify-start text-sm font-normal">
                  {date ? format(date, 'EEE, dd MMM yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" side="bottom" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) =>
                    d < new Date(new Date().setHours(0, 0, 0, 0))
                  }
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Slot */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Time Slot *</label>
            {displaySlots.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {displaySlots.map((slot) => (
                  <Button
                    key={slot.startTime}
                    variant={timeSlot === slot.startTime ? 'default' : 'outline'}
                    size="sm"
                    disabled={!slot.available && timeSlot !== slot.startTime}
                    onClick={() => setTimeSlot(slot.startTime)}
                    className="text-xs"
                  >
                    {slot.startTime}
                  </Button>
                ))}
              </div>
            ) : date ? (
              <p className="text-sm text-muted-foreground">
                No available time slots for this date and party size.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a date first to see available times.
              </p>
            )}
          </div>

          {/* Warning for time/date/party changes */}
          {hasTimeConflictPotential() && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              ⚠ Changing time, date, or party size may require table
              reassignment. The system will check for conflicts automatically.
            </p>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special requests or notes..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Error display */}
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {formError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}