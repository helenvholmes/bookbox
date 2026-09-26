import Link from "next/link";
import { notFound } from "next/navigation";
import { BookGrid } from "@/components/BookGrid";
import { getSeries } from "@/lib/books";
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
    </div>
  );
}
