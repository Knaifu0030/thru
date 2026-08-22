/** Loading placeholders shaped like the content they stand in for. */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.05] ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-raised p-5">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-8" />
      </div>
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <Skeleton className="mt-5 h-3 w-40" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-4 py-3.5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-5 w-14" />
      <Skeleton className="h-3.5 flex-1" />
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="rounded-2xl border border-white/10 bg-raised p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-20" />
    </div>
  );
}
