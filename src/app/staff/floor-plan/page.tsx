'use client';

import dynamic from 'next/dynamic';

const FloorPlanClient = dynamic(
  () => import('./FloorPlanClient'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 mx-auto rounded-lg bg-slate-200 animate-pulse" />
          <p className="text-sm text-slate-500">Loading floor plan...</p>
        </div>
      </div>
    ),
  }
);

export default function FloorPlanPage() {
  return <FloorPlanClient />;
}