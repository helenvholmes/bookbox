import "server-only";
import { connection } from "next/server";
import { db } from "./db";

export async function getGoal(year: number): Promise<number | null> {
  return ((await db.prepare("SELECT target FROM goals WHERE year = ?").get(year)) as { target: number } | undefined)?.target ?? null;
}

export async function setGoal(year: number, target: number | null) {
  if (!target) (await db.prepare("DELETE FROM goals WHERE year = ?").run(year));
  else (await db.prepare("INSERT INTO goals (year, target) VALUES (?, ?) ON CONFLICT(year) DO UPDATE SET target = excluded.target").run(year, target));
}

/** Books finished in a year (re-reads of the same book in one year count once). */
export async function booksReadIn(year: number): Promise<number> {
  return ((await db.prepare("SELECT count(DISTINCT book_id) AS n FROM book_reads WHERE year = ?").get(year)) as { n: number }).n;
}

type Count = { label: string; count: number };

export async function getStats() {
  await connection();
  const year = new Date().getFullYear();
  const n = async (sql: string, ...params: (string | number)[]) => ((await db.prepare(sql).get(...params)) as { n: number | null }).n ?? 0;

  const perYear = (await db
    .prepare(
      `SELECT r.year, count(DISTINCT r.book_id) AS books, count(*) AS reads,
         coalesce(sum(b.pages), 0) AS pages
       FROM book_reads r JOIN books b ON b.id = r.book_id GROUP BY r.year ORDER BY r.year`,
    )
    .all()) as { year: number; books: number; reads: number; pages: number }[];

  const ratings = await Promise.all([1, 2, 3, 4, 5].map(async (r) => ({ rating: r, count: await n("SELECT count(*) AS n FROM books WHERE rating = ?", r) })));

  return {
    year,
    goal: await getGoal(year),
    readThisYear: await booksReadIn(year),
    totals: {
      books: await n("SELECT count(*) AS n FROM books"),
      read: await n("SELECT count(DISTINCT book_id) AS n FROM book_reads"),
      rereads: await n("SELECT count(*) - count(DISTINCT book_id) AS n FROM book_reads"),
      avgRating: ((await db.prepare("SELECT round(avg(rating), 2) AS n FROM books WHERE rating IS NOT NULL").get()) as { n: number | null }).n,
      pagesThisYear: await n("SELECT coalesce(sum(b.pages), 0) AS n FROM books b WHERE b.id IN (SELECT book_id FROM book_reads WHERE year = ?)", year),
      abandoned: await n("SELECT count(*) AS n FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE s.name = 'Abandoned'"),
    },
    perYear,
    ratings,
    topTags: (await db
      .prepare(
        `SELECT t.name AS label, count(*) AS count FROM book_tags bt JOIN tags t ON t.id = bt.tag_id
         GROUP BY t.id ORDER BY count DESC, t.name LIMIT 8`,
      )
      .all()) as Count[],
    topAuthors: (await db
      .prepare(
        `SELECT author AS label, count(*) AS count, round(avg(rating), 1) AS avg FROM books
         WHERE author != '' GROUP BY author HAVING count(*) > 1 ORDER BY count DESC, avg DESC LIMIT 8`,
      )
      .all()) as (Count & { avg: number | null })[],
    // Whose recommendations you end up rating highest.
    recommenders: (await db
      .prepare(
        `SELECT p.id, trim(p.first || ' ' || p.last) AS label, count(*) AS count, round(avg(b.rating), 1) AS avg
         FROM recommendations r JOIN people p ON p.id = r.person_id JOIN books b ON b.id = r.book_id
         WHERE r.kind = 'by' AND b.rating IS NOT NULL GROUP BY p.id HAVING count(*) >= 2
         ORDER BY avg DESC, count DESC LIMIT 6`,
      )
      .all()) as (Count & { id: number; avg: number })[],
  };
}
