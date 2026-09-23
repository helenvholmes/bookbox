import Link from "next/link";
import type { BookSummary } from "@/lib/books";
import { Cover } from "./Cover";
import { Stars } from "./Stars";

/** Oku-style tiles: a bordered square with the cover centred, then title and "by author". */
export function BookGrid({ books, empty = "No books here yet." }: { books: BookSummary[]; empty?: string }) {
  if (books.length === 0) return <p className="py-16 text-center text-muted">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {books.map((b, i) => (
        // Off-screen tiles skip rendering; hundreds of covers are heavy on phones.
        <li key={b.id} className="[contain-intrinsic-size:auto_17rem] [content-visibility:auto]">
          <Link href={`/books/${b.id}`} className="card flex h-full flex-col items-center px-3 pt-5 pb-4 text-center transition hover:border-faint">
            <div className="w-[62%]">
              <Cover cover={b.cover} title={b.title} author={b.author} eager={i < 8} className="rounded-sm" />
            </div>
            <p className="mt-4 line-clamp-2 text-[0.8125rem] leading-snug">{b.title}</p>
            {b.author && <p className="mt-0.5 line-clamp-1 text-xs text-muted">by {b.author}</p>}
            {b.rating && (
              <span className="mt-2.5">
                <Stars rating={b.rating} />
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
