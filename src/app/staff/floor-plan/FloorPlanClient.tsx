'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Stage, Layer, Rect, Circle, Text, Group, Transformer, Line } from 'react-konva';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFloorPlanStore } from '@/lib/store';
import type Konva from 'konva';

// ── Types ───────────────────────────────────────────────────────────────────

interface ActiveReservation {
  id: string;
  customerName: string;
  partySize: number;
  startTime: string;
  endTime: string;
  status: string;
}

interface PreviewReservation {
  id: string;
  customerName: string;
  partySize: number;
  startTime: string;
  endTime: string;
  status: string;
  tableIds: string[];
}

interface FloorTable {
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
  active: boolean;
  activeReservation: ActiveReservation | null;
}

interface FloorObject {
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

interface OptimizeResult {
  singleTables: { id: string; name: string; capacity: number; shape: string; area: string; x: number; y: number }[];
  combinations: { tableA: { id: string; name: string; capacity: number; x: number; y: number }; tableB: { id: string; name: string; capacity: number; x: number; y: number }; combinedCapacity: number; distance: number; isSuggested: boolean }[];
  groups: { id: string; name: string; combinedCapacity: number; tables: { id: string; name: string; capacity: number; x: number; y: number }[] }[];
}

type TableStatus = 'available' | 'reserved' | 'occupied';

function getStatus(t: FloorTable, previewReservations?: PreviewReservation[]): TableStatus {
  if (previewReservations) {
    // Preview mode: check reservations that include this table
    const res = previewReservations.find((r) => r.tableIds.includes(t.id));
    if (!res) return 'available';
    if (res.status === 'seated') return 'occupied';
    if (res.status === 'pending' || res.status === 'confirmed') return 'reserved';
    return 'available';
  }
  // Live mode: use real-time active reservation
  if (!t.activeReservation) return 'available';
  if (t.activeReservation.status === 'seated') return 'occupied';
  if (t.activeReservation.status === 'pending' || t.activeReservation.status === 'confirmed') return 'reserved';
  return 'available';
}

function getPreviewReservationForTable(t: FloorTable, previewReservations: PreviewReservation[]): PreviewReservation | undefined {
  return previewReservations.find((r) => r.tableIds.includes(t.id));
}

const STATUS_COLORS: Record<TableStatus, { fill: string; stroke: string }> = {
  available: { fill: '#f0fdf4', stroke: '#22c55e' },
  reserved: { fill: '#fefce8', stroke: '#eab308' },
  occupied: { fill: '#fef2f2', stroke: '#ef4444' },
};

const OBJECT_PRESETS: Record<string, { color: string; width: number; height: number; label: string }> = {
  kitchen: { color: '#f97316', width: 120, height: 80, label: 'Kitchen' },
  bar: { color: '#8b5cf6', width: 100, height: 40, label: 'Bar Counter' },
  entrance: { color: '#22c55e', width: 60, height: 20, label: 'Entrance' },
  wall: { color: '#64748b', width: 120, height: 10, label: 'Wall' },
  plant: { color: '#16a34a', width: 20, height: 20, label: 'Plant' },
  restroom: { color: '#06b6d4', width: 40, height: 40, label: 'Restroom' },
  custom: { color: '#94a3b8', width: 80, height: 40, label: 'Custom' },
};

const GRID_SIZE = 20;
const snapToGrid = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

// ── Grid Background ─────────────────────────────────────────────────────────

function GridBackground({ width, height }: { width: number; height: number }) {
  const spacing = 20;
  const lines = [];
  for (let x = 0; x <= width; x += spacing) {
    lines.push(<Line key={`v${x}`} points={[x, 0, x, height]} stroke="#e2e8f0" strokeWidth={0.5} />);
  }
  for (let y = 0; y <= height; y += spacing) {
    lines.push(<Line key={`h${y}`} points={[0, y, width, y]} stroke="#e2e8f0" strokeWidth={0.5} />);
  }
  return <>{lines}</>;
}

// ── Floor Object Shape ──────────────────────────────────────────────────────

interface FloorObjectShapeProps {
  obj: FloorObject;
  isSelected: boolean;
  isEditMode: boolean;
  onSelect: () => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onTransformEnd: (id: string, x: number, y: number, w: number, h: number, rotation: number) => void;
}

const FloorObjectShape = React.forwardRef<Konva.Group, FloorObjectShapeProps>(
  ({ obj, isSelected, isEditMode, onSelect, onDragEnd, onTransformEnd }, forwardedRef) => {
    const groupRef = useRef<Konva.Group>(null);
    const trRef = useRef<Konva.Transformer>(null);

    // Sync internal ref with forwarded ref
    useEffect(() => {
      if (typeof forwardedRef === 'function') {
        forwardedRef(groupRef.current);
      } else if (forwardedRef && 'current' in forwardedRef) {
        forwardedRef.current = groupRef.current;
      }
    }, [forwardedRef]);

    useEffect(() => {
      if (isSelected && isEditMode && trRef.current && groupRef.current) {
        trRef.current.nodes([groupRef.current]);
        trRef.current.getLayer()?.batchDraw();
      } else if (trRef.current) {
        trRef.current.nodes([]);
        trRef.current.getLayer()?.batchDraw();
      }
    }, [isSelected, isEditMode]);

    const handleTransformEnd = () => {
      if (!groupRef.current) return;
      const node = groupRef.current;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      onTransformEnd(obj.id, node.x(), node.y(), Math.max(10, obj.width * sx), Math.max(10, obj.height * sy), node.rotation());
    };

    return (
      <>
        <Group
          ref={groupRef}
          x={obj.x}
          y={obj.y}
          rotation={obj.rotation}
          draggable={isEditMode}
          onClick={onSelect}
          onTap={onSelect}
          onDragMove={(e) => {
            if (!isEditMode) return;
            const node = e.target;
            node.x(snapToGrid(node.x()));
            node.y(snapToGrid(node.y()));
          }}
          onDragEnd={(e) => onDragEnd(obj.id, e.target.x(), e.target.y())}
          onTransformEnd={handleTransformEnd}
          onMouseEnter={(e) => { if (isEditMode) { const container = e.target.getStage()?.container(); if (container) container.style.cursor = 'move'; } }}
          onMouseLeave={(e) => { const container = e.target.getStage()?.container(); if (container) container.style.cursor = 'default'; }}
        >
          <Rect
            width={obj.width}
            height={obj.height}
            fill={obj.color}
            opacity={obj.opacity}
            stroke={isSelected ? '#6366f1' : 'transparent'}
            strokeWidth={isSelected ? 2 : 0}
            cornerRadius={4}
          />
          <Text
            text={obj.label}
            fontSize={10}
            fill="#1e293b"
            opacity={0.8}
            align="center"
            width={obj.width}
            y={obj.height / 2 - 5}
          />
        </Group>
        {isSelected && isEditMode && (
          <Transformer
            ref={trRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 10 || newBox.height < 10) return oldBox;
              return newBox;
            }}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180]}
            enabledAnchors={['top-left','top-center','top-right','middle-left','middle-right','bottom-left','bottom-center','bottom-right']}
          />
        )}
      </>
    );
  }
);
FloorObjectShape.displayName = 'FloorObjectShape';

