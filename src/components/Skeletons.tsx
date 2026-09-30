/**
 * Placeholders shown the moment a page is opened, while its data loads (each route's loading.tsx
 * picks one). They mirror the real layouts so nothing jumps when the content arrives.
 */

const Bar = ({ className = "" }: { className?: string }) => <div className={`rounded-md bg-raised ${className}`} />;

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-label={label} className="animate-pulse space-y-8 pb-6 motion-reduce:animate-none">
      {children}
    </div>
  );
}

function CardGrid({ count }: { count: number }) {
  return (
    <div className="@container">
      <ul className="grid grid-cols-2 gap-6 @md:grid-cols-3 @2xl:grid-cols-4 @2xl:gap-5 @4xl:grid-cols-5 @4xl:gap-6">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="card overflow-hidden">
            <div className="aspect-[2/3] bg-raised" />
            <div className="flex flex-col items-center gap-2 px-3 pt-3.5 pb-4">
              <Bar className="h-3 w-4/5" />
              <Bar className="h-2.5 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The library: greeting, status tiles, search, and a grid of covers. */
export function LibrarySkeleton() {
  return (
    <Shell label="Loading your library">
      <div className="space-y-3 pt-2">
        <Bar className="h-9 w-56" />
        <Bar className="h-9 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card h-[5.75rem]" />
        ))}
      </div>
      <Bar className="h-11 w-full" />
      <CardGrid count={10} />
    </Shell>
  );
}

/** A book: title and status on the left, cover on the right, then text and the side cards. */
export function BookSkeleton() {
  return (
    <Shell label="Loading book">
      <div className="flex items-center justify-between">
        <div className="size-9 rounded-full bg-raised" />
        <Bar className="h-9 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-x-5 sm:grid-cols-[minmax(0,1fr)_9rem] md:grid-cols-[minmax(0,1fr)_11rem] md:gap-x-12">
        <div className="space-y-3 md:pt-8">
          <Bar className="h-8 w-4/5" />
          <Bar className="h-4 w-2/5" />
          <div className="flex gap-2.5 pt-6">
            {Array.from({ length: 4 }, (_, i) => (
              <Bar key={i} className="h-11 w-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="aspect-[2/3] rounded-sm bg-raised" />
      </div>
      <div className="grid gap-10 border-t border-line pt-8 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-3">
          <Bar className="h-4 w-24" />
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} className={`h-3.5 ${i === 5 ? "w-2/3" : "w-full"}`} />
          ))}
        </div>
        <div className="space-y-6">
          <div className="card h-20" />
          <div className="card h-28" />
        </div>
      </div>
    </Shell>
  );
}

/** A heading over a grid of covers: a person, a tag, a series. */
export function GridSkeleton() {
  return (
    <Shell label="Loading">
      <div className="space-y-3">
        <Bar className="h-4 w-20" />
        <Bar className="h-9 w-64 max-w-full" />
      </div>
      <CardGrid count={10} />
    </Shell>
  );
}

/** A heading over rows: People, Tags, Series, Stats, and the tidy-up pages. */
export function ListSkeleton() {
  return (
    <Shell label="Loading">
      <div className="space-y-3">
        <Bar className="h-9 w-48" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      <div className="card divide-y divide-line">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="size-8 shrink-0 rounded-full bg-raised" />
            <Bar className={`h-3.5 ${["w-2/5", "w-1/2", "w-1/3"][i % 3]}`} />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** A form: adding or editing a book. */
export function FormSkeleton() {
  return (
    <Shell label="Loading">
      <div className="flex items-center justify-between">
        <Bar className="h-4 w-16" />
        <Bar className="h-9 w-20 rounded-full" />
      </div>
      <div className="space-y-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-3.5 w-24" />
            <Bar className="h-11 w-full" />
          </div>
        ))}
      </div>
    </Shell>
  );
}
