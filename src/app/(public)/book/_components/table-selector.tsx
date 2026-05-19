'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBookingStore } from '@/lib/store';
import { format } from 'date-fns';
import type { TableAvailabilityStatus } from '@/app/api/tables/availability/route';

interface AvailabilityTable {
  id: string;
  name: string;
  capacity: number;
  minCapacity: number;
  shape: 'square' | 'booth';
  area: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: TableAvailabilityStatus;
  suitable: boolean;
  conflict?: {
    customerName: string;
    partySize: number;
    startTime: string;
    endTime: string;
  } | null;
}

interface FloorObjectData {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  opacity: number;
  zIndex: number;
}

interface TableSelectorProps {
  tables: AvailabilityTable[];
  floorObjects?: FloorObjectData[];
  partySize: number;
  date: Date;
  time: string;
  isLoading?: boolean;
}

const STATUS_STYLES: Record<
  TableAvailabilityStatus,
  { fill: string; stroke: string; text: string }
> = {
  available: { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d' },
  booked: { fill: '#fee2e2', stroke: '#dc2626', text: '#7f1d1d' },
  unsuitable: { fill: '#f3f4f6', stroke: '#9ca3af', text: '#6b7280' },
};

function TableShape({
  table,
  isSelected,
  onClick,
}: {
  table: AvailabilityTable;
  isSelected: boolean;
  onClick: () => void;
}) {
  const styles = STATUS_STYLES[table.status];
  const strokeWidth = isSelected ? 4 : 2;
  const strokeColor = isSelected ? '#2563eb' : styles.stroke;
  const fillColor = isSelected ? '#dbeafe' : styles.fill;

  const transform =
    table.rotation !== 0
      ? `rotate(${table.rotation} ${table.x + table.width / 2} ${table.y + table.height / 2})`
      : undefined;

  return (
    <g
      onClick={onClick}
      style={{ cursor: table.status === 'available' ? 'pointer' : 'not-allowed' }}
    >
      <rect
        x={table.x}
        y={table.y}
        width={table.width}
        height={table.height}
        rx={table.shape === 'booth' ? 8 : 2}
        ry={table.shape === 'booth' ? 8 : 2}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity={table.status === 'unsuitable' ? 0.6 : 1}
        transform={transform}
        className="transition-all duration-200"
      />
      <text
        x={table.x + table.width / 2}
        y={table.y + table.height / 2 - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fill={styles.text}
        transform={transform}
        pointerEvents="none"
      >
        {table.name}
      </text>
      <text
        x={table.x + table.width / 2}
        y={table.y + table.height / 2 + 10}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fill={styles.text}
        opacity={0.8}
        transform={transform}
        pointerEvents="none"
      >
        {table.capacity}p
      </text>
    </g>
  );
}

export default function TableSelector({ tables, floorObjects = [], partySize, date, time, isLoading }: TableSelectorProps) {
  const store = useBookingStore();
  const [area, setArea] = useState<string>('all');
  const svgRef = useRef<SVGSVGElement>(null);

  const areas = useMemo(() => {
    const set = new Set(tables.map((t) => t.area));
    return ['all', ...Array.from(set).sort()];
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (area === 'all') return tables;
    return tables.filter((t) => t.area === area);
  }, [tables, area]);

  const availableTables = useMemo(
    () => filteredTables.filter((t) => t.status === 'available'),
    [filteredTables]
  );
  const bookedTables = useMemo(
    () => filteredTables.filter((t) => t.status === 'booked'),
    [filteredTables]
  );
  const unsuitableTables = useMemo(
    () => filteredTables.filter((t) => t.status === 'unsuitable'),
    [filteredTables]
  );

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === store.selectedTableId) || null,
    [tables, store.selectedTableId]
  );

  // Compute SVG viewBox from table + object positions
  const viewBox = useMemo(() => {
    const allItems = [...filteredTables, ...floorObjects];
    if (allItems.length === 0) return { x: 0, y: 0, w: 800, h: 600 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const t of allItems) {
      minX = Math.min(minX, t.x - 20);
      minY = Math.min(minY, t.y - 20);
      maxX = Math.max(maxX, t.x + t.width + 20);
      maxY = Math.max(maxY, t.y + t.height + 20);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [filteredTables, floorObjects]);

  const handleSelect = (table: AvailabilityTable) => {
    if (table.status !== 'available') return;
    store.setSelectedTableId(table.id === store.selectedTableId ? null : table.id);
  };

  const handleConfirmSelection = () => {
    if (!store.selectedTableId) return;
    store.setStep('details');
  };

  const handleAutoSelect = () => {
    store.setSeatingChoice('auto');
    store.setSelectedTableId(null);
    store.setStep('details');
  };

  const handleManualSelect = () => {
    store.setSeatingChoice('manual');
    store.setSelectedTableId(null);
  };

  const noTablesAtAll = tables.length === 0;
  const noSuitableTables = tables.length > 0 && tables.every((t) => !t.suitable);
  const noAvailableTables = tables.length > 0 && tables.filter((t) => t.suitable).every((t) => t.status === 'booked');

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader>
        <CardTitle className="text-center">Seating Preference</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto / Manual choice */}
        {!store.seatingChoice && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleAutoSelect}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-muted hover:border-primary hover:bg-primary/5 transition-all text-center group"
            >
              <span className="text-3xl">✨</span>
              <span className="font-semibold">Let us seat you</span>
              <span className="text-sm text-muted-foreground">We&apos;ll pick the best table for your party</span>
            </button>
            <button
              onClick={handleManualSelect}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-muted hover:border-primary hover:bg-primary/5 transition-all text-center group"
            >
              <span className="text-3xl">🪑</span>
              <span className="font-semibold">Choose my table</span>
              <span className="text-sm text-muted-foreground">Pick your preferred table from the floor plan</span>
            </button>
          </div>
        )}

        {/* If auto chosen, show confirmation */}
        {store.seatingChoice === 'auto' && (
          <div className="text-center space-y-4">
            <div className="p-4 rounded-lg bg-primary/10 text-primary font-medium">
              ✨ We&apos;ll automatically seat you at the best available table
            </div>
            <button
              onClick={() => store.setSeatingChoice(null)}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Change preference
            </button>
          </div>
        )}

        {/* Manual floor plan */}
        {store.seatingChoice === 'manual' && (
          <>
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <span className="inline-flex gap-1 mr-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                </span>
                Loading available tables…
              </div>
            )}

            {noTablesAtAll && !isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-lg font-medium mb-1">No tables configured</p>
                <p className="text-sm">Please contact the restaurant directly.</p>
              </div>
            )}

            {noSuitableTables && (
              <div className="text-center py-6 text-red-600 bg-red-50 rounded-lg">
                <p className="font-medium">No tables large enough for your party</p>
                <p className="text-sm text-red-500 mt-1">
                  Your party has {partySize} guests but no table can accommodate this size.
                </p>
              </div>
            )}

            {noAvailableTables && !noSuitableTables && (
              <div className="text-center py-6 text-amber-700 bg-amber-50 rounded-lg">
                <p className="font-medium">All suitable tables are booked at this time</p>
                <p className="text-sm text-amber-600 mt-1">
                  Try a different time or let us seat you automatically.
                </p>
              </div>
            )}

            {!noTablesAtAll && !noSuitableTables && (
              <>
                {/* Area tabs */}
                {areas.length > 2 && (
                  <Tabs value={area} onValueChange={setArea}>
                    <TabsList className="w-full flex-wrap h-auto py-1">
                      {areas.map((a) => (
                        <TabsTrigger
                          key={a}
                          value={a}
                          className="flex-1 capitalize text-xs sm:text-sm"
                        >
                          {a === 'all' ? 'All Areas' : a.replace(/_/g, ' ')}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}

                {/* Legend + change preference */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-600"></span>
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-600"></span>
                    <span>Booked</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-400"></span>
                    <span>Not suitable</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm border-2 border-blue-600"></span>
                    <span>Selected</span>
                  </div>
                  <span className="ml-auto text-xs">
                    {availableTables.length} available · {bookedTables.length} booked · {unsuitableTables.length} unsuitable
                  </span>
                  <button
                    onClick={() => {
                      store.setSeatingChoice(null);
                      store.setSelectedTableId(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Change preference
                  </button>
                </div>

                {/* SVG Floor Plan */}
                <div className="border rounded-lg bg-white overflow-hidden relative">
                  <svg
                    ref={svgRef}
                    viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
                    className="w-full h-auto min-h-[250px] touch-none"
                    style={{ maxHeight: '60vh' }}
                  >
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.5" />
                    </pattern>
                    <rect
                      x={viewBox.x}
                      y={viewBox.y}
                      width={viewBox.w}
                      height={viewBox.h}
                      fill="url(#grid)"
                    />
                    {/* Floor objects behind tables (zIndex 0) */}
                    {floorObjects.filter((o) => o.zIndex === 0).map((obj) => (
                      <rect
                        key={obj.id}
                        x={obj.x}
                        y={obj.y}
                        width={obj.width}
                        height={obj.height}
                        rx={4}
                        ry={4}
                        fill={obj.color}
                        opacity={obj.opacity}
                        transform={obj.rotation !== 0 ? `rotate(${obj.rotation} ${obj.x + obj.width / 2} ${obj.y + obj.height / 2})` : undefined}
                        pointerEvents="none"
                      />
                    ))}
                    {filteredTables.map((table) => (
                      <TableShape
                        key={table.id}
                        table={table}
                        isSelected={table.id === store.selectedTableId}
                        onClick={() => handleSelect(table)}
                      />
                    ))}
                    {/* Floor objects in front (zIndex 1) */}
                    {floorObjects.filter((o) => o.zIndex === 1).map((obj) => (
                      <rect
                        key={obj.id}
                        x={obj.x}
                        y={obj.y}
                        width={obj.width}
                        height={obj.height}
                        rx={4}
                        ry={4}
                        fill={obj.color}
                        opacity={obj.opacity}
                        transform={obj.rotation !== 0 ? `rotate(${obj.rotation} ${obj.x + obj.width / 2} ${obj.y + obj.height / 2})` : undefined}
                        pointerEvents="none"
                      />
                    ))}
                  </svg>
                </div>

                {/* Selected table confirmation */}
                {selectedTable && (
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-blue-900">
                        Selected: {selectedTable.name} ({selectedTable.capacity} seats)
                      </span>
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                        Available
                      </Badge>
                    </div>
                    <p className="text-sm text-blue-800">
                      {selectedTable.area.replace(/_/g, ' ')} · {partySize} guests · {format(date, 'EEE d MMM')} at {time}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          store.setSelectedTableId(null);
                          store.setSeatingChoice(null);
                        }}
                      >
                        Change Preference
                      </Button>
                      <Button size="sm" onClick={handleConfirmSelection}>
                        Confirm Table
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
