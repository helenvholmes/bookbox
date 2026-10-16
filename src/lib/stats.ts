import "server-only";
import { connection } from "next/server";
import { daysBetween, nextDay } from "./dates";
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

/** Your stats, with the reading goal and pages for one year (this year unless you ask for another). */
export async function getStats(year?: number) {
  await connection();
  year ??= new Date().getFullYear();
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
        `SELECT p.id, p.slug, trim(p.first || ' ' || p.last) AS label, count(*) AS count, round(avg(b.rating), 1) AS avg
         FROM recommendations r JOIN people p ON p.id = r.person_id JOIN books b ON b.id = r.book_id
         WHERE r.kind = 'by' AND b.rating IS NOT NULL GROUP BY p.id HAVING count(*) >= 2
         ORDER BY avg DESC, count DESC LIMIT 6`,
      )
      .all()) as (Count & { id: number; slug: string; avg: number })[],
  };
}

export type ReviewBook = {
  id: number;
  title: string;
  author: string;
  cover: string | null;
  rating: number | null;
  pages: number | null;
  /** The year's reads of it: the first start and the last finish, when known. */
  started: string | null;
  finished: string | null;
  /** Read in an earlier year too, or more than once this year. */
  reread: boolean;
};

/**
 * Everything for a year in review (/stats/<year>): the books finished that year, and what can be
 * worked out from them. The month-by-month parts and reading days only count reads with dates.
 */
export async function getYearReview(year: number) {
  await connection();
  const inYear = "SELECT book_id FROM book_reads WHERE year = ?";
  const rows = (await db
    .prepare(
      `SELECT b.id, b.title, b.author, b.cover, b.rating, b.pages, min(r.started_on) AS started, max(r.finished_on) AS finished,
         count(*) > 1 OR EXISTS (SELECT 1 FROM book_reads e WHERE e.book_id = b.id AND e.year < ?) AS reread
       FROM book_reads r JOIN books b ON b.id = r.book_id
       WHERE r.year = ? GROUP BY b.id ORDER BY max(r.finished_on) IS NULL, max(r.finished_on), min(r.id)`,
    )
    .all(year, year)) as (Omit<ReviewBook, "reread"> & { reread: number })[];
  const books: ReviewBook[] = rows.map((r) => ({ ...r, reread: !!r.reread }));

  const spans = (await db
    .prepare("SELECT started_on AS start, finished_on AS end FROM book_reads WHERE year = ? AND started_on IS NOT NULL AND finished_on IS NOT NULL")
    .all(year)) as { start: string; end: string }[];

  // Days with a book on the go, within the year.
  const days = new Set<string>();
  for (const s of spans) {
    for (let d = s.start < `${year}-01-01` ? `${year}-01-01` : s.start; d <= s.end; d = nextDay(d)) days.add(d);
  }
  let streak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...days].sort()) {
    run = prev && nextDay(prev) === d ? run + 1 : 1;
    streak = Math.max(streak, run);
    prev = d;
  }

  const dated = books.filter((b) => b.started && b.finished);
  const fastest = dated.length ? dated.reduce((a, b) => (daysBetween(b.started!, b.finished!) < daysBetween(a.started!, a.finished!) ? b : a)) : null;
  const withPages = books.filter((b) => b.pages);
  const rated = books.filter((b) => b.rating !== null);
  const topRating = Math.max(0, ...rated.map((b) => b.rating!));

  const authors = new Map<string, { count: number; ratings: number[] }>();
  for (const b of books) {
    if (!b.author) continue;
    const a = authors.get(b.author) ?? { count: 0, ratings: [] };
    a.count++;
    if (b.rating !== null) a.ratings.push(b.rating);
    authors.set(b.author, a);
  }

  return {
    year,
    books,
    goal: await getGoal(year),
    pages: withPages.reduce((n, b) => n + b.pages!, 0),
    avgRating: rated.length ? Math.round((rated.reduce((n, b) => n + b.rating!, 0) / rated.length) * 100) / 100 : null,
    rereads: books.filter((b) => b.reread).length,
    favourites: rated.filter((b) => b.rating === topRating).slice(0, 6),
    longest: withPages.length ? withPages.reduce((a, b) => (b.pages! > a.pages! ? b : a)) : null,
    shortest: withPages.length > 1 ? withPages.reduce((a, b) => (b.pages! < a.pages! ? b : a)) : null,
    fastest: fastest && { book: fastest, days: daysBetween(fastest.started!, fastest.finished!) + 1 },
    readingDays: days.size,
    longestStreak: streak,
    perMonth: Array.from({ length: 12 }, (_, i) => books.filter((b) => b.finished?.startsWith(`${year}-${String(i + 1).padStart(2, "0")}`)).length),
    topAuthors: [...authors]
      .filter(([, a]) => a.count > 1)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([label, a]) => ({ label, count: a.count, avg: a.ratings.length ? Math.round((a.ratings.reduce((n, r) => n + r, 0) / a.ratings.length) * 10) / 10 : null })),
    topTags: (await db
      .prepare(
        `SELECT t.id, t.name AS label, count(*) AS count FROM book_tags bt JOIN tags t ON t.id = bt.tag_id
         WHERE bt.book_id IN (${inYear}) GROUP BY t.id ORDER BY count DESC, t.name LIMIT 6`,
      )
      .all(year)) as (Count & { id: number })[],
    recommenders: (await db
      .prepare(
        `SELECT p.id, p.slug, trim(p.first || ' ' || p.last) AS label, count(*) AS count, round(avg(b.rating), 1) AS avg
         FROM recommendations r JOIN people p ON p.id = r.person_id JOIN books b ON b.id = r.book_id
         WHERE r.kind = 'by' AND r.book_id IN (${inYear}) GROUP BY p.id ORDER BY count DESC, avg DESC LIMIT 6`,
      )
      .all(year)) as (Count & { id: number; slug: string; avg: number | null })[],
    abandoned: (await db
      .prepare(
        `SELECT b.id, b.title FROM books b JOIN book_shelves bs ON bs.book_id = b.id JOIN shelves s ON s.id = bs.shelf_id
         WHERE s.name = 'Abandoned' AND b.started_on LIKE ? ORDER BY b.started_on`,
      )
      .all(`${year}-%`)) as { id: number; title: string }[],
  };
}
