import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Cover } from "@/components/Cover";
import { ExpandableText } from "@/components/ExpandableText";
import { ProgressCard } from "@/components/ProgressCard";
import { ReadsCard } from "@/components/ReadsCard";
import { BookStatus, RatingPicker } from "@/components/BookStatus";
import { BookTexts } from "@/components/BookTexts";
import { STATUS_SHELVES } from "@/components/ShelfIcon";
import { getBook, type PersonLink } from "@/lib/books";

async function load(params: Promise<{ id: string }>) {
  const { id } = await params;
  const book = Number(id) ? await getBook(Number(id)) : null;
  if (!book) notFound();
  return book;
}

export async function generateMetadata(props: PageProps<"/books/[id]">): Promise<Metadata> {
  const book = await load(props.params);
  return { title: book.title };
}

export default async function BookPage(props: PageProps<"/books/[id]">) {
  const book = await load(props.params);
  const otherShelves = book.shelves.filter((s) => !(STATUS_SHELVES as readonly string[]).includes(s));

  const details = [
    book.pages && ["Pages", String(book.pages)],
    book.publish_year && ["Released", String(book.publish_year)],
    book.publisher && ["Publisher", book.publisher],
    book.isbn13 && ["ISBN", book.isbn13],
  ].filter(Boolean) as [string, string][];

  return (
    <article className="pb-8">
      <nav className="flex items-center justify-between">
        <Link href="/" aria-label="Back to library" className="flex size-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5m6-6-6 6 6 6" />
          </svg>
        </Link>
        <Link href={`/books/${book.id}/edit`} className="btn rounded-full px-4">
          Edit
        </Link>
      </nav>

      {/* Title and status on the left, cover on the right. */}
      <header className="mt-6 grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-x-5 sm:grid-cols-[minmax(0,1fr)_9rem] md:mt-10 md:grid-cols-[minmax(0,1fr)_11rem] md:gap-x-12">
        <div className="md:pt-8">
          <h1 className="display text-[1.75rem] leading-tight md:text-4xl">{book.title}</h1>
          {book.author && (
            <p className="mt-1.5 text-sm text-muted">
              by{" "}
              <Link href={`/?q=${encodeURIComponent(book.author)}`} className="hover:text-ink">
                {book.author}
              </Link>
            </p>
          )}
          {book.author_original && (
            <p className="text-sm text-faint" lang="und">
              {book.author_original}
            </p>
          )}
          {book.additional_authors && <p className="text-xs text-faint">with {book.additional_authors}</p>}
          {book.series && (
            <p className="mt-1 text-xs text-muted">
              {book.series.position !== null ? `Book ${book.series.position} of ` : "Part of "}
              <Link href={`/series/${book.series.id}`} className="text-ink hover:underline">
                {book.series.name}
              </Link>
            </p>
          )}
          {book.borrowed && <BorrowedNote library={book.library} due={book.due_date} />}
        </div>
        <div className="md:row-span-2">
          <Cover cover={book.cover} title={book.title} author={book.author} eager className="rounded-sm" />
        </div>

        {/* Full width under the title and cover on phones; beside the cover on desktop. */}
        <BookStatus bookId={book.id} shelves={book.shelves} />
      </header>

      <div className="mt-10 grid gap-10 border-t border-line pt-8 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-9">
          <BookTexts bookId={book.id} review={book.review} quotes={book.quotes} spoiler={book.spoiler} privateNotes={book.private_notes} />
          <TextSection title="Description" text={book.description} />

          {details.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">Details</h2>
              <dl className="grid grid-cols-[6.5rem_1fr] gap-y-2.5 text-[0.8125rem]">
                {details.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/books/${book.id}/edit`} className="btn">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Edit details
            </Link>
            {book.ol_work && (
              <a className="btn" href={`https://openlibrary.org/works/${book.ol_work}`} target="_blank" rel="noreferrer">
                OpenLibrary ↗
              </a>
            )}
          </div>
        </div>

        <aside className="space-y-8">
          <section className="space-y-3">
            <h2 className="section-title">Rating</h2>
            <div className="card space-y-3 p-4">
              <RatingPicker bookId={book.id} rating={book.rating} />
              {(book.tags.length > 0 || otherShelves.length > 0 || book.owned || book.on_kindle) && (
                <div className="flex flex-wrap gap-1.5">
                  {book.tags.map((t) => (
                    <Link key={t.id} href={`/?tag=${t.id}`} className="chip hover:text-ink">
                      {t.name}
                    </Link>
                  ))}
                  {otherShelves.map((s) => (
                    <Link key={s} href={`/?shelf=${encodeURIComponent(s)}`} className="chip hover:text-ink">
                      {s}
                    </Link>
                  ))}
                  {book.owned && <span className="chip">Owned</span>}
                  {book.on_kindle && <span className="chip">Kindle</span>}
                </div>
              )}
            </div>
          </section>

          <ProgressCard
            bookId={book.id}
            pages={book.pages}
            onKindle={book.on_kindle}
            shelves={book.shelves}
            reads={book.reads}
            progress={book.progress_detail}
            spotify={book.spotify && { name: book.spotify.name }}
          />
          <ReadsCard bookId={book.id} reads={book.reads} shelves={book.shelves} />

          {book.recommendedBy.length > 0 && <PeopleCard title="Recommended by" people={book.recommendedBy} />}
          {book.recommendedFor.length > 0 && <PeopleCard title="Recommend to" people={book.recommendedFor} />}
        </aside>
      </div>
    </article>
  );
}

/** Like Oku's "Belongs to 3 collections" card. */
function PeopleCard({ title, people }: { title: string; people: PersonLink[] }) {
  return (
    <section className="space-y-3">
      <h2 className="section-title">{title}</h2>
      <ul className="card space-y-3 p-4">
        {people.map((p) => (
          <li key={p.id}>
            <Link href={`/people/${p.slug}`} className="flex items-center gap-2.5 text-[0.8125rem] hover:text-ink">
              <Avatar id={p.id} name={p.name} />
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TextSection({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <section className="space-y-3">
      <h2 className="section-title">{title}</h2>
      <ExpandableText text={text} />
    </section>
  );
}

function BorrowedNote({ library, due }: { library: string; due: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!due && due < today;
  const dueText = due ? new Date(`${due}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <p className={`mt-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${overdue ? "border-danger/40 text-danger" : "border-line text-muted"}`}>
      Borrowed{library ? ` from ${library}` : " from the library"}
      {dueText && <span>· {overdue ? `overdue since ${dueText}` : `due ${dueText}`}</span>}
    </p>
  );
}
