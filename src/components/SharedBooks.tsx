"use client";

import { useEffect, useRef, useState } from "react";
import type { SharedBook } from "@/lib/share";
import { Cover } from "./Cover";
import { Stars } from "./Stars";

/**
 * `owner` is the library owner's name for "Katie's review", or null for neutral wording. `token` is the share
 * link's, for opening a book in the add-book form; `reviews` is whether the link shows reviews.
 */
type Props = { books: SharedBook[]; layout: "grid" | "list"; token: string; accent: string; owner: string | null; reviews: boolean };

const theirReview = (owner: string | null) => (owner ? `${owner}\u2019s review` : "Review");

/**
 * The books on a share page. Each opens a dialog with its details (and the review, when reviews are shown),
 * and a button that opens it in the add-book form, to save to your own library.
 */
export function SharedBooks({ books, layout, token, accent, owner, reviews }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const srcBase = `/s/${token}/c`;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const book = open === null ? null : books[open];

  return (
    <>
      {layout === "grid" ? (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
          {books.map((b, i) => (
            <li key={i}>
              <Wrap onOpen={() => setOpen(i)} className="card flex h-full flex-col overflow-hidden text-center">
                <Cover cover={b.cover} title={b.title} author={b.author} bleed srcBase={srcBase} eager={i < 8} />
                <div className="flex flex-1 flex-col items-center gap-0.5 px-3 pt-3 pb-3 [overflow-wrap:anywhere]">
                  <p className="text-[0.8125rem] leading-snug">{b.title}</p>
                  {b.author && <p className="text-xs text-muted">{b.author}</p>}
                  {b.rating && <Rating value={b.rating} accent={accent} owner={owner} />}
                  {b.review && <p className="mt-auto pt-2 text-[0.6875rem] text-faint">{owner ? `Read ${theirReview(owner)}` : "Read the review"}</p>}
                </div>
              </Wrap>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {books.map((b, i) => (
            <li key={i}>
              <Wrap onOpen={() => setOpen(i)} className="flex gap-4 rounded-md py-4 text-left">
                <div className="w-16 shrink-0">
                  <Cover cover={b.cover} title={b.title} author={b.author} srcBase={srcBase} eager={i < 8} className="rounded-sm" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="display text-lg leading-snug">{b.title}</p>
                  {b.author && <p className="text-sm text-muted [overflow-wrap:anywhere]">{b.author}</p>}
                  {b.rating && <Rating value={b.rating} accent={accent} owner={owner} />}
                  {b.review && <p className="line-clamp-2 pt-1 text-[0.8125rem] text-muted">{b.review}</p>}
                </div>
              </Wrap>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(null)}
        // A click on the backdrop (the dialog element itself, outside its content) closes it.
        onClick={(e) => e.target === e.currentTarget && setOpen(null)}
        aria-labelledby="shared-book-title"
        className="m-auto max-h-[min(90dvh,48rem)] w-[min(92vw,40rem)] overflow-hidden rounded-2xl border border-line bg-card p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        {book && (
          <div className="max-h-[min(90dvh,48rem)] overflow-y-auto p-6 sm:p-8">
            <div className="flex items-start gap-5">
              <div className="w-24 shrink-0 sm:w-32">
                <Cover cover={book.cover} title={book.title} author={book.author} srcBase={srcBase} eager className="rounded-sm" />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 id="shared-book-title" className="display text-2xl leading-tight">
                  {book.title}
                </h2>
                {book.author && <p className="text-sm text-muted">by {book.author}</p>}
                {book.details.additional_authors && <p className="text-xs text-faint">with {book.details.additional_authors}</p>}
                {book.details.series && <p className="text-xs text-muted">{book.details.series}</p>}
                {book.rating && <Rating value={book.rating} accent={accent} owner={owner} size="h-4" />}
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="-mt-2 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <a href={`/books/new?share=${encodeURIComponent(token)}&book=${book.id}`} className="btn btn-primary mt-6 rounded-full px-5">
              Add to my library
            </a>

            {reviews && (
              <section className="mt-7 space-y-2">
                <h3 className="flex items-center gap-2 text-sm">
                  <span className="size-1.5 rounded-full" style={{ background: accent }} aria-hidden />
                  {theirReview(owner)}
                </h3>
                {book.review ? <p className="prose-text text-[0.9375rem] text-ink/90">{book.review}</p> : <p className="text-sm text-faint">No review yet.</p>}
              </section>
            )}

            {book.details.description && (
              <section className="mt-7 space-y-2">
                <h3 className="text-sm text-muted">About the book</h3>
                <p className="prose-text text-muted">{book.details.description}</p>
              </section>
            )}

            {(book.details.publisher || book.details.publish_year || book.details.pages) && (
              <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-line pt-5 text-xs">
                {book.details.publish_year && (
                  <div>
                    <dt className="text-faint">Published</dt>
                    <dd>{book.details.publish_year}</dd>
                  </div>
                )}
                {book.details.pages && (
                  <div>
                    <dt className="text-faint">Pages</dt>
                    <dd>{book.details.pages}</dd>
                  </div>
                )}
                {book.details.publisher && (
                  <div>
                    <dt className="text-faint">Publisher</dt>
                    <dd className="truncate">{book.details.publisher}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

/** A button that opens the book's dialog. */
function Wrap({ onOpen, className, children }: { onOpen: () => void; className: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onOpen} className={`${className} w-full transition hover:border-line-hover focus-visible:outline-2 focus-visible:outline-ink`} aria-haspopup="dialog">
      {children}
    </button>
  );
}

function Rating({ value, accent, owner, size = "h-3" }: { value: number; accent: string; owner: string | null; size?: string }) {
  return <Stars rating={value} fill={accent} className={`mt-1 ${size}`} label={`${owner ?? "Rated"}${owner ? " rated it" : ""} ${value} out of 5`} />;
}
