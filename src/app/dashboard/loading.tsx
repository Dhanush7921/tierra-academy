export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
      <div className="skeleton h-72" />
    </div>
  );
}
