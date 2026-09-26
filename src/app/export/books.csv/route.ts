import { db } from "@/lib/db";

// GET /export/books.csv  every book, one row each, with everything BookBox knows about it.
export async function GET() {
  const rows = (await db
    .prepare(
      `SELECT b.*,
         (SELECT group_concat(year, '; ') FROM (SELECT year FROM book_reads WHERE book_id = b.id ORDER BY year DESC, id DESC)) AS reads,
         (SELECT count(*) FROM book_reads WHERE book_id = b.id) AS times_read,
         (SELECT group_concat(s.name, '; ') FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = b.id) AS shelves,
         (SELECT group_concat(t.name, '; ') FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = b.id) AS tags,
         (SELECT s.name FROM book_series bs JOIN series s ON s.id = bs.series_id WHERE bs.book_id = b.id) AS series,
         (SELECT position FROM book_series WHERE book_id = b.id) AS series_position,
         (SELECT group_concat(trim(p.first || ' ' || p.last), '; ') FROM recommendations r JOIN people p ON p.id = r.person_id
            WHERE r.book_id = b.id AND r.kind = 'by') AS recommended_by,
         (SELECT group_concat(trim(p.first || ' ' || p.last), '; ') FROM recommendations r JOIN people p ON p.id = r.person_id
            WHERE r.book_id = b.id AND r.kind = 'for') AS recommended_for
       FROM books b ORDER BY b.id`,
    )
    .all());

  const yes = (v: unknown) => (v === 1 ? "yes" : "");
  const columns: [string, (r: Record<string, unknown>) => unknown][] = [
    ["Book Id", (r) => r.id],
    ["Title", (r) => r.title],
    ["Author", (r) => r.author],
    ["Author (last, first)", (r) => r.author_sort],
    ["Author (original script)", (r) => r.author_original],
    ["Additional Authors", (r) => r.additional_authors],
    ["ISBN13", (r) => r.isbn13],
    ["My Rating", (r) => r.rating],
    ["Years Read", (r) => r.reads],
    ["Times Read", (r) => r.times_read],
    ["Bookshelves", (r) => r.shelves],
    ["Tags", (r) => r.tags],
    ["Series", (r) => r.series],
    ["Series #", (r) => r.series_position],
    ["Recommended By", (r) => r.recommended_by],
    ["Recommended For", (r) => r.recommended_for],
    ["Owned", (r) => yes(r.owned)],
    ["On Kindle", (r) => yes(r.on_kindle)],
    ["Borrowed", (r) => yes(r.borrowed)],
    ["Library", (r) => r.library],
    ["Due Date", (r) => r.due_date],
    ["Publisher", (r) => r.publisher],
    ["Published", (r) => r.publish_year],
    ["Pages", (r) => r.pages],
    ["Book Description", (r) => r.description],
    ["My Review", (r) => r.review],
    ["Spoiler", (r) => r.spoiler],
    ["Quotes", (r) => r.quotes],
    ["Private Notes", (r) => r.private_notes],
    ["OpenLibrary Work", (r) => (r.ol_work ? `https://openlibrary.org/works/${r.ol_work}` : "")],
    ["Added", (r) => r.created_at],
  ];

  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(([h]) => cell(h)).join(","), ...rows.map((r) => columns.map(([, get]) => cell(get(r))).join(","))];
  const date = new Date().toISOString().slice(0, 10);

  // The byte-order mark makes Excel open the file as UTF-8 (accents, curly quotes).
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookbox-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
