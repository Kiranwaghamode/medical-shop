import { Skeleton } from "@/components/ui/skeleton";

// Shown inside the app frame (sidebar + header stay visible) while a page loads,
// e.g. while the free-tier database wakes up.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
