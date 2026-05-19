'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import OperatingHoursSection from './_components/operating-hours-section';
import SpecialHoursSection from './_components/special-hours-section';

interface Settings {
  id: string;
  name: string;
  blockOutHours?: number;
  turnTimeRules: Record<string, number>;
  maxPartySize: number;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [turnTime, setTurnTime] = useState(90);
  const [maxParty, setMaxParty] = useState(12);
  const [blockOutHours, setBlockOutHours] = useState(0);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      return json.settings as Settings;
    },
  });

  useEffect(() => {
    if (data) {
      const rules = data.turnTimeRules as Record<string, number>;
      setTurnTime(rules?.default ?? 90);
      setMaxParty(data.maxPartySize ?? 12);
      setBlockOutHours(data.blockOutHours ?? 0);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSaveTurnTime = () => {
    saveMutation.mutate({
      turnTimeRules: { default: turnTime },
      maxPartySize: maxParty,
      blockOutHours: blockOutHours,
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading settings...</div>;

  const earliestBookable = new Date(Date.now() + blockOutHours * 60 * 60 * 1000);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Operating Hours */}
      <OperatingHoursSection />

      {/* Special Hours Overrides */}
      <SpecialHoursSection />

      {/* Turn Time & Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Booking Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Turn Time (minutes)</label>
            <Input
              type="number"
              value={turnTime}
              onChange={(e) => setTurnTime(Number(e.target.value))}
              min={30}
              max={300}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Party Size</label>
            <Input
              type="number"
              value={maxParty}
              onChange={(e) => setMaxParty(Number(e.target.value))}
              min={1}
              max={20}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Booking Block-Out Window (hours)</label>
            <p className="text-xs text-muted-foreground">
              Minimum advance notice required before a guest can make a booking.
            </p>
            <Input
              type="number"
              step={0.5}
              value={blockOutHours}
              onChange={(e) => setBlockOutHours(Number(e.target.value))}
              min={0}
            />
            <p className="text-xs text-muted-foreground">
              Earliest bookable time:{' '}
              <span className="font-medium text-foreground">
                {earliestBookable.toLocaleString('en-AU', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </p>
          </div>
          <Button onClick={handleSaveTurnTime} disabled={saveMutation.isPending} className="w-full sm:w-auto">
            {saveMutation.isPending ? 'Saving...' : 'Save Rules'}
            {saved && ' ✓'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
