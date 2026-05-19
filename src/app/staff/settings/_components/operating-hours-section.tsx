'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X } from 'lucide-react';

interface Segment {
  label: string;
  start: string;
  end: string;
}

interface OperatingHoursData {
  operatingHours: Record<string, Segment[]>;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function validateSegments(segments: Segment[]): string | null {
  for (const seg of segments) {
    if (timeToMinutes(seg.start) >= timeToMinutes(seg.end)) {
      return `Segment "${seg.label || seg.start} – ${seg.end}" ends before or at its start time.`;
    }
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      const aStart = timeToMinutes(a.start);
      const aEnd = timeToMinutes(a.end);
      const bStart = timeToMinutes(b.start);
      const bEnd = timeToMinutes(b.end);
      if (aStart < bEnd && bStart < aEnd) {
        return `"${a.label || a.start} – ${a.end}" overlaps with "${b.label || b.start} – ${b.end}"`;
      }
    }
  }
  return null;
}

export default function OperatingHoursSection() {
  const queryClient = useQueryClient();
  const [segmentsByDay, setSegmentsByDay] = useState<Record<string, Segment[]>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [daySaved, setDaySaved] = useState<string | null>(null);

  const { data, isLoading } = useQuery<OperatingHoursData>({
    queryKey: ['operatingHours'],
    queryFn: async () => {
      const res = await fetch('/api/admin/operating-hours');
      if (!res.ok) throw new Error('Failed to fetch operating hours');
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.operatingHours) {
      const initial: Record<string, Segment[]> = {};
      for (const day of DAYS) {
        initial[day] = (data.operatingHours[day] || []).map((s) => ({
          label: s.label || '',
          start: s.start,
          end: s.end,
        }));
      }
      setSegmentsByDay(initial);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async ({ day, segments }: { day: string; segments: Segment[] }) => {
      const res = await fetch(`/api/admin/operating-hours?day=${day}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: segments.map((s, i) => ({
            label: s.label || undefined,
            startTime: s.start,
            endTime: s.end,
            sortOrder: i,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save');
      }
      return res.json();
    },
    onSuccess: (_, { day }) => {
      queryClient.invalidateQueries({ queryKey: ['operatingHours'] });
      setDaySaved(day);
      setTimeout(() => setDaySaved((current) => (current === day ? null : current)), 1500);
    },
  });

  const updateDay = useCallback((day: string, updater: (prev: Segment[]) => Segment[]) => {
    setSegmentsByDay((prev) => {
      const next = { ...prev, [day]: updater(prev[day] || []) };
      return next;
    });
  }, []);

  const addSegment = useCallback((day: string) => {
    updateDay(day, (prev) => [...prev, { label: '', start: '09:00', end: '17:00' }]);
  }, [updateDay]);

  const removeSegment = useCallback((day: string, index: number) => {
    updateDay(day, (prev) => prev.filter((_, i) => i !== index));
  }, [updateDay]);

  const handleSaveDay = (day: string) => {
    const segs = segmentsByDay[day] || [];
    const err = validateSegments(segs);
    setValidationError(err);
    if (err) return;
    saveMutation.mutate({ day, segments: segs });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Operating Hours</CardTitle></CardHeader>
        <CardContent><div className="text-muted-foreground">Loading…</div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operating Hours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Define one or more time segments for each day of the week. Leave all segments empty to mark a day as closed.
        </p>
        {validationError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {validationError}
          </div>
        )}
        {DAYS.map((day) => {
          const segs = segmentsByDay[day] || [];
          const isSaved = daySaved === day;
          return (
            <div key={day} className="border-b last:border-b-0 pb-5 last:pb-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold uppercase tracking-wide">{DAY_LABELS[day]}</span>
                <div className="flex items-center gap-2">
                  {isSaved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addSegment(day)}
                  >
                    + Add Segment
                  </Button>
                  <Button
                    size="sm"
                    disabled={saveMutation.isPending}
                    onClick={() => handleSaveDay(day)}
                  >
                    {saveMutation.isPending && saveMutation.variables?.day === day ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
              {segs.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Closed</p>
              )}
              {segs.map((seg, i) => (
                <div key={`${day}-${i}`} className="flex items-center gap-2 mb-2">
                  <Input
                    type="text"
                    placeholder="Label (e.g. Breakfast)"
                    value={seg.label}
                    onChange={(e) =>
                      updateDay(day, (prev) =>
                        prev.map((s, idx) => (idx === i ? { ...s, label: e.target.value } : s))
                      )
                    }
                    className="w-36"
                  />
                  <Input
                    type="time"
                    value={seg.start}
                    onChange={(e) =>
                      updateDay(day, (prev) =>
                        prev.map((s, idx) => (idx === i ? { ...s, start: e.target.value } : s))
                      )
                    }
                    className="w-32"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    value={seg.end}
                    onChange={(e) =>
                      updateDay(day, (prev) =>
                        prev.map((s, idx) => (idx === i ? { ...s, end: e.target.value } : s))
                      )
                    }
                    className="w-32"
                  />
                  <button
                    type="button"
                    onClick={() => removeSegment(day, i)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    aria-label="Remove segment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
