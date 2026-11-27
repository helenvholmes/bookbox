import "server-only";
import { connection } from "next/server";
import { db } from "./db";
import type { ReadingFormat } from "./sync-ops";

/** A day you said you read a book. */
export type ReadingDay = { bookId: number; title: string; author: string; cover: string | null; day: string; format: ReadingFormat; minutes: number };

/** A book offered when logging a day, with the format it's most likely read in. */
export type LogChoice = { bookId: number; title: string; author: string; cover: string | null; format: ReadingFormat; current: boolean };

/** Every day you logged reading, oldest first. Only these are on the calendar. */
export async function readingDays(): Promise<ReadingDay[]> {
  await connection();
  return (await db
    .prepare(
      `SELECT b.id AS bookId, b.title, b.author, b.cover, d.day, d.format, d.minutes
       FROM reading_days d JOIN books b ON b.id = d.book_id
       ORDER BY d.day, b.title`,
    )
    .all()) as ReadingDay[];
}

/**
 * The books you'd log a day for: Currently Reading (most recently started first), then the others
 * logged in the last couple of months. Each suggests the format you logged it in last, or digital
 * for a Kindle or Libby book.
 */
export async function logChoices(): Promise<LogChoice[]> {
  await connection();
  const rows = (await db
    .prepare(
      `SELECT b.id AS bookId, b.title, b.author, b.cover,
         coalesce(
           (SELECT d.format FROM reading_days d WHERE d.book_id = b.id ORDER BY d.day DESC LIMIT 1),
           CASE WHEN b.on_kindle = 1 OR EXISTS (SELECT 1 FROM libby_titles lt WHERE lt.book_id = b.id) THEN 'digital' ELSE 'physical' END
         ) AS format,
         EXISTS (SELECT 1 FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id AND s.name = 'Currently Reading') AS current,
         (SELECT max(d.day) FROM reading_days d WHERE d.book_id = b.id) AS lastLogged
       FROM books b
       WHERE EXISTS (SELECT 1 FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id AND s.name = 'Currently Reading')
          OR EXISTS (SELECT 1 FROM reading_days d WHERE d.book_id = b.id AND d.day >= date('now', '-60 days'))
       ORDER BY current DESC, coalesce(b.started_on, '') DESC, lastLogged DESC, b.title`,
    )
    .all()) as (Omit<LogChoice, "current"> & { current: number })[];
  return rows.map(({ bookId, title, author, cover, format, current }) => ({ bookId, title, author, cover, format, current: current === 1 }));
}
