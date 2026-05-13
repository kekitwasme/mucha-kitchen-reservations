export default function WalkInsLoading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 bg-slate-200 animate-pulse rounded" />
      <div className="h-10 w-64 bg-slate-100 animate-pulse rounded" />
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-100 animate-pulse rounded" />
        ))}
      </div>
    </div>
  );
}