import { db } from "@/lib/db";

// GET /export/books.csv  every book, one row each, with everything BookBox knows about it.
export async function GET() {
  const rows = (await db
    .prepare(
      `SELECT b.*,
         (SELECT group_concat(year, '; ') FROM (SELECT year FROM book_reads WHERE book_id = b.id ORDER BY year DESC, id DESC)) AS reads,
         (SELECT count(*) FROM book_reads WHERE book_id = b.id) AS times_read,
         (SELECT group_concat(coalesce(started_on, '?') || ' to ' || coalesce(finished_on, '?'), '; ') FROM (SELECT started_on, finished_on FROM book_reads
            WHERE book_id = b.id AND (started_on IS NOT NULL OR finished_on IS NOT NULL) ORDER BY year DESC, id DESC)) AS read_dates,
         (SELECT trim(p.first || ' ' || p.last) || ' since ' || l.lent_on FROM loans l JOIN people p ON p.id = l.person_id
            WHERE l.book_id = b.id AND l.returned_on IS NULL ORDER BY l.id DESC LIMIT 1) AS lent_to,
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
    ["Read Dates", (r) => r.read_dates],
    ["Started Reading", (r) => r.started_on],
    ["Bookshelves", (r) => r.shelves],
    ["Tags", (r) => r.tags],
    ["Series", (r) => r.series],
    ["Series #", (r) => r.series_position],
    ["Recommended By", (r) => r.recommended_by],
    ["Recommended For", (r) => r.recommended_for],
    ["Owned", (r) => yes(r.owned)],
    ["Lent To", (r) => r.lent_to],
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
    let s = v === null || v === undefined ? "" : String(v);
    // Text starting like a formula would run as one in Excel or Sheets, and titles and descriptions
    // can come from OpenLibrary, which anyone can edit. A leading apostrophe keeps it text.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
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
