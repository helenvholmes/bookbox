import "server-only";
import { saveBook, setCover } from "./books";
import { fetchCover, fetchLibbyImage, isUsableImage, saveCover } from "./covers";
import { db } from "./db";
import type { LibbyBook } from "./libby";

/** Adds books from a Libby timeline (see src/lib/libby.ts). Returns each new book's id, for fetching covers. */
export async function importLibbyBooks(books: LibbyBook[]): Promise<{ id: number; isbn13: string | null; coverUrl: string | null }[]> {
  const added: { id: number; isbn13: string | null; coverUrl: string | null }[] = [];
  for (const b of books) {
    const finished = b.status === "Read" ? b.returnedOn : null;
    const borrowed = b.status === "Currently Reading";
    const id = await saveBook(null, {
      title: b.title,
      author: b.author,
      author_original: "",
      additional_authors: "",
      isbn13: b.isbn13,
      rating: null,
      description: "",
      review: "",
      spoiler: "",
      quotes: "",
      private_notes: "",
      on_kindle: false,
      owned: false,
      publisher: b.publisher,
      publish_year: null,
      pages: null,
      ol_work: null,
      ol_edition: null,
      borrowed,
      library: borrowed ? b.library : "",
      due_date: null,
      series_name: "",
      series_position: null,
      years: finished ? [Number(finished.slice(0, 4))] : [],
      shelves: [b.status],
      tags: [],
      recommendedFor: [],
      recommendedBy: [],
    });
    if (finished) await db.prepare("UPDATE book_reads SET finished_on = ? WHERE book_id = ?").run(finished, id);
    if (b.firstSeen) await db.prepare("UPDATE books SET created_at = ? WHERE id = ?").run(`${b.firstSeen} 12:00:00`, id);
    added.push({ id, isbn13: b.isbn13, coverUrl: b.coverUrl });
  }
  return added;
}

/**
 * Covers for imported books: Libby's own image first (it matches the edition you borrowed), then
 * OpenLibrary by ISBN. Returns how many were found.
 */
export async function fetchLibbyCovers(books: { id: number; isbn13: string | null; coverUrl: string | null }[]): Promise<number> {
  let found = 0;
  const queue = [...books];
  const worker = async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      try {
        const candidates = [
          b.coverUrl ? () => fetchLibbyImage(b.coverUrl!) : null,
          b.isbn13 ? () => fetchCover(`https://covers.openlibrary.org/b/isbn/${b.isbn13}-L.jpg?default=false`) : null,
        ];
        for (const get of candidates) {
          const data = get ? await get().catch(() => null) : null;
          if (!data || !(await isUsableImage(data))) continue;
          const name = await saveCover(b.id, data);
          if (!name) continue;
          await setCover(b.id, name);
          found++;
          break;
        }
      } catch {
        // Left for the Missing covers page.
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  return found;
}
