'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  CalendarCheck,
  UtensilsCrossed,
  Clock,
  XCircle,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useReservationListStore } from '@/lib/store';

// --- Types ---

interface TodaySummary {
  date: string;
  total: number;
  byStatus: Record<string, number>;
  upcomingArrivals: Arrival[];
}

interface Arrival {
  id: string;
  customerName: string;
  partySize: number;
  startTime: string;
  tableNames: string[];
  status: string;
}

// --- Status config ---

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  seated: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  no_show: 'bg-red-100 text-red-800 border-red-200',
};

interface StatCardDef {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string; // Tailwind text color for the icon area
  filterValue: string; // value passed to setStatusFilter
}

const statCards: StatCardDef[] = [
  {
    key: 'confirmed',
    label: 'Confirmed',
    icon: CalendarCheck,
    color: 'text-blue-600',
    filterValue: 'confirmed',
  },
  {
    key: 'seated',
    label: 'Seated',
    icon: UtensilsCrossed,
    color: 'text-green-600',
    filterValue: 'seated',
  },
  {
    key: 'pending',
    label: 'Pending',
    icon: Clock,
    color: 'text-amber-600',
    filterValue: 'pending',
  },
  {
    key: 'cancelled',
    label: 'Cancelled / No-show',
    icon: XCircle,
    color: 'text-red-600',
    filterValue: 'cancelled',
  },
];

// --- Dashboard ---

export default function StaffDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const store = useReservationListStore();

  // Fetch today's summary
  const { data: today, isLoading: loadingToday } = useQuery<TodaySummary>({
    queryKey: ['dashboard', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/today');
      if (!res.ok) throw new Error('Failed to fetch today summary');
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch upcoming arrivals (next 2h)
  const { data: upcoming, isLoading: loadingUpcoming } = useQuery<{ arrivals: Arrival[] }>({
    queryKey: ['dashboard', 'upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/upcoming');
      if (!res.ok) throw new Error('Failed to fetch upcoming arrivals');
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Seat mutation — changes confirmed → seated
  const seatMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'seated' }),
      });
      if (!res.ok) throw new Error('Failed to seat reservation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  // Navigate to reservations with status filter pre-applied via Zustand store
  const navigateToReservations = (status: string) => {
    store.setStatusFilter(status);
    router.push('/staff/reservations');
  };

  // Format date nicely
  const formattedDate = today?.date
    ? format(parseISO(today.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')
    : '';

  const byStatus = today?.byStatus ?? {};
  const total = today?.total ?? 0;
  const arrivals = upcoming?.arrivals ?? [];

  // Combine cancelled + no_show counts for the red card
  const cancelledOrNoShow =
    (byStatus['cancelled'] ?? 0) + (byStatus['no_show'] ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {loadingToday ? (
          <Skeleton className="h-5 w-48 mt-1" />
        ) : (
          <p className="text-muted-foreground mt-1">{formattedDate}</p>
        )}
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total card */}
        {loadingToday ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <Card
              className="cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
              onClick={() => {
                store.setStatusFilter('');
                router.push('/staff/reservations');
              }}
            >
              <CardContent className="flex items-center gap-4 py-2">
                <div className="rounded-lg bg-slate-100 p-2.5">
                  <CalendarDays className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{total}</p>
                </div>
              </CardContent>
            </Card>

            {statCards.map((card) => {
              const Icon = card.icon;
              const count =
                card.key === 'cancelled'
                  ? cancelledOrNoShow
                  : byStatus[card.key] ?? 0;
              const bgColor = card.color.replace('text-', 'bg-').replace('-600', '-100');

              return (
                <Card
                  key={card.key}
                  className="cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
                  onClick={() => navigateToReservations(card.filterValue)}
                >
                  <CardContent className="flex items-center gap-4 py-2">
                    <div className={`rounded-lg ${bgColor} p-2.5`}>
                      <Icon className={`h-5 w-5 ${card.color}`} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold">{count}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>

      {/* Upcoming Arrivals Panel */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Upcoming Arrivals</h2>
        {loadingUpcoming ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : arrivals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No upcoming arrivals 🎉
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arrivals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {format(parseISO(a.startTime), 'HH:mm')}
                    </TableCell>
                    <TableCell>{a.customerName}</TableCell>
                    <TableCell>{a.partySize}</TableCell>
                    <TableCell>{a.tableNames.join(', ') || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[a.status] || 'bg-gray-100'}
                      >
                        {a.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {a.status === 'confirmed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={seatMutation.isPending}
                            onClick={() =>
                              seatMutation.mutate({ id: a.id })
                            }
                          >
                            Seat
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push('/staff/reservations')}
                        >
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}