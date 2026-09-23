/**
 * The detail page refreshes proposal statuses from Proposales and reads the
 * content library before it renders, so it can take a moment on a cold cache.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      <div className="mb-8 space-y-2">
        <div className="bg-muted h-4 w-24 animate-pulse rounded" />
        <div className="bg-muted h-7 w-56 animate-pulse rounded" />
        <div className="bg-muted h-4 w-72 animate-pulse rounded" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6">
          <div className="bg-muted/40 h-72 animate-pulse rounded-xl border" />
          <div className="bg-muted/40 h-96 animate-pulse rounded-xl border" />
        </div>
        <div className="bg-muted/40 h-[32rem] animate-pulse rounded-xl border" />
      </div>
    </main>
  );
}
