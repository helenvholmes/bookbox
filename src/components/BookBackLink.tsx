"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { lastPlaceOutside, scrollBackOnArrival } from "@/lib/history";

const noSubscribe = () => () => {};

/**
 * A book page's back arrow: to the page you were on before the book (a shelf, a list, a search),
 * scrolled to where you were, like after deleting it. The library when there's none, as on a page
 * opened from a link or after a reload, and on the server.
 */
export function BookBackLink({ bookId }: { bookId: number }) {
  const href = useSyncExternalStore(
    noSubscribe,
    () => lastPlaceOutside(`/books/${bookId}`) ?? "/library",
    () => "/library",
  );
  return (
    <Link
      href={href}
      transitionTypes={["nav-back"]}
      onClick={() => scrollBackOnArrival(href)}
      aria-label={href === "/library" ? "Back to library" : "Back"}
      className="flex size-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 12H5m6-6-6 6 6 6" />
      </svg>
    </Link>
  );
}
