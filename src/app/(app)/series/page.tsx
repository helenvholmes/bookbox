/* eslint-disable @next/next/no-img-element -- covers are resized WebP served from our own route */
import Link from "next/link";
import { CollectionTabs } from "@/components/CollectionTabs";
import { detectSeriesFromTitles, listSeries } from "@/lib/books";
import { applyDetectedSeriesAction } from "./actions";

export const metadata = { title: "Series" };

export default async function SeriesPage() {
  const [series, detected] = await Promise.all([listSeries(), detectSeriesFromTitles()]);
  const detectedNames = [...new Set(detected.map((d) => d.name))];

  return (
    <div className="space-y-8 pb-6">
      <CollectionTabs current="/series" />
      <header>
        <h1 className="display text-3xl">Series</h1>
        <p className="mt-1 text-sm text-muted">Add a book to a series from its edit screen, with its number in the series.</p>
      </header>

      {detected.length > 0 && (
        <form action={applyDetectedSeriesAction} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="min-w-0 text-sm text-muted">
            <span className="text-ink">
              {detected.length} {detected.length === 1 ? "book names" : "books name"} a series in {detected.length === 1 ? "its" : "their"} title
            </span>{" "}
            ({detectedNames.slice(0, 3).join(", ")}
            {detectedNames.length > 3 ? ` and ${detectedNames.length - 3} more` : ""}).
          </p>
          <button className="btn btn-primary shrink-0 rounded-full px-4">Add them to series</button>
        </form>
      )}

      {series.length === 0 ? (
        <p className="py-10 text-center text-muted">No series yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => (
            <li key={s.id}>
              <Link href={`/series/${s.id}`} className="card flex items-center gap-4 p-3 transition hover:border-faint">
                {/* Up to four covers fanned out, like a stack on a shelf. */}
                <span className="relative h-16 w-20 shrink-0">
                  {s.covers.slice(0, 4).map((c, i) => (
                    <span key={i} className="absolute top-0 h-16 w-11 overflow-hidden rounded-sm bg-raised ring-1 ring-paper" style={{ left: i * 10, zIndex: 4 - i }}>
                      {c && <img src={`/covers/${c}`} alt="" loading="lazy" className="size-full object-cover" />}
                    </span>
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{s.name}</span>
                  <span className="text-xs text-muted">
                    {s.count} {s.count === 1 ? "book" : "books"} · {s.read} read
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
