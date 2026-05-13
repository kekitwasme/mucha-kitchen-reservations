export default function SettingsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 bg-slate-200 animate-pulse rounded" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-6 w-32 bg-slate-200 animate-pulse rounded" />
          <div className="h-10 w-full bg-slate-100 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}