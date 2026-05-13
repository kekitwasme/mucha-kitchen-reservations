export default function ReservationsLoading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 bg-slate-200 animate-pulse rounded" />
      <div className="flex gap-3">
        <div className="h-10 w-40 bg-slate-200 animate-pulse rounded" />
        <div className="h-10 w-32 bg-slate-200 animate-pulse rounded" />
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 animate-pulse rounded" />
        ))}
      </div>
    </div>
  );
}