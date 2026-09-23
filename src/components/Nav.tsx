"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ShelfIcon, STATUS_SHELVES, shelfLabel } from "./ShelfIcon";

const ICONS = {
  library: "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  add: "M12 5v14M5 12h14",
  people: "M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 9v-1a4 4 0 0 0-3-3.87M15 4.13a3 3 0 0 1 0 5.74",
  tags: "M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9-9-9Zm4.5-4.5h.01",
  covers: "M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17",
  duplicates: "M8 8h11v11H8zM5 16V5h11",
};

function Icon({ d, className = "size-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** A bookmark (the same shape as To Read's) that fills in for the selected year. */
function YearIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z" />
    </svg>
  );
}

type Props = { years: { year: number; count: number }[] };

export function Nav({ years }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname === "/login") return null;

  const onLibrary = pathname === "/";
  const shelf = onLibrary ? params.get("shelf") : null;
  const year = onLibrary ? params.get("year") : null;
  const plainLibrary = onLibrary && !shelf && !year;

  const item = (active: boolean) =>
    `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] transition ${active ? "bg-raised text-ink" : "text-muted hover:text-ink"}`;

  return (
    <>
      {/* Desktop: Oku-style sidebar. */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-[#0e0f11] px-3 py-5 md:flex">
        <Link href="/" className="display flex items-center gap-2 px-2.5 text-xl">
          BookBox
        </Link>
        <nav aria-label="Main" className="space-y-0.5">
          <Link href="/" className={item(plainLibrary || pathname.startsWith("/books/") && pathname !== "/books/new")}>
            <Icon d={ICONS.library} /> Library
          </Link>
          <Link href="/books/new" className={item(pathname === "/books/new")}>
            <Icon d={ICONS.add} /> Add a book
          </Link>
          <Link href="/people" className={item(pathname.startsWith("/people"))}>
            <Icon d={ICONS.people} /> People
          </Link>
          <Link href="/tags" className={item(pathname.startsWith("/tags"))}>
            <Icon d={ICONS.tags} /> Tags
          </Link>
        </nav>

        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-xs text-faint">Shelves</p>
          {STATUS_SHELVES.map((s) => (
            <Link key={s} href={`/?shelf=${encodeURIComponent(s)}`} className={item(shelf === s)}>
              <ShelfIcon shelf={s} /> {shelfLabel(s)}
            </Link>
          ))}
        </div>

        {years.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-2.5 pb-1 text-xs text-faint">Years</p>
            {years.map(({ year: y, count }) => (
              <Link key={y} href={`/?year=${y}`} className={item(year === String(y))}>
                <YearIcon filled={year === String(y)} />
                <span className="flex-1">{y}</span>
                <span className="text-xs text-faint">{count}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-0.5">
          <Link href="/missing-covers" className={item(pathname === "/missing-covers")}>
            <Icon d={ICONS.covers} /> Missing covers
          </Link>
          <Link href="/duplicates" className={item(pathname === "/duplicates")}>
            <Icon d={ICONS.duplicates} /> Duplicates
          </Link>
        </div>
      </aside>

      {/* Phone: bottom tab bar. */}
      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="flex">
          {[
            { href: "/", label: "Library", d: ICONS.library, active: onLibrary || (pathname.startsWith("/books/") && pathname !== "/books/new") },
            { href: "/books/new", label: "Add", d: ICONS.add, active: pathname === "/books/new" },
            { href: "/people", label: "People", d: ICONS.people, active: pathname.startsWith("/people") },
            { href: "/tags", label: "Tags", d: ICONS.tags, active: pathname.startsWith("/tags") },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem] ${t.active ? "text-ink" : "text-faint"}`}
            >
              <Icon d={t.d} className="size-5" />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
