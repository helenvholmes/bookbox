import Link from "next/link";
import { Suspense } from "react";
import { BookGrid } from "@/components/BookGrid";
import { Cover } from "@/components/Cover";
import { FilterBar } from "@/components/FilterBar";
import { Greeting } from "@/components/Greeting";
import { ShelfIcon } from "@/components/ShelfIcon";
import { countMissingCovers, getFacets, listBooks, SORTS, type Filters } from "@/lib/books";
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

  const [books, facets, reading, duplicates, missingCovers] = await Promise.all([
    listBooks(filters),
    getFacets(),
    filtered ? Promise.resolve([]) : listBooks({ shelf: "Currently Reading" }),
    countDuplicates(),
    countMissingCovers(),
  ]);

  const shelfCount = (name: string) => facets.shelves.find((s) => s.name === name)?.count ?? 0;
  const thisYear = new Date().getFullYear();
  const readThisYear = facets.years.find((y) => y.year === thisYear)?.count ?? 0;

  // Status tiles, after the neumorphic home screen's "50% charging" grid.
  const tiles = [
    { href: "/?shelf=Currently%20Reading", icon: <ShelfIcon shelf="Currently Reading" />, value: shelfCount("Currently Reading"), label: "reading now" },
    { href: `/?year=${thisYear}`, icon: <ShelfIcon shelf="Read" />, value: readThisYear, label: `read in ${thisYear}` },
    { href: "/?shelf=To%20Read", icon: <ShelfIcon shelf="To Read" />, value: shelfCount("To Read"), label: "to read" },
    { href: "/books/new?scan=1", icon: <ScanIcon />, value: null, label: "Scan a barcode" },
    { href: "/missing-covers", icon: <TileIcon d="M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17" />, value: missingCovers, label: "missing covers" },
    { href: "/duplicates", icon: <TileIcon d="M8 8h11v11H8zM5 16V5h11" />, value: duplicates, label: duplicates === 1 ? "duplicate" : "duplicates" },
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
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {tiles.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="card flex h-full min-h-[5.5rem] flex-col justify-between gap-3 p-3 transition hover:border-faint">
                <span className="text-muted">{t.icon}</span>
                <span className="text-[0.75rem] leading-tight text-muted">
                  {t.value !== null && <span className="block text-ink">{t.value}</span>}
                  {t.label}
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
          <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {reading.map((b) => (
              <li key={b.id} className="w-28 shrink-0 sm:w-32">
                <Link href={`/books/${b.id}`} className="block">
                  <Cover cover={b.cover} title={b.title} author={b.author} eager className="rounded-sm" />
                  <p className="mt-2 line-clamp-2 text-xs leading-snug">{b.title}</p>
                  <p className="line-clamp-1 text-[0.6875rem] text-muted">by {b.author}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Suspense>
        <FilterBar facets={facets} sorts={SORTS} />
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
