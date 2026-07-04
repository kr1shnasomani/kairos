import { cn } from "@/lib/utils";

/** Low-fatigue loading placeholder. Pulse on the surface-2 tone (both themes). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden="true" />;
}

/** Page-level skeleton matching the standard content container (header + list rows). */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
