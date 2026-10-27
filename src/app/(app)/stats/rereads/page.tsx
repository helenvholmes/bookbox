import Link from "next/link";
import { Cover } from "@/components/Cover";
import { Stars } from "@/components/Stars";
import { getRereads } from "@/lib/stats";

export const metadata = { title: "Re-reads" };

/** The books you've read more than once, and when. */
export default async function RereadsPage() {
  const books = await getRereads();
  const extra = books.reduce((n, b) => n + b.years.length - 1, 0);

  return (
    <div className="space-y-8 pb-6">
      <nav>
        <Link href="/stats" className="text-muted hover:text-ink">
          ‹ Stats
        </Link>
      </nav>

      <header className="space-y-2">
        <h1 className="display text-3xl">Re-reads</h1>
        <p className="text-muted">
          {books.length === 0
            ? "Nothing read twice yet. Log a re-read from a book’s page."
            : `${extra} ${extra === 1 ? "re-read" : "re-reads"} of ${books.length} ${books.length === 1 ? "book" : "books"}`}
        </p>
      </header>

      {books.length > 0 && (
        <ul className="card divide-y divide-line">
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/books/${b.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised">
                <span className="w-10 shrink-0">
                  <Cover cover={b.cover} title={b.title} author={b.author} className="rounded-sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{b.title}</span>
                  {b.author && <span className="block truncate text-[0.8125rem] text-muted">{b.author}</span>}
                  <span className="block text-xs text-faint tabular-nums">{b.years.join(" · ")}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[0.8125rem] tabular-nums">{b.years.length}×</span>
                  {b.rating !== null && <Stars rating={b.rating} label={false} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
