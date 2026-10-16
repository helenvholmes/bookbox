"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, ViewTransition } from "react";
import { COVER_NAME, setPendingCover } from "@/lib/cover-handoff";

const DIRECTIONS = { "nav-forward": "page", "nav-back": "page", default: "page" };

let lifted: HTMLElement | null = null;

/**
 * Smooth page changes (see the "Page transitions" rules in globals.css), using the browser's View
 * Transitions through React's <ViewTransition>.
 *
 * React only animates when a <ViewTransition> changes, and the layout around the pages never does,
 * so this keeps a tiny marker keyed by the page's address: each new page swaps it, and the swap
 * starts a transition for the whole screen. Changes within a page (a status, a sync) leave the
 * marker alone and don't animate. Links can tag the direction with transitionTypes
 * ("nav-forward" into a book, "nav-back" out of it); untagged ones crossfade.
 *
 * It also lifts the cover of a book you tap in a grid (see src/lib/cover-handoff.ts) so it can fly
 * to the book's page.
 */
export function PageMotion() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    // Capture phase: before the link starts the navigation.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-cover-handoff]");
      const id = link?.pathname.match(/^\/books\/(\d+)$/)?.[1];
      const frame = link?.querySelector<HTMLElement>("[data-cover]");
      if (!link || !id || !frame) return;
      // Only one element may carry the name at a time, or the browser skips the transition.
      lifted?.style.removeProperty("view-transition-name");
      frame.style.setProperty("view-transition-name", COVER_NAME);
      lifted = frame;
      setPendingCover({ id, cover: link.dataset.coverHandoff || null, title: link.dataset.title ?? "", author: link.dataset.author ?? "" });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <ViewTransition key={`${pathname}?${search}`} enter={DIRECTIONS} exit={DIRECTIONS} default="none">
      {/* In view (React skips transitions for boundaries it can't see), but invisible. */}
      <span aria-hidden className="pointer-events-none fixed top-0 left-0 size-px opacity-0" />
    </ViewTransition>
  );
}