// ── Table Shape ─────────────────────────────────────────────────────────────

interface TransformableTableProps {
  table: FloorTable;
  isSelected: boolean;
  isEditMode: boolean;
  isHighlighted: boolean;
  isFindTableMode?: boolean;
  previewReservations?: PreviewReservation[];
  onSelect: () => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onTransformEnd: (id: string, x: number, y: number, w: number, h: number, rotation: number) => void;
}

const TransformableTable = React.forwardRef<Konva.Group, TransformableTableProps>(
  ({ table, isSelected, isEditMode, isHighlighted, isFindTableMode, previewReservations, onSelect, onDragEnd, onTransformEnd }, forwardedRef) => {
    const groupRef = useRef<Konva.Group>(null);
    const trRef = useRef<Konva.Transformer>(null);

    // Sync internal ref with forwarded ref
    useEffect(() => {
      if (typeof forwardedRef === 'function') {
        forwardedRef(groupRef.current);
      } else if (forwardedRef && 'current' in forwardedRef) {
        forwardedRef.current = groupRef.current;
      }
    }, [forwardedRef]);

    useEffect(() => {
      if (isSelected && isEditMode && trRef.current && groupRef.current) {
        trRef.current.nodes([groupRef.current]);
        trRef.current.getLayer()?.batchDraw();
      } else if (trRef.current) {
        trRef.current.nodes([]);
        trRef.current.getLayer()?.batchDraw();
      }
    }, [isSelected, isEditMode]);

    const handleTransformEnd = () => {
      if (!groupRef.current) return;
      const node = groupRef.current;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      onTransformEnd(table.id, node.x(), node.y(), Math.max(30, table.width * sx), Math.max(30, table.height * sy), node.rotation());
    };

    const status = getStatus(table, previewReservations);
    const previewRes = previewReservations ? getPreviewReservationForTable(table, previewReservations) : undefined;
    const colors = STATUS_COLORS[status];
    const strokeWidth = isHighlighted ? 4 : isSelected ? 3 : 2;
    const strokeColor = isHighlighted ? '#6366f1' : isSelected ? '#6366f1' : colors.stroke;

    return (
      <>
        <Group
          ref={groupRef}
          x={table.x}
          y={table.y}
          rotation={table.rotation}
          draggable={isEditMode}
          onClick={onSelect}
          onTap={onSelect}
          onDragMove={(e) => {
            if (!isEditMode) return;
            const node = e.target;
            node.x(snapToGrid(node.x()));
            node.y(snapToGrid(node.y()));
          }}
          onDragEnd={(e) => onDragEnd(table.id, e.target.x(), e.target.y())}
          onTransformEnd={handleTransformEnd}
          opacity={isFindTableMode && !isHighlighted ? 0.3 : 1}
          onMouseEnter={(e) => { if (isEditMode) { const container = e.target.getStage()?.container(); if (container) container.style.cursor = 'move'; } }}
          onMouseLeave={(e) => { const container = e.target.getStage()?.container(); if (container) container.style.cursor = 'default'; }}
        >
          {table.shape === 'booth' ? (
            <Rect
              width={table.width}
              height={table.height}
              fill={colors.fill}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              cornerRadius={8}
            />
          ) : (
            <Rect
              width={table.width}
              height={table.height}
              fill={colors.fill}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              cornerRadius={2}
            />
          )}
          <Text text={table.name} fontSize={11} fill="#1e293b" align="center" width={table.width} y={table.height / 2 - 12} />
          <Text text={`${table.capacity}p`} fontSize={9} fill="#64748b" align="center" width={table.width} y={table.height / 2 + 2} />
        </Group>
        {isSelected && isEditMode && (
          <Transformer
            ref={trRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 30 || newBox.height < 30) return oldBox;
              return newBox;
            }}
            rotateEnabled
            rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 135, 180]}
            enabledAnchors={['top-left','top-center','top-right','middle-left','middle-right','bottom-left','bottom-center','bottom-right']}
          />
        )}
      </>
    );
  }
);
TransformableTable.displayName = 'TransformableTable';

