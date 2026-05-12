'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────

interface AvailableTable {
  id: string;
  name: string;
  capacity: number;
  minCapacity: number;
  isAvailable?: boolean;
}

interface WalkInReservation {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  status: string;
  source: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  createdAt: string;
  reservationTables: { table: { id: string; name: string; capacity: number } }[];
}

// ─── Duration Timer Hook ─────────────────────────────────────────

function useDurationTimer(startTime: string) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const calc = () => {
      const start = new Date(startTime).getTime();
      const diff = Date.now() - start;
      const minutes = Math.floor(diff / 60000);
      if (minutes < 60) {
        setElapsed(`${minutes} min`);
      } else {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        setElapsed(`${h}h ${m}m`);
      }
    };
    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [startTime]);

  return elapsed;
}

// ─── Duration Display Component ──────────────────────────────────

function DurationCell({ startTime }: { startTime: string }) {
  const elapsed = useDurationTimer(startTime);
  return <span className="font-mono text-sm">{elapsed}</span>;
}

// ─── Quick Entry Form ────────────────────────────────────────────

function QuickEntryForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [availableTables, setAvailableTables] = useState<AvailableTable[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'idle' | 'finding' | 'seating'>('idle');
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const createReservation = useMutation({
    mutationFn: async (data: {
      customerName: string;
      customerPhone: string;
      partySize: number;
      reservationDate: string;
      startTime: string;
      notes: string;
      source: string;
      status: string;
      preferredTableIds?: string[];
    }) => {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || 'Failed to create reservation');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walkIns'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      onCreated();
      resetForm();
    },
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || 'Failed to update reservation');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walkIns'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      onCreated();
      resetForm();
    },
  });

  function resetForm() {
    setName('');
    setPhone('');
    setPartySize(2);
    setAvailableTables([]);
    setSelectedTableIds([]);
    setMode('idle');
    setError(null);
  }

  function getNowTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function getTodayStr() {
    return format(new Date(), 'yyyy-MM-dd');
  }

  const handleFindTables = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!phone.trim()) {
      setError('Phone is required');
      return;
    }
    setError(null);
    setMode('finding');

    try {
      const today = getTodayStr();
      const res = await fetch(`/api/availability?date=${today}&partySize=${partySize}`);
      if (!res.ok) throw new Error('Failed to fetch availability');
      const data = await res.json();

      // Get tables available right now
      const nowStr = getNowTimeStr();
      const currentSlot = data.slots?.find(
        (s: { startTime: string }) => s.startTime === nowStr
      );

      // If no exact slot for now, try to find closest current or near-future slot
      let tables: AvailableTable[] = [];
      if (currentSlot) {
        tables = currentSlot.availableTableIds.map(
          (id: string, i: number) => ({
            id,
            name: currentSlot.availableTableNames[i],
            capacity: partySize, // approximate
            minCapacity: 1,
          })
        );
      }

      // Also fetch all active tables and show available ones
      // Use the availability endpoint with the nearest time
      if (tables.length === 0) {
        // Try closest upcoming slot
        const upcomingSlot = data.slots?.find(
          (s: { startTime: string }) => s.startTime >= nowStr
        );
        if (upcomingSlot) {
          tables = upcomingSlot.availableTableIds.map(
            (id: string, i: number) => ({
              id,
              name: upcomingSlot.availableTableNames[i],
              capacity: partySize,
              minCapacity: 1,
            })
          );
        }
      }

      // Fetch all tables to show capacity info
      const tablesRes = await fetch('/api/tables?active=true');
      let allTables: AvailableTable[] = [];
      if (tablesRes.ok) {
        const tablesData = await tablesRes.json();
        allTables = tablesData.tables || tablesData;
      }

      // Merge: show all tables, highlight available ones
      const availableIds = new Set(tables.map((t: AvailableTable) => t.id));
      const merged = allTables.map((t: AvailableTable) => ({
        ...t,
        isAvailable: availableIds.has(t.id) || tables.length === 0, // if no slots, assume all available
      }));

      setAvailableTables(merged.length > 0 ? merged : tables);
      setMode('seating');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find tables');
      setMode('idle');
    }
  };

  const handleSeatNow = async () => {
    if (!name.trim() || !phone.trim()) return;

    const now = new Date();
    const startTime = getNowTimeStr();

    createReservation.mutate({
      customerName: name.trim(),
      customerPhone: phone.trim(),
      partySize,
      reservationDate: getTodayStr(),
      startTime,
      notes: 'Walk-in',
      source: 'walk_in',
      status: 'seated',
      ...(selectedTableIds.length > 0 ? { preferredTableIds: selectedTableIds } : {}),
    });
  };

  const handleAddToWaitlist = async () => {
    if (!name.trim() || !phone.trim()) return;

    const now = new Date();
    const startTime = getNowTimeStr();

    createReservation.mutate({
      customerName: name.trim(),
      customerPhone: phone.trim(),
      partySize,
      reservationDate: getTodayStr(),
      startTime,
      notes: 'Walk-in — waiting',
      source: 'walk_in',
      status: 'pending',
    });
  };

  const toggleTable = (tableId: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(tableId)
        ? prev.filter((id) => id !== tableId)
        : [...prev, tableId]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Entry</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Phone *</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0412 345 678"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Party Size</label>
            <Select value={String(partySize)} onValueChange={(v) => setPartySize(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {n === 1 ? 'person' : 'people'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === 'seating' && availableTables.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Table(s)</label>
            <div className="flex flex-wrap gap-2">
              {availableTables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => toggleTable(table.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selectedTableIds.includes(table.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : table.isAvailable === false
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-primary hover:text-primary'
                  }`}
                  disabled={table.isAvailable === false}
                >
                  {table.name}
                  <span className="text-xs opacity-70">({table.capacity})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleFindTables}
            disabled={!name.trim() || !phone.trim()}
          >
            Find Tables
          </Button>
          <Button
            onClick={handleSeatNow}
            disabled={!name.trim() || !phone.trim()}
          >
            {createReservation.isPending ? 'Seating...' : 'Seat Now'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleAddToWaitlist}
            disabled={!name.trim() || !phone.trim()}
          >
            {createReservation.isPending ? 'Adding...' : 'Add to Waitlist'}
          </Button>
        </div>

        {createReservation.isError && (
          <p className="text-sm text-red-600">
            Failed to create walk-in. Please try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active Walk-ins List ────────────────────────────────────────

function ActiveWalkInsList() {
  const queryClient = useQueryClient();

  const today = format(new Date(), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['walkIns', 'seated', today],
    queryFn: async () => {
      const res = await fetch(
        `/api/reservations?dateFrom=${today}&dateTo=${today}&source=walk_in&status=seated`
      );
      if (!res.ok) throw new Error('Failed to fetch walk-ins');
      return res.json();
    },
    refetchInterval: 30000, // refresh every 30s
  });

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
      queryClient.invalidateQueries({ queryKey: ['walkIns'] });
    },
  });

  const walkIns: WalkInReservation[] = data?.reservations || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 bg-slate-100 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Currently Seated
          {walkIns.length > 0 && (
            <Badge variant="secondary">{walkIns.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {walkIns.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No walk-ins currently seated
          </p>
        ) : (
          <div className="space-y-3">
            {walkIns.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50"
              >
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
                  <div>
                    <p className="font-medium">{r.customerName}</p>
                    <p className="text-xs text-muted-foreground">{r.customerPhone}</p>
                  </div>
                  <div className="text-sm">
                    <Badge variant="outline" className="font-mono">
                      {r.partySize} {r.partySize === 1 ? 'person' : 'people'}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    {r.reservationTables?.map((rt) => rt.table.name).join(', ') || '—'}
                  </div>
                  <div className="text-sm">
                    <DurationCell startTime={r.startTime} />
                  </div>
                  <div>
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      Seated
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: r.id, status: 'completed' })}
                  >
                    Complete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Waitlist ─────────────────────────────────────────────────────

function Waitlist() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [availableTables, setAvailableTables] = useState<AvailableTable[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['walkIns', 'pending', today],
    queryFn: async () => {
      const res = await fetch(
        `/api/reservations?dateFrom=${today}&dateTo=${today}&source=walk_in&status=pending`
      );
      if (!res.ok) throw new Error('Failed to fetch waitlist');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walkIns'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      setExpandedId(null);
      setAvailableTables([]);
      setSelectedTableIds([]);
    },
  });

  const waitlist: WalkInReservation[] = data?.reservations || [];

  const handleFindTables = async (reservationId: string) => {
    setExpandedId(expandedId === reservationId ? null : reservationId);
    setSelectedTableIds([]);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const res = await fetch(`/api/availability?date=${today}&partySize=2`);
      if (!res.ok) throw new Error('Failed to fetch availability');
      const data = await res.json();

      // Get current or nearest slot
      const currentSlot = data.slots?.find(
        (s: { startTime: string }) => s.startTime >= timeStr
      );

      let tables: AvailableTable[] = [];
      if (currentSlot) {
        tables = currentSlot.availableTableIds.map(
          (id: string, i: number) => ({
            id,
            name: currentSlot.availableTableNames[i],
            capacity: 4,
            minCapacity: 1,
          })
        );
      }

      // Also get all tables
      const tablesRes = await fetch('/api/tables?active=true');
      if (tablesRes.ok) {
        const tablesData = await tablesRes.json();
        const allTables = tablesData.tables || tablesData;
        setAvailableTables(
          allTables.map((t: AvailableTable) => ({
            ...t,
            isAvailable: tables.length === 0 || tables.some((at: { id: string }) => at.id === t.id),
          }))
        );
      } else {
        setAvailableTables(tables);
      }
    } catch {
      setAvailableTables([]);
    }
  };

  const handleSeatFromWaitlist = async (reservationId: string) => {
    updateReservation.mutate({
      id: reservationId,
      data: {
        status: 'seated',
        ...(selectedTableIds.length > 0 ? { tableIds: selectedTableIds } : {}),
      },
    });
  };

  const toggleTable = (tableId: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(tableId)
        ? prev.filter((id) => id !== tableId)
        : [...prev, tableId]
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 bg-slate-100 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Waitlist
          {waitlist.length > 0 && (
            <Badge variant="secondary">{waitlist.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {waitlist.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No walk-ins waiting
          </p>
        ) : (
          <div className="space-y-3">
            {waitlist.map((r, index) => (
              <div
                key={r.id}
                className="border rounded-lg p-3 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{r.customerName}</p>
                        <p className="text-xs text-muted-foreground">{r.customerPhone}</p>
                      </div>
                    </div>
                    <div className="text-sm">
                      <Badge variant="outline" className="font-mono">
                        {r.partySize} {r.partySize === 1 ? 'person' : 'people'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Waiting since {format(new Date(r.createdAt), 'HH:mm')}
                    </div>
                    <div>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                        Waiting
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      onClick={() => handleFindTables(r.id)}
                    >
                      Seat Now
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updateReservation.mutate({
                          id: r.id,
                          data: { status: 'cancelled' },
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                {expandedId === r.id && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    {availableTables.length > 0 && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Select Table(s)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {availableTables.map((table) => (
                            <button
                              key={table.id}
                              type="button"
                              onClick={() => toggleTable(table.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                selectedTableIds.includes(table.id)
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : table.isAvailable === false
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-primary hover:text-primary'
                              }`}
                              disabled={table.isAvailable === false}
                            >
                              {table.name}
                              <span className="text-xs opacity-70">({table.capacity})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSeatFromWaitlist(r.id)}
                        disabled={updateReservation.isPending}
                      >
                        {updateReservation.isPending ? 'Seating...' : 'Confirm Seat'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setExpandedId(null);
                          setSelectedTableIds([]);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export default function WalkInsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const handleCreated = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Walk-ins</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), 'EEEE, d MMMM yyyy')}
        </p>
      </div>

      <QuickEntryForm onCreated={handleCreated} />

      <Tabs defaultValue="seated" className="w-full">
        <TabsList>
          <TabsTrigger value="seated">Currently Seated</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
        </TabsList>
        <TabsContent value="seated">
          <ActiveWalkInsList key={`seated-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="waitlist">
          <Waitlist key={`waitlist-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}