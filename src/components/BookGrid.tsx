import Link from "next/link";
import type { BookSummary } from "@/lib/books";
import { ClampedTitle } from "./ClampedTitle";
import { Cover } from "./Cover";
import { Stars } from "./Stars";

/** Oku-style tiles: the cover edge to edge across the top of the card, then title, author (wrapping, never cut off) and stars. */
export function BookGrid({
  books,
  empty = "No books here yet.",
  caption,
}: {
  books: BookSummary[];
  empty?: string;
  /** An extra small line above the title, e.g. "Book 3". */
  caption?: (b: BookSummary) => string | null;
}) {
  if (books.length === 0) return <p className="py-16 text-center text-muted">{empty}</p>;
  return (
    // Columns follow the grid's own width (container queries), so the sidebar doesn't throw them off:
    // 2 on phones, 3 from 28rem, 4 from 42rem, 5 from 56rem.
    <div className="@container">
    <ul className="grid grid-cols-2 gap-6 @md:grid-cols-3 @2xl:grid-cols-4 @2xl:gap-5 @4xl:grid-cols-5 @4xl:gap-6">
      {books.map((b, i) => (
        // Off-screen tiles skip rendering; hundreds of covers are heavy on phones.
        <li key={b.id} className="[contain-intrinsic-size:auto_25rem] [content-visibility:auto]">
          <Link href={`/books/${b.id}`} className="card flex h-full flex-col overflow-hidden text-center transition hover:border-faint">
            <Cover cover={b.cover} title={b.title} author={b.author} eager={i < 8} bleed />
            <div className="flex flex-1 flex-col items-center px-3 pt-3.5 pb-2">
              {caption?.(b) && <p className="mb-0.5 text-[0.6875rem] text-faint">{caption(b)}</p>}
              <ClampedTitle title={b.title} className="text-[0.8125rem] leading-snug" />
              {b.author && <p className="mt-0.5 text-xs text-muted">{b.author}</p>}
              {/* Pinned to the bottom so stars line up across a row, whatever the title length. */}
              <span className="mt-auto pt-2.5">
                <Stars rating={b.rating} />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
    </div>
  );
}