// ── Combination Creator ───────────────────────────────────────────────────

function CombinationCreator({
  table,
  allTables,
  existingCombos,
  onAdd,
}: {
  table: FloorTable;
  allTables: FloorTable[];
  existingCombos: Combination[];
  onAdd: (tableAId: string, tableBId: string, combinedCapacity: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const eligible = allTables.filter(
    (t) =>
      t.id !== table.id &&
      !existingCombos.some(
        (c) => (c.tableA.id === table.id && c.tableB.id === t.id) || (c.tableA.id === t.id && c.tableB.id === table.id)
      )
  );

  const handleAdd = () => {
    if (!selectedId) return;
    const other = allTables.find((t) => t.id === selectedId);
    if (!other) return;
    onAdd(table.id, selectedId, table.capacity + other.capacity);
    setSelectedId(null);
  };

  if (eligible.length === 0) return <div className="text-xs text-muted-foreground">No more tables to combine</div>;

  return (
    <div className="flex items-center gap-1">
      <select
        value={selectedId || ''}
        onChange={(e) => setSelectedId(e.target.value || null)}
        className="flex-1 border rounded px-1 py-0.5 text-xs">
        <option value="">+ Add combo…</option>
        {eligible.map((t) => (
          <option key={t.id} value={t.id}>{t.name} ({t.capacity}p)</option>
        ))}
      </select>
      <Button size="sm" variant="outline" className="text-xs h-6 px-2" disabled={!selectedId} onClick={handleAdd}>Add</Button>
    </div>
  );
}

// ── Multi-Group Creator ──────────────────────────────────────────────────────

function MultiGroupCreator({
  table,
  allTables,
  existingGroups,
  onAddGroup,
}: {
  table: FloorTable;
  allTables: FloorTable[];
  existingGroups: TableGroupItem[];
  onAddGroup: (tableIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const eligible = allTables.filter((t) => t.id !== table.id);

  const toggleTable = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleCreate = () => {
    if (selectedIds.length === 0) return;
    onAddGroup([table.id, ...selectedIds]);
    setSelectedIds([]);
    setIsOpen(false);
  };

  return (
    <div className="space-y-1">
      {!isOpen ? (
        <Button size="sm" variant="outline" className="text-xs w-full" onClick={() => setIsOpen(true)}>+ Create group (2+ tables)</Button>
      ) : (
        <>
          <div className="border rounded p-2 max-h-32 overflow-y-auto space-y-1">
            {eligible.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleTable(t.id)} className="rounded" />
                <span>{t.name}</span>
                <span className="text-muted-foreground">({t.capacity}p)</span>
              </label>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => { setIsOpen(false); setSelectedIds([]); }}>Cancel</Button>
            <Button size="sm" className="text-xs flex-1" disabled={selectedIds.length === 0} onClick={handleCreate}>
              Create ({selectedIds.length + 1} tables)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Detail Panel ────────────────────────────────────────────────────────────

interface TableGroupItem {
  id: string;
  name: string;
  combinedCapacity: number;
  tables: { id: string; name: string; capacity: number; x: number; y: number }[];
}

interface Combination {
  id: string;
  tableA: { id: string; name: string; capacity: number };
  tableB: { id: string; name: string; capacity: number };
  combinedCapacity: number;
}

function DetailPanel({
  table,
  floorObj,
  isEditMode,
  combinations,
  allTables,
  previewReservations,
  viewMode,
  onClose,
  onDeleteTable,
  onDeleteObject,
  onUpdateTableCapacity,
  onAddCombination,
  onDeleteCombination,
  tableGroups,
  onAddGroup,
  onDeleteGroup,
}: {
  table: FloorTable | null;
  floorObj: FloorObject | null;
  isEditMode: boolean;
  combinations: Combination[];
  allTables: FloorTable[];
  previewReservations?: PreviewReservation[];
  viewMode: 'live' | 'preview';
  onClose: () => void;
  onDeleteTable: (id: string) => void;
  onDeleteObject: (id: string) => void;
  onUpdateTableCapacity: (id: string, capacity: number) => void;
  onAddCombination: (tableAId: string, tableBId: string, combinedCapacity: number) => void;
  onDeleteCombination: (id: string) => void;
  tableGroups: TableGroupItem[];
  onAddGroup: (tableIds: string[]) => void;
  onDeleteGroup: (id: string) => void;
}) {
  if (table) {
    const previewRes = viewMode === 'preview' && previewReservations ? getPreviewReservationForTable(table, previewReservations) : undefined;
    const status = getStatus(table, viewMode === 'preview' ? previewReservations : undefined);
    const res = viewMode === 'preview' ? previewRes : table.activeReservation;
    return (
      <div className="w-72 border-l bg-white p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg text-center">{table.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={status === 'available' ? 'default' : status === 'occupied' ? 'destructive' : 'secondary'}>{status}</Badge>
            <span className="text-sm text-muted-foreground">{table.area}</span>
          </div>
          <div className="text-sm"><span className="text-muted-foreground">Capacity:</span> {table.minCapacity}–{table.capacity}</div>
          <div className="text-sm"><span className="text-muted-foreground">Shape:</span> {table.shape}</div>
          <div className="text-sm"><span className="text-muted-foreground">Position:</span> ({Math.round(table.x)}, {Math.round(table.y)})</div>
        </div>
        {res && (
          <div className="border-t pt-3 space-y-2">
            <h4 className="font-medium text-sm text-center">{viewMode === 'preview' ? 'Reservation at this time' : 'Active Reservation'}</h4>
            <div className="text-sm"><span className="text-muted-foreground">Guest:</span> {res.customerName}</div>
            <div className="text-sm"><span className="text-muted-foreground">Party:</span> {res.partySize}</div>
            <div className="text-sm">
              <span className="text-muted-foreground">Time:</span>{' '}
              {new Date(res.startTime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} –{' '}
              {new Date(res.endTime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}
        {/* Combinations section */}
        {(() => {
          const tableCombos = combinations.filter(
            (c) => c.tableA.id === table.id || c.tableB.id === table.id
          );
          if (tableCombos.length === 0 && !isEditMode) return null;
          return (
            <div className="border-t pt-3 space-y-2">
              <h4 className="font-medium text-sm text-center">Combinations</h4>
              {tableCombos.map((c) => {
                const other = c.tableA.id === table.id ? c.tableB : c.tableA;
                return (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span>{table.name} + {other.name} = {c.combinedCapacity}p</span>
                    {isEditMode && (
                      <button
                        className="text-red-500 hover:text-red-700 text-xs"
                        onClick={() => onDeleteCombination(c.id)}
                      >✕</button>
                    )}
                  </div>
                );
              })}
              {isEditMode && (
                <CombinationCreator
                  table={table}
                  allTables={allTables}
                  existingCombos={tableCombos}
                  onAdd={onAddCombination}
                />
              )}
            </div>
          );
        })()}

        {/* Table Groups section */}
        {(() => {
          const tableGrps = tableGroups.filter((g) => g.tables.some((t) => t.id === table.id));
          if (tableGrps.length === 0 && !isEditMode) return null;
          return (
            <div className="border-t pt-3 space-y-2">
              <h4 className="font-medium text-sm text-center">Table Groups</h4>
              {tableGrps.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm">
                  <span>{g.tables.map((t) => t.name).join(' + ')} = {g.combinedCapacity}p</span>
                  {isEditMode && (
                    <button className="text-red-500 hover:text-red-700 text-xs" onClick={() => onDeleteGroup(g.id)}>✕</button>
                  )}
                </div>
              ))}
              {isEditMode && (
                <MultiGroupCreator
                  table={table}
                  allTables={allTables}
                  existingGroups={tableGrps}
                  onAddGroup={onAddGroup}
                />
              )}
            </div>
          );
        })()}

        {isEditMode && (
          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Seats:</label>
              <input
                type="number"
                min={1}
                max={20}
                value={table.capacity}
                className="w-14 border rounded px-2 py-1 text-sm"
                onChange={async (e) => {
                  const cap = parseInt(e.target.value) || 1;
                  onUpdateTableCapacity(table.id, cap);
                  try {
                    await fetch(`/api/tables/${table.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ capacity: cap }) });
                  } catch { /* ignore */ }
                }}
              />
            </div>
            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteTable(table.id)}>Delete Table</Button>
          </div>
        )}
      </div>
    );
  }

  if (floorObj) {
    return (
      <div className="w-72 border-l bg-white p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg text-center">{floorObj.label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="space-y-2">
          <Badge variant="secondary">{floorObj.type}</Badge>
          <div className="text-sm"><span className="text-muted-foreground">Size:</span> {Math.round(floorObj.width)}×{Math.round(floorObj.height)}</div>
          <div className="text-sm"><span className="text-muted-foreground">Position:</span> ({Math.round(floorObj.x)}, {Math.round(floorObj.y)})</div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Color:</span>
            <div className="w-5 h-5 rounded border" style={{ backgroundColor: floorObj.color }} />
          </div>
        </div>
        {isEditMode && (
          <div className="border-t pt-3">
            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteObject(floorObj.id)}>Delete Object</Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ── Find Table Panel ────────────────────────────────────────────────────────

function FindTablePanel({
  onHighlight,
  onClose,
}: {
  onHighlight: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [partySize, setPartySize] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tables/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ partySize }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        // Highlight all available table IDs
        const ids = [
          ...data.singleTables.map((t: any) => t.id),
          ...data.combinations.flatMap((c: any) => [c.tableA.id, c.tableB.id]),
          ...data.groups.flatMap((g: any) => g.tables.map((t: any) => t.id)),
        ];
        onHighlight(ids);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-white border rounded-lg shadow-lg p-3 z-10 flex items-center gap-2">
      <span className="text-sm font-medium">Find Table for</span>
      <input
        type="number"
        min={1}
        max={20}
        value={partySize}
        onChange={(e) => setPartySize(parseInt(e.target.value) || 1)}
        className="w-14 border rounded px-2 py-1 text-sm"
      />
      <Button size="sm" onClick={handleSearch} disabled={loading}>{loading ? '…' : 'Search'}</Button>
      <Button size="sm" variant="ghost" onClick={() => { onHighlight([]); setResult(null); }}>Clear</Button>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">&times;</button>
      {result && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border rounded shadow-lg p-2 text-xs space-y-1 max-h-40 overflow-y-auto">
          {result.singleTables.length > 0 && (
            <div className="font-medium">Single tables: {result.singleTables.map((t) => t.name).join(', ')}</div>
          )}
          {result.combinations.length > 0 && (
            <div className="font-medium">
              Combinations: {result.combinations.slice(0, 5).map((c) => `${c.tableA.name}+${c.tableB.name}(${c.combinedCapacity}p${c.isSuggested ? '*' : ''})`).join(', ')}
            </div>
          )}
          {result.groups.length > 0 && (
            <div className="font-medium">
              Groups: {result.groups.slice(0, 5).map((g) => `${g.name}(${g.combinedCapacity}p)`).join(', ')}
            </div>
          )}
          {result.singleTables.length === 0 && result.combinations.length === 0 && result.groups.length === 0 && (
            <div className="text-muted-foreground">No tables found for {partySize} guests</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function FloorPlanPage() {
  const store = useFloorPlanStore();
  const [mounted, setMounted] = useState(false);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [savedTables, setSavedTables] = useState<FloorTable[]>([]);
  const [floorObjects, setFloorObjects] = useState<FloorObject[]>([]);
  const [savedFloorObjects, setSavedFloorObjects] = useState<FloorObject[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showFindTable, setShowFindTable] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [tableGroups, setTableGroups] = useState<TableGroupItem[]>([]);
  const [previewReservations, setPreviewReservations] = useState<PreviewReservation[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRefs = useRef<Map<string, Konva.Group>>(new Map());
  const objectRefs = useRef<Map<string, Konva.Group>>(new Map());

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const updateSize = () => { if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth); };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetch('/api/tables?includeActive=true')
      .then((r) => r.json())
      .then((data) => {
        const t = data.tables.map((tbl: FloorTable) => ({ ...tbl, rotation: tbl.rotation ?? 0 }));
        setTables(t);
        setSavedTables(t);
      })
      .catch(console.error);
    fetch('/api/floor-objects')
      .then((r) => r.json())
      .then((data) => { setFloorObjects(data.objects || []); setSavedFloorObjects(data.objects || []); })
      .catch(console.error);
    fetch('/api/table-combinations')
      .then((r) => r.json())
      .then((data) => { setCombinations(data.combinations || []); })
      .catch(console.error);
    fetch('/api/table-groups')
      .then((r) => r.json())
      .then((data) => {
        const groups = (data.groups || []).map((g: any) => ({
          id: g.id, name: g.name, combinedCapacity: g.combinedCapacity,
          tables: g.groupMembers.map((m: any) => ({ id: m.table.id, name: m.table.name, capacity: m.table.capacity, x: m.table.x, y: m.table.y })),
        }));
        setTableGroups(groups);
      })
      .catch(console.error);
  }, [mounted]);

  // Fetch reservations for preview mode
  useEffect(() => {
    if (store.viewMode !== 'preview') {
      setPreviewReservations([]);
      return;
    }
    const dateStr = format(store.selectedDate, 'yyyy-MM-dd');
    fetch(`/api/reservations?dateFrom=${dateStr}&dateTo=${dateStr}`)
      .then((r) => r.json())
      .then((data) => {
        const selectedHour = parseInt(store.selectedTime.split(':')[0]);
        const selectedMin = parseInt(store.selectedTime.split(':')[1]) || 0;
        const selectedDateObj = new Date(store.selectedDate);
        selectedDateObj.setHours(selectedHour, selectedMin, 0, 0);
        const selectedTime = selectedDateObj.getTime();
        // Filter to reservations that overlap the selected time
        const overlapping = (data.reservations || [])
          .filter((r: any) => {
            if (['cancelled', 'no_show'].includes(r.status)) return false;
            const start = new Date(r.startTime).getTime();
            const end = new Date(r.endTime).getTime();
            return start <= selectedTime && end > selectedTime;
          })
          .map((r: any) => ({
            id: r.id,
            customerName: r.customerName,
            partySize: r.partySize,
            startTime: r.startTime,
            endTime: r.endTime,
            status: r.status,
            tableIds: (r.reservationTables || []).map((rt: any) => rt.tableId || rt.table?.id),
          }));
        setPreviewReservations(overlapping);
      })
      .catch(console.error);
  }, [store.viewMode, store.selectedDate, store.selectedTime]);

  // Pinch-to-zoom
  const lastDist = useRef<number | null>(null);

  const GRID_SIZE = 20;
  const snapToGrid = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

  const handleTableDragEnd = useCallback((id: string, x: number, y: number) => {
    const sx = snapToGrid(x);
    const sy = snapToGrid(y);
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, x: sx, y: sy } : t)));
    setHasChanges(true);
  }, []);

  const handleTableTransformEnd = useCallback((id: string, x: number, y: number, w: number, h: number, rotation: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, x: snapToGrid(x), y: snapToGrid(y), width: Math.round(w), height: Math.round(h), rotation } : t)));
    setHasChanges(true);
  }, []);

  const handleObjectDragEnd = useCallback((id: string, x: number, y: number) => {
    const sx = snapToGrid(x);
    const sy = snapToGrid(y);
    setFloorObjects((prev) => prev.map((o) => (o.id === id ? { ...o, x: sx, y: sy } : o)));
    setHasChanges(true);
  }, []);

  const handleObjectTransformEnd = useCallback((id: string, x: number, y: number, w: number, h: number, rotation: number) => {
    setFloorObjects((prev) => prev.map((o) => (o.id === id ? { ...o, x: snapToGrid(x), y: snapToGrid(y), width: Math.round(w), height: Math.round(h), rotation } : o)));
    setHasChanges(true);
  }, []);

  // Save layout
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changedTables = tables
        .filter((t) => {
          const saved = savedTables.find((s) => s.id === t.id);
          if (!saved) return true;
          return t.x !== saved.x || t.y !== saved.y || t.width !== saved.width || t.height !== saved.height || t.rotation !== saved.rotation;
        })
        .map((t) => ({ id: t.id, x: Math.round(t.x), y: Math.round(t.y), width: Math.round(t.width), height: Math.round(t.height), rotation: Math.round(t.rotation * 10) / 10 }));

      if (changedTables.length > 0) {
        await fetch('/api/tables/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ tables: changedTables }) });
      }

      // Save changed floor objects
      const changedObjects = floorObjects
        .filter((o) => {
          const saved = savedFloorObjects.find((s) => s.id === o.id);
          if (!saved) return true;
          return o.x !== saved.x || o.y !== saved.y || o.width !== saved.width || o.height !== saved.height || o.rotation !== saved.rotation;
        })
        .map((o) => ({ id: o.id, x: Math.round(o.x), y: Math.round(o.y), width: Math.round(o.width), height: Math.round(o.height), rotation: Math.round(o.rotation * 10) / 10 }));

      for (const obj of changedObjects) {
        await fetch(`/api/floor-objects/${obj.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(obj) });
      }

      setSavedTables([...tables]);
      setSavedFloorObjects([...floorObjects]);
      setHasChanges(false);
      alert('Layout saved!');
    } catch (err) {
      console.error(err);
      alert('Failed to save layout.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = () => {
    setTables([...savedTables]);
    setFloorObjects([...savedFloorObjects]);
    setHasChanges(false);
    setSelectedTableId(null);
    setSelectedObjectId(null);
  };

  // Edit mode toggle with unsaved changes check
  const handleToggleEdit = () => {
    if (store.isEditMode && hasChanges) {
      setConfirmDialog({
        message: 'You have unsaved changes. Discard?',
        onConfirm: () => { handleUndo(); store.toggleEditMode(); setConfirmDialog(null); },
      });
    } else {
      store.toggleEditMode();
    }
  };

  // Update table capacity locally
  const handleUpdateCapacity = useCallback((id: string, capacity: number) => {
    setTables((prev) => prev.map((t) => t.id === id ? { ...t, capacity } : t));
    setHasChanges(true);
  }, []);

  // Delete table
  const handleDeleteTable = (id: string) => {
    const table = tables.find((t) => t.id === id);
    const hasRes = !!table?.activeReservation;
    setConfirmDialog({
      message: hasRes ? `⚠️ ${table?.name} has an active reservation. Delete anyway?` : `Delete ${table?.name}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await fetch(`/api/tables/${id}`, { method: 'DELETE', credentials: 'include' });
          setTables((prev) => prev.filter((t) => t.id !== id));
          setSelectedTableId(null);
        } catch { alert('Failed to delete table.'); }
      },
    });
  };

  // Delete floor object
  const handleDeleteObject = (id: string) => {
    const obj = floorObjects.find((o) => o.id === id);
    setConfirmDialog({
      message: `Delete "${obj?.label}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await fetch(`/api/floor-objects/${id}`, { method: 'DELETE', credentials: 'include' });
          setFloorObjects((prev) => prev.filter((o) => o.id !== id));
          setSelectedObjectId(null);
        } catch { alert('Failed to delete object.'); }
      },
    });
  };

  // Add combination
  const handleAddCombination = async (tableAId: string, tableBId: string, combinedCapacity: number) => {
    try {
      const res = await fetch('/api/table-combinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableAId, tableBId, combinedCapacity }),
      });
      if (res.ok) {
        const data = await res.json();
        setCombinations((prev) => [...prev, { id: data.combination.id, tableA: { id: data.combination.tableAId ?? data.combination.tableA.id, name: data.combination.tableA.name, capacity: data.combination.tableA.capacity }, tableB: { id: data.combination.tableBId ?? data.combination.tableB.id, name: data.combination.tableB.name, capacity: data.combination.tableB.capacity }, combinedCapacity: data.combination.combinedCapacity }]);
      } else { alert('Failed to add combination.'); }
    } catch { alert('Failed to add combination.'); }
  };

  // Delete combination
  const handleDeleteCombination = async (id: string) => {
    try {
      await fetch(`/api/table-combinations/${id}`, { method: 'DELETE', credentials: 'include' });
      setCombinations((prev) => prev.filter((c) => c.id !== id));
    } catch { alert('Failed to delete combination.'); }
  };

  // Add table group
  const handleAddGroup = async (tableIds: string[]) => {
    try {
      const res = await fetch('/api/table-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableIds }),
      });
      if (res.ok) {
        const data = await res.json();
        const g = data.group;
        setTableGroups((prev) => [...prev, {
          id: g.id, name: g.name, combinedCapacity: g.combinedCapacity,
          tables: g.groupMembers.map((m: any) => ({ id: m.table.id, name: m.table.name, capacity: m.table.capacity, x: m.table.x, y: m.table.y })),
        }]);
      } else { alert('Failed to create group.'); }
    } catch { alert('Failed to create group.'); }
  };

  // Delete table group
  const handleDeleteGroup = async (id: string) => {
    try {
      await fetch(`/api/table-groups/${id}`, { method: 'DELETE', credentials: 'include' });
      setTableGroups((prev) => prev.filter((g) => g.id !== id));
    } catch { alert('Failed to delete group.'); }
  };

  // Add table
  const handleAddTable = async (shape: 'square' | 'booth') => {
    const defaults = { square: { w: 60, h: 60, cap: 4 }, booth: { w: 90, h: 60, cap: 2 } }[shape];
    const nextNum = tables.length + 1;
    const name = `T${nextNum}`;
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, shape, capacity: defaults.cap, minCapacity: 1, area: 'indoor', x: containerWidth / 2 / store.zoom - defaults.w / 2, y: 300 - defaults.h / 2, width: defaults.w, height: defaults.h, rotation: 0 }),
      });
      if (res.ok) {
        const data = await res.json();
        const newTable = { ...data.table, rotation: data.table.rotation ?? 0, activeReservation: null };
        setTables((prev) => [...prev, newTable]);
        setSelectedTableId(data.table.id);
        setHasChanges(true);
      }
    } catch { alert('Failed to add table.'); }
  };

  // Add floor object
  const handleAddObject = async (type: string) => {
    const preset = OBJECT_PRESETS[type] || OBJECT_PRESETS.custom;
    try {
      const res = await fetch('/api/floor-objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, label: preset.label, x: containerWidth / 2 / store.zoom - preset.width / 2, y: 300 - preset.height / 2, width: preset.width, height: preset.height, color: preset.color, opacity: 0.3, zIndex: 0 }),
      });
      if (res.ok) {
        const data = await res.json();
        setFloorObjects((prev) => [...prev, data.object]);
        setSelectedObjectId(data.object.id);
        setHasChanges(true);
      }
    } catch { alert('Failed to add object.'); }
  };

  // Keyboard delete
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!store.isEditMode) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedTableId || selectedObjectId)) {
        e.preventDefault();
        if (selectedTableId) handleDeleteTable(selectedTableId);
        else if (selectedObjectId) handleDeleteObject(selectedObjectId);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [store.isEditMode, selectedTableId, selectedObjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage() || e.target.getClassName() === 'Line') {
      setSelectedTableId(null);
      setSelectedObjectId(null);
    }
  };

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedObject = floorObjects.find((o) => o.id === selectedObjectId) ?? null;
  const canvasHeight = 600;

  if (!mounted) return <div className="h-[600px] bg-slate-50 rounded-lg animate-pulse" />;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Edit Mode Toggle */}
        <Button
          onClick={handleToggleEdit}
          variant={store.isEditMode ? 'default' : 'outline'}
          size="sm"
        >
          {store.isEditMode ? '✏️ Editing' : '👁 View'}
        </Button>

        {store.isEditMode && (
          <>
            <Button onClick={handleSave} disabled={isSaving || !hasChanges} size="sm">{isSaving ? 'Saving…' : 'Save Layout'}</Button>
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={!hasChanges}>Undo</Button>

            {/* Add Table dropdown */}
            <div className="relative group">
              <Button variant="outline" size="sm">+ Table ▾</Button>
              <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg hidden group-hover:block z-10 min-w-[120px]">
                {(['square', 'booth'] as const).map((s) => (
                  <button key={s} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 capitalize" onClick={() => handleAddTable(s)}>{s}</button>
                ))}
              </div>
            </div>

            {/* Add Object dropdown */}
            <div className="relative group">
              <Button variant="outline" size="sm">+ Object ▾</Button>
              <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg hidden group-hover:block z-10 min-w-[120px]">
                {Object.keys(OBJECT_PRESETS).map((type) => (
                  <button key={type} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 capitalize" onClick={() => handleAddObject(type)}>{OBJECT_PRESETS[type].label}</button>
                ))}
              </div>
            </div>

            {hasChanges && <span className="text-xs text-amber-600 font-medium">● Unsaved</span>}
          </>
        )}

        <Button variant="outline" size="sm" onClick={() => setShowFindTable(!showFindTable)}>🔍 Find Table</Button>

        {/* Live/Preview toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant={store.viewMode === 'live' ? 'default' : 'outline'}
            size="sm"
            onClick={() => store.setViewMode('live')}
          >
            Live
          </Button>
          <Button
            variant={store.viewMode === 'preview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => store.setViewMode('preview')}
          >
            Preview
          </Button>
        </div>

        {/* Time picker (only in preview mode) */}
        {store.viewMode === 'preview' && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={format(store.selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => store.setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
              className="h-8 rounded-md border border-input px-2 text-sm"
            />
            <input
              type="time"
              value={store.selectedTime}
              onChange={(e) => store.setSelectedTime(e.target.value)}
              className="h-8 rounded-md border border-input px-2 text-sm"
            />
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center gap-1 ml-auto">
          <Button variant="outline" size="sm" onClick={store.zoomOut}>−</Button>
          <span className="text-sm w-12 text-center">{Math.round(store.zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={store.zoomIn}>+</Button>
          <Button variant="ghost" size="sm" onClick={() => store.setZoom(1)}>Reset</Button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs">
          {(['available', 'reserved', 'occupied'] as TableStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_COLORS[s].stroke }} />
              <span className="capitalize">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas + Detail Panel */}
      <div className="flex border rounded-lg overflow-hidden bg-white relative" style={{ height: canvasHeight }}>
        {/* Mode badge */}
        <div className={`absolute top-2 right-2 z-10 text-xs px-2 py-0.5 rounded ${store.isEditMode ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
          {store.isEditMode ? 'EDITING' : 'VIEWING'}
        </div>

        {/* Find Table panel */}
        {showFindTable && (
          <FindTablePanel
            onHighlight={setHighlightedIds}
            onClose={() => { setShowFindTable(false); setHighlightedIds([]); }}
          />
        )}

        {/* Konva Canvas */}
        <div ref={containerRef} className="flex-1 overflow-hidden">
          <Stage
            width={containerWidth}
            height={canvasHeight}
            scaleX={store.zoom}
            scaleY={store.zoom}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onTouchEnd={() => { lastDist.current = null; }}
            onTouchMove={(e: any) => {
              const t1 = e.evt.touches[0];
              const t2 = e.evt.touches[1];
              if (!t1 || !t2) return;
              e.evt.preventDefault();
              const dist = Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2);
              if (lastDist.current !== null) {
                store.setZoom(Math.max(0.2, Math.min(3, store.zoom * (dist / lastDist.current))));
              }
              lastDist.current = dist;
            }}
          >
            <Layer>
              <GridBackground width={containerWidth / store.zoom} height={canvasHeight / store.zoom} />

              {/* Floor objects behind tables (zIndex 0) */}
              {floorObjects.filter((o) => o.zIndex === 0).map((obj) => (
                <FloorObjectShape
                  key={obj.id}
                  ref={(el) => { if (el) objectRefs.current.set(obj.id, el); }}
                  obj={obj}
                  isSelected={selectedObjectId === obj.id}
                  isEditMode={store.isEditMode}
                  onSelect={() => { setSelectedObjectId(obj.id); setSelectedTableId(null); }}
                  onDragEnd={handleObjectDragEnd}
                  onTransformEnd={handleObjectTransformEnd}
                />
              ))}

              {/* Tables */}
              {tables.map((table) => (
                <TransformableTable
                  key={table.id}
                  ref={(el) => { if (el) tableRefs.current.set(table.id, el); }}
                  table={table}
                  isSelected={selectedTableId === table.id}
                  isEditMode={store.isEditMode}
                  isHighlighted={highlightedIds.includes(table.id)}
                  isFindTableMode={showFindTable}
                  previewReservations={store.viewMode === 'preview' ? previewReservations : undefined}
                  onSelect={() => { setSelectedTableId(table.id); setSelectedObjectId(null); }}
                  onDragEnd={handleTableDragEnd}
                  onTransformEnd={handleTableTransformEnd}
                />
              ))}

              {/* Floor objects in front of tables (zIndex 1) */}
              {floorObjects.filter((o) => o.zIndex === 1).map((obj) => (
                <FloorObjectShape
                  key={obj.id}
                  ref={(el) => { if (el) objectRefs.current.set(obj.id, el); }}
                  obj={obj}
                  isSelected={selectedObjectId === obj.id}
                  isEditMode={store.isEditMode}
                  onSelect={() => { setSelectedObjectId(obj.id); setSelectedTableId(null); }}
                  onDragEnd={handleObjectDragEnd}
                  onTransformEnd={handleObjectTransformEnd}
                />
              ))}
            </Layer>
          </Stage>
        </div>

        {/* Detail Panel */}
        {(selectedTable || selectedObject) && (
          <DetailPanel
            table={selectedTable}
            floorObj={selectedObject}
            isEditMode={store.isEditMode}
            viewMode={store.viewMode}
            previewReservations={previewReservations}
            onClose={() => { setSelectedTableId(null); setSelectedObjectId(null); }}
            onDeleteTable={handleDeleteTable}
            onDeleteObject={handleDeleteObject}
            onUpdateTableCapacity={handleUpdateCapacity}
            onAddCombination={handleAddCombination}
            onDeleteCombination={handleDeleteCombination}
            combinations={combinations}
            allTables={tables}
            tableGroups={tableGroups}
            onAddGroup={handleAddGroup}
            onDeleteGroup={handleDeleteGroup}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{tables.length} tables</span>
        <span>•</span>
        <span>{tables.filter((t) => getStatus(t, store.viewMode === 'preview' ? previewReservations : undefined) === 'occupied').length} occupied</span>
        <span>•</span>
        <span>{floorObjects.length} objects</span>
        {selectedTableId && <><span>•</span><span className="text-indigo-600">Selected: {selectedTable?.name}</span></>}
        <span className="ml-auto text-xs">Click to select • {store.isEditMode ? 'Drag to move • Corners to resize • Del to delete' : 'Switch to Edit to modify'}</span>
      </div>

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm shadow-xl">
            <p className="text-sm mb-4">{confirmDialog.message}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={confirmDialog.onConfirm}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}