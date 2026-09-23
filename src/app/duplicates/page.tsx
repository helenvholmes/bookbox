import Link from "next/link";
import { Cover } from "@/components/Cover";
import { Stars } from "@/components/Stars";
import { findDuplicates } from "@/lib/duplicates";
import { notDuplicatesAction } from "./actions";

export const metadata = { title: "Duplicates" };

export default async function DuplicatesPage() {
  const groups = await findDuplicates();

  return (
    <div className="space-y-6 pb-6">
      <Link href="/" className="font-medium text-accent">
        ‹ Library
      </Link>
      <header>
        <h1 className="display text-3xl">Possible duplicates</h1>
        <p className="mt-1 text-muted">
          {groups.length === 0
            ? "No duplicates found."
            : `${groups.length} ${groups.length === 1 ? "group" : "groups"} of books that share an ISBN or title.`}
        </p>
      </header>

      {groups.map((g) => (
        <section key={g.books.map((b) => b.id).join("-")} className="space-y-3 card p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="section-title">{g.reason}</span>
            <form action={notDuplicatesAction}>
              {g.books.map((b) => (
                <input key={b.id} type="hidden" name="id" value={b.id} />
              ))}
              <button className="text-sm font-medium text-accent">Not duplicates</button>
            </form>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.books.map((b) => (
              <li key={b.id}>
                <Link href={`/books/${b.id}`} className="flex gap-3">
                  <div className="w-16 shrink-0">
                    <Cover cover={b.cover} title={b.title} author={b.author} />
                  </div>
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="line-clamp-2 leading-snug font-medium">{b.title}</p>
                    <p className="truncate text-muted">{b.author}</p>
                    <Stars rating={b.rating} className="text-xs" />
                    <p className="text-xs text-muted">{[...b.shelves, ...b.years.map((y) => `Read ${y}`)].join(" · ") || "No shelf"}</p>
                    <p className="text-xs text-muted">
                      #{b.id}
                      {b.hasReview && " · has review"}
                      {!b.isbn13 && " · no ISBN"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
