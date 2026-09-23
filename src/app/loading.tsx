/**
 * The list queries the database before it can render, so the shell appears
 * immediately rather than the page hanging blank.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8 space-y-2">
        <div className="bg-muted h-7 w-40 animate-pulse rounded" />
        <div className="bg-muted h-4 w-80 animate-pulse rounded" />
      </div>

      <div className="bg-muted mb-4 h-9 w-full max-w-sm animate-pulse rounded-md" />

      <div className="divide-border overflow-hidden rounded-lg border">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b p-4 last:border-b-0">
            <div className="bg-muted h-4 w-40 animate-pulse rounded" />
            <div className="bg-muted hidden h-4 w-56 animate-pulse rounded md:block" />
            <div className="bg-muted ml-auto h-5 w-16 animate-pulse rounded-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
