'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OpeningHours {
  [day: string]: { open: string; close: string } | null;
}

interface Settings {
  id: string;
  name: string;
  openingHours: OpeningHours;
  turnTimeRules: Record<string, number>;
  maxPartySize: number;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [openingHours, setOpeningHours] = useState<OpeningHours>({});
  const [turnTime, setTurnTime] = useState(90);
  const [maxParty, setMaxParty] = useState(12);
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
      setOpeningHours((data.openingHours as OpeningHours) || {});
      const rules = data.turnTimeRules as Record<string, number>;
      setTurnTime(rules?.default ?? 90);
      setMaxParty(data.maxPartySize ?? 12);
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

  const handleSaveHours = () => {
    saveMutation.mutate({ openingHours });
  };

  const handleSaveTurnTime = () => {
    saveMutation.mutate({
      turnTimeRules: { default: turnTime },
      maxPartySize: maxParty,
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Opening Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Available Times</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Set the opening and closing times for each day. Leave times empty to mark a day as closed.</p>
          {DAYS.map((day) => {
            const hours = openingHours[day];
            const isOpen = hours !== null && hours !== undefined;
            return (
              <div key={day} className="flex items-center gap-3">
                <span className="w-8 text-sm font-medium">{DAY_LABELS[day]}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isOpen}
                    onChange={(e) => {
                      const updated = { ...openingHours };
                      if (e.target.checked) {
                        updated[day] = { open: '17:00', close: '22:00' };
                      } else {
                        updated[day] = null;
                      }
                      setOpeningHours(updated);
                    }}
                    className="rounded"
                  />
                  Open
                </label>
                {isOpen && hours ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={hours.open}
                      onChange={(e) => {
                        setOpeningHours({ ...openingHours, [day]: { ...hours, open: e.target.value } });
                      }}
                      className="w-32"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={hours.close}
                      onChange={(e) => {
                        setOpeningHours({ ...openingHours, [day]: { ...hours, close: e.target.value } });
                      }}
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm flex-1">Closed</span>
                )}
              </div>
            );
          })}
          <Button onClick={handleSaveHours} disabled={saveMutation.isPending} className="w-full sm:w-auto">
            {saveMutation.isPending ? 'Saving...' : 'Save Hours'}
            {saved && ' ✓'}
          </Button>
        </CardContent>
      </Card>

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
          <Button onClick={handleSaveTurnTime} disabled={saveMutation.isPending} className="w-full sm:w-auto">
            {saveMutation.isPending ? 'Saving...' : 'Save Rules'}
            {saved && ' ✓'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}