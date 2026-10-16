/**
 * The cover of the book you just tapped, handed from the grid to the book's page. Book pages show a
 * loading skeleton first, which would otherwise have no cover for the tapped one to fly to: the
 * skeleton shows this one in its place, so the cover moves straight to where it ends up and stays
 * put while the page loads. Browser-only; it starts empty on every load.
 */

/** The view-transition-name the moving cover carries on each page it passes through. */
export const COVER_NAME = "book-cover";

export type PendingCover = { id: string; cover: string | null; title: string; author: string };

let pending: PendingCover | null = null;

export function setPendingCover(p: PendingCover) {
  pending = p;
}

/** The tapped book's cover, if it's the book with this id. */
export function pendingCover(id: string | undefined): PendingCover | null {
  return id && pending?.id === id ? pending : null;
}
