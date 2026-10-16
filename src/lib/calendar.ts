import "server-only";
import { connection } from "next/server";
import { db } from "./db";

/** A stretch of days a book was being read. `end` is null for a book you're still reading (it runs to today). */
export type ReadingSpan = { bookId: number; title: string; author: string; cover: string | null; start: string; end: string | null };

/**
 * Every read with days, plus the books being read now. A read with only one of its days is a
 * single day. Older reads have only a year, so they aren't on the calendar.
 */
export async function readingSpans(): Promise<ReadingSpan[]> {
  await connection();
  const rows = (await db
    .prepare(
      `SELECT b.id AS bookId, b.title, b.author, b.cover, coalesce(r.started_on, r.finished_on) AS start, coalesce(r.finished_on, r.started_on) AS "end"
       FROM book_reads r JOIN books b ON b.id = r.book_id
       WHERE r.started_on IS NOT NULL OR r.finished_on IS NOT NULL
       UNION ALL
       SELECT b.id, b.title, b.author, b.cover, b.started_on, NULL FROM books b
       WHERE b.started_on IS NOT NULL
         AND EXISTS (SELECT 1 FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id AND s.name = 'Currently Reading')
       ORDER BY start`,
    )
    .all()) as ReadingSpan[];
  return rows;
}
