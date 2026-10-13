import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookGrid } from "@/components/BookGrid";
import { SeriesSuggestions } from "@/components/SeriesSuggestions";
import { getSeries } from "@/lib/books";
import { HardcoverError, hardcoverSeries, hardcoverToken, missingFromLibrary } from "@/lib/hardcover";
import { renameSeriesAction } from "../actions";

export default async function SeriesDetailPage(props: PageProps<"/series/[id]">) {
  const { id } = await props.params;
  const data = await getSeries(Number(id));
  if (!data) notFound();
  const { series, books } = data;
  const position = new Map(books.map((b) => [b.id, b.position]));
  const read = books.filter((b) => b.readCount > 0).length;

  return (
    <div className="space-y-8 pb-6 md:space-y-10">
      <Link href="/series" className="block w-fit text-muted hover:text-ink">
        ‹ Series
      </Link>
      <header>
        <h1 className="display text-3xl">{series.name}</h1>
        <p className="mt-1 text-muted">
          {books.length} {books.length === 1 ? "book" : "books"} · {read} read
        </p>
      </header>
      <details className="group w-fit">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-ink">Rename series</summary>
        <form action={renameSeriesAction} className="mt-2 flex gap-2">
          <input type="hidden" name="id" value={series.id} />
          <input name="name" required defaultValue={series.name} aria-label="Series name" className="field w-72 text-sm" />
          <button className="btn rounded-full px-4">Save</button>
        </form>
      </details>
      <BookGrid books={books} caption={(b) => (position.get(b.id) != null ? `Book ${position.get(b.id)}` : null)} />
      <Suspense fallback={<p className="text-sm text-muted">Looking up the rest of the series on Hardcover…</p>}>
        <RestOfSeries seriesId={series.id} positions={books.map((b) => b.position)} />
      </Suspense>
    </div>
  );
}

/** The books in the series you don't have yet, from Hardcover. Streams in after the page so a slow lookup doesn't hold it up. */
async function RestOfSeries({ seriesId, positions }: { seriesId: number; positions: (number | null)[] }) {
  if (!(await hardcoverToken())) {
    return (
      <p className="text-sm text-muted">
        To see the books in this series you don&rsquo;t have yet,{" "}
        <Link href="/settings#hardcover" className="text-ink underline">
          add a Hardcover token in Settings
        </Link>
        .
      </p>
    );
  }

  let found: Awaited<ReturnType<typeof hardcoverSeries>>;
  try {
    found = await hardcoverSeries(seriesId);
  } catch (e) {
    return <p className="text-sm text-danger">{e instanceof HardcoverError ? e.message : "Couldn’t reach Hardcover just now."}</p>;
  }
  if (!found) return null; // Hardcover doesn't have this series: just your books.
  const missing = await missingFromLibrary(found.books, positions);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Not in your library</h2>
        <a href={found.url} target="_blank" rel="noreferrer" className="text-xs text-faint hover:text-muted">
          The series on Hardcover ↗
        </a>
      </div>
      {missing.length ? (
        <SeriesSuggestions seriesId={seriesId} books={missing} />
      ) : (
        <p className="text-sm text-muted">You have every book in the series.</p>
      )}
    </section>
  );
}
