import Link from "next/link";
import { Suspense } from "react";
import { BookGrid } from "@/components/BookGrid";
import { FilterBar } from "@/components/FilterBar";
import { Greeting } from "@/components/Greeting";
import { ShelfIcon } from "@/components/ShelfIcon";
import { countMissingCovers, countMissingIsbns, getContextualFacets, getFacets, listBooks, listBorrowed, SORTS, type Filters } from "@/lib/books";
import { getGoal } from "@/lib/stats";
import { countDuplicates } from "@/lib/duplicates";

export default async function LibraryPage(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters: Filters = {
    q: one("q"),
    shelf: one("shelf"),
    year: one("year"),
    tag: one("tag"),
    person: one("person"),
    rating: one("rating"),
    owned: one("owned"),
    sort: one("sort"),
  };
  const filtered = Object.entries(filters).some(([k, v]) => k !== "sort" && v);

  const [books, facets, reading, duplicates, missingCovers, missingIsbns, borrowed] = await Promise.all([
    listBooks(filters),
    getFacets(),
    filtered ? Promise.resolve([]) : listBooks({ shelf: "Currently Reading" }),
    countDuplicates(),
    countMissingCovers(),
    countMissingIsbns(),
    listBorrowed(),
  ]);

  // The tabs and dropdowns count within the other active filters; the tiles above show library totals.
  const filterFacets = filtered ? await getContextualFacets(filters, facets) : facets;

  const shelfCount = (name: string) => facets.shelves.find((s) => s.name === name)?.count ?? 0;
  const thisYear = new Date().getFullYear();
  const readThisYear = facets.years.find((y) => y.year === thisYear)?.count ?? 0;
  const goal = await getGoal(thisYear);
  const nextDue = borrowed.find((b) => b.due_date)?.due_date;

  // Status tiles, after the neumorphic home screen's "50% charging" grid.
  const tiles = [
    { href: "/?shelf=Currently%20Reading", icon: <ShelfIcon shelf="Currently Reading" />, value: shelfCount("Currently Reading"), label: "reading now" },
    goal
      ? { href: "/stats", icon: <ShelfIcon shelf="Read" />, value: `${readThisYear} of ${goal}`, label: `read in ${thisYear}`, progress: Math.min(1, readThisYear / goal) }
      : { href: `/?year=${thisYear}`, icon: <ShelfIcon shelf="Read" />, value: readThisYear, label: `read in ${thisYear}` },
    { href: "/?shelf=To%20Read", icon: <ShelfIcon shelf="To Read" />, value: shelfCount("To Read"), label: "to read" },
    { href: "/books/new?scan=1", icon: <ScanIcon />, value: null, label: "Scan a barcode" },
    ...(missingCovers > 0
      ? [{ href: "/missing-covers", icon: <TileIcon d="M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17" />, value: missingCovers, label: "missing covers" }]
      : []),
    // Clean-up tiles only appear when there's something to clean up.
    ...(duplicates > 0
      ? [{ href: "/duplicates", icon: <TileIcon d="M8 8h11v11H8zM5 16V5h11" />, value: duplicates, label: duplicates === 1 ? "duplicate" : "duplicates" }]
      : []),
    ...(missingIsbns > 0
      ? [{ href: "/missing-isbns", icon: <TileIcon d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12" />, value: missingIsbns, label: "missing ISBNs" }]
      : []),
    ...(borrowed.length > 0
      ? [
          {
            href: "/?owned=borrowed",
            icon: <TileIcon d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />,
            value: borrowed.length,
            label: nextDue ? `borrowed · next due ${new Date(`${nextDue}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "borrowed",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8 pb-4">
      {!filtered && (
        <header className="flex items-start justify-between gap-4 pt-2">
          <Greeting />
          <Link href="/books/new" className="btn shrink-0">
            + Add book
          </Link>
        </header>
      )}

      {!filtered && (
        <ul className="grid grid-cols-3 gap-2 sm:auto-cols-fr sm:grid-flow-col">
          {tiles.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="card flex h-full min-h-[5.5rem] flex-col justify-between gap-3 p-3 transition hover:border-faint">
                <span className="text-muted">{t.icon}</span>
                <span className="text-[0.75rem] leading-tight text-muted">
                  {t.value !== null && <span className="block text-ink">{t.value}</span>}
                  {t.label}
                  {"progress" in t && typeof t.progress === "number" && (
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                      <span className="block h-full rounded-full bg-ink" style={{ width: `${t.progress * 100}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {reading.length > 0 && (
        <section aria-labelledby="reading" className="space-y-3">
          <h2 id="reading" className="section-title">
            Currently reading
          </h2>
          <BookGrid books={reading} />
        </section>
      )}

      <Suspense>
        <FilterBar facets={filterFacets} sorts={SORTS} />
      </Suspense>

      <section className="space-y-3">
        <h2 className="section-title">
          {filtered ? "Results" : "All books"} <span className="count">{books.length}</span>
        </h2>
        <BookGrid books={books} empty={filtered ? "No books match these filters." : "No books yet. Add your first one!"} />
      </section>
    </div>
  );
}

function TileIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function ScanIcon() {
  return <TileIcon d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6" />;
}
