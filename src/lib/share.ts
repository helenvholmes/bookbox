import "server-only";
import crypto from "node:crypto";
import { connection } from "next/server";
import { db } from "./db";

export const ACCENTS = ["#ececed", "#e9b872", "#e58f8f", "#9bc59d", "#8fb8e5", "#b9a3e3"] as const;

export type ShareSettings = {
  token: string | null;
  enabled: boolean;
  list: "for" | "by";
  title: string;
  message: string;
  layout: "grid" | "list";
  show_ratings: boolean;
  show_reviews: boolean;
  accent: string;
};

type Row = Omit<ShareSettings, "enabled" | "show_ratings" | "show_reviews"> & { enabled: number; show_ratings: number; show_reviews: number };

const fromRow = (r: Row): ShareSettings => ({ ...r, enabled: r.enabled === 1, show_ratings: r.show_ratings === 1, show_reviews: r.show_reviews === 1 });

export const defaultTitle = (first: string, list: "for" | "by") => (list === "for" ? `Books for ${first}` : `${first}'s recommendations`);

export async function getShareSettings(personId: number): Promise<ShareSettings> {
  await connection();
  const row = (await db.prepare("SELECT token, enabled, list, title, message, layout, show_ratings, show_reviews, accent FROM share_pages WHERE person_id = ?").get(personId)) as Row | undefined;
  return row
    ? fromRow(row)
    : { token: null, enabled: false, list: "for", title: "", message: "", layout: "grid", show_ratings: true, show_reviews: false, accent: ACCENTS[0] };
}

const newToken = () => crypto.randomBytes(12).toString("base64url");

/** Saves a person's share page, creating its link the first time. Returns the token. */
export async function saveShareSettings(personId: number, s: Omit<ShareSettings, "token">): Promise<string> {
  const existing = (await db.prepare("SELECT token FROM share_pages WHERE person_id = ?").get(personId)) as { token: string } | undefined;
  const token = existing?.token ?? newToken();
  (await db.prepare(
    `INSERT INTO share_pages (person_id, token, enabled, list, title, message, layout, show_ratings, show_reviews, accent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(person_id) DO UPDATE SET enabled = excluded.enabled, list = excluded.list, title = excluded.title,
       message = excluded.message, layout = excluded.layout, show_ratings = excluded.show_ratings,
       show_reviews = excluded.show_reviews, accent = excluded.accent`,
  ).run(personId, token, s.enabled ? 1 : 0, s.list, s.title, s.message, s.layout, s.show_ratings ? 1 : 0, s.show_reviews ? 1 : 0, s.accent));
  return token;
}

/** Replaces the link, so anyone holding the old one loses access. */
export async function regenerateShareToken(personId: number): Promise<string> {
  const token = newToken();
  (await db.prepare("UPDATE share_pages SET token = ? WHERE person_id = ?").run(token, personId));
  return token;
}

export type SharedBook = {
  title: string;
  author: string;
  cover: string | null;
  rating: number | null;
  review: string;
  /** Book details for the review dialog; only filled in when reviews are shown. */
  details: { description: string; publisher: string; publish_year: number | null; pages: number | null; additional_authors: string; series: string | null } | null;
};

/** The public view of a share link: only what the settings allow, and never notes or spoilers. */
export async function getSharedList(token: string) {
  await connection();
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  const row = (await db
    .prepare(
      `SELECT sp.*, p.first FROM share_pages sp JOIN people p ON p.id = sp.person_id
       WHERE sp.token = ? AND sp.enabled = 1`,
    )
    .get(token)) as (Row & { person_id: number; first: string }) | undefined;
  if (!row) return null;
  const settings = fromRow(row);
  const books = (
    (await db
      .prepare(
        `SELECT b.title, b.author, b.cover, b.rating, b.review, b.description, b.publisher, b.publish_year, b.pages, b.additional_authors,
           (SELECT s.name || coalesce(' #' || rtrim(rtrim(bs.position, '0'), '.'), '') FROM book_series bs JOIN series s ON s.id = bs.series_id
              WHERE bs.book_id = b.id) AS series
         FROM books b JOIN recommendations r ON r.book_id = b.id
         WHERE r.person_id = ? AND r.kind = ? ORDER BY b.author_sort COLLATE NOCASE, b.title COLLATE NOCASE`,
      )
      .all(row.person_id, settings.list)) as (Omit<SharedBook, "details"> & NonNullable<SharedBook["details"]>)[]
  ).map((b) => ({
    title: b.title,
    author: b.author,
    cover: b.cover,
    rating: settings.show_ratings ? b.rating : null,
    review: settings.show_reviews ? b.review : "",
    details: settings.show_reviews
      ? { description: b.description, publisher: b.publisher, publish_year: b.publish_year, pages: b.pages, additional_authors: b.additional_authors, series: b.series }
      : null,
  }));
  return { settings, first: row.first, title: settings.title || defaultTitle(row.first, settings.list), books };
}

/** Whether a cover file belongs to a book on this share link (so the public route serves nothing else). */
export async function coverIsShared(token: string, file: string): Promise<boolean> {
  return !!(await db
    .prepare(
      `SELECT 1 FROM share_pages sp JOIN recommendations r ON r.person_id = sp.person_id AND r.kind = sp.list
       JOIN books b ON b.id = r.book_id WHERE sp.token = ? AND sp.enabled = 1 AND b.cover = ?`,
    )
    .get(token, file));
}
