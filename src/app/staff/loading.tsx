export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 bg-slate-200 animate-pulse rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-lg" />
        ))}
      </div>
      <div className="h-6 w-32 bg-slate-200 animate-pulse rounded mt-6" />
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-100 animate-pulse rounded" />
        ))}
      </div>
    </div>
  );
}