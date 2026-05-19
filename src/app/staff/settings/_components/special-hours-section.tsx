'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { X, Plus } from 'lucide-react';

interface SpecialSegment {
  startTime: string;
  endTime: string;
  label?: string;
}

interface SpecialHoursOverride {
  id: string;
  date: string;
  isClosed: boolean;
  segments?: SpecialSegment[];
  note?: string;
}

export default function SpecialHoursSection() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [segments, setSegments] = useState<SpecialSegment[]>([
    { startTime: '09:00', endTime: '17:00' },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ overrides: SpecialHoursOverride[] }>({
    queryKey: ['specialHours'],
    queryFn: async () => {
      const res = await fetch('/api/admin/special-hours');
      if (!res.ok) throw new Error('Failed to fetch special hours');
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: Omit<SpecialHoursOverride, 'id'>) => {
      const res = await fetch('/api/admin/special-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to add special hours');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialHours'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/special-hours/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialHours'] });
    },
  });

  const resetForm = () => {
    setDate('');
    setNote('');
    setIsClosed(false);
    setSegments([{ startTime: '09:00', endTime: '17:00' }]);
    setFormError(null);
  };

  const handleAdd = () => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFormError('Please enter a valid date (YYYY-MM-DD).');
      return;
    }
    const payload: Omit<SpecialHoursOverride, 'id'> = {
      date,
      isClosed,
      note: note || undefined,
      segments: isClosed ? undefined : segments,
    };
    addMutation.mutate(payload);
  };

  const addSegment = () => {
    setSegments((prev) => [...prev, { startTime: '09:00', endTime: '17:00' }]);
  };

  const removeSegment = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSegment = (index: number, patch: Partial<SpecialSegment>) => {
    setSegments((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  const overrides = data?.overrides || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Special Hours Overrides</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-1" /> Add Override
            </Button>} />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Special Hours Override</DialogTitle>
              <DialogDescription>
                Override the regular operating hours for a specific date.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {formError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Note</label>
                <Input
                  type="text"
                  placeholder="e.g. Christmas Day"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="closed"
                  type="checkbox"
                  checked={isClosed}
                  onChange={(e) => setIsClosed(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="closed" className="text-sm">Closed all day</label>
              </div>
              {!isClosed && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Segments</span>
                    <Button variant="outline" size="sm" onClick={addSegment}>
                      + Segment
                    </Button>
                  </div>
                  {segments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="Label"
                        value={seg.label || ''}
                        onChange={(e) => updateSegment(i, { label: e.target.value })}
                        className="w-28"
                      />
                      <Input
                        type="time"
                        value={seg.startTime}
                        onChange={(e) => updateSegment(i, { startTime: e.target.value })}
                        className="w-28"
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input
                        type="time"
                        value={seg.endTime}
                        onChange={(e) => updateSegment(i, { endTime: e.target.value })}
                        className="w-28"
                      />
                      <button
                        type="button"
                        onClick={() => removeSegment(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        aria-label="Remove segment"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button
                onClick={handleAdd}
                disabled={addMutation.isPending}
              >
                {addMutation.isPending ? 'Adding…' : 'Add Override'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <div className="text-muted-foreground">Loading…</div>}
        {overrides.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground italic">No special hours configured.</p>
        )}
        {overrides.map((o) => (
          <div
            key={o.id}
            className="flex items-start justify-between border rounded-lg p-3"
          >
            <div>
              <div className="font-medium text-sm">
                {o.date}
                {o.isClosed && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    Closed
                  </span>
                )}
              </div>
              {o.note && <div className="text-sm text-muted-foreground">{o.note}</div>}
              {!o.isClosed && o.segments && o.segments.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {o.segments.map((s, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
                    >
                      {s.label ? `${s.label}: ` : ''}
                      {s.startTime}–{s.endTime}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(o.id)}
              disabled={deleteMutation.isPending && deleteMutation.variables === o.id}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
