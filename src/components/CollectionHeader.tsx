"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NewListForm } from "./ListForms";
import { NewTagForm } from "./NewTagForm";

const PAGES = [
  { href: "/lists", label: "Lists", add: "+ New list" },
  { href: "/tags", label: "Tags", add: "+ Add tag" },
  { href: "/series", label: "Series" },
  { href: "/stats", label: "Stats" },
] as const;

/**
 * The title and underline tabs over the Lists, Tags, Series and Stats pages. It lives in their shared
 * layout, so it stays on screen as you switch between them (only the page below changes), and the
 * title and tab change the moment a tab is tapped rather than when the page arrives. Named, so the
 * page transitions leave it still (see "Page transitions" in globals.css).
 */
export function CollectionHeader() {
  const pathname = usePathname();
  // The tab just tapped; it counts only until the page changes.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  // Which page's "+ Add" field is open, so it closes on switching.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const href = tapped?.from === pathname ? tapped.href : pathname;
  const page = PAGES.find((p) => p.href === href) ?? PAGES[0];
  const open = openOn === page.href;
  const close = () => setOpenOn(null);

  return (
    <div style={{ viewTransitionName: "collection-header" }} className="space-y-4">
      <header className="flex min-h-10 items-center justify-between gap-4">
        <h1 className="display text-3xl">{page.label}</h1>
        {"add" in page && !open && (
          <button type="button" className="btn rounded-full px-4" onClick={() => setOpenOn(page.href)}>
            {page.add}
          </button>
        )}
        {page.href === "/stats" && (
          <a href="/export/books.csv" download className="btn rounded-full px-4">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
            </svg>
            Export CSV
          </a>
        )}
      </header>
      <nav aria-label="Collections" className="-mx-4 flex gap-5 border-b border-line px-4">
        {PAGES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === pathname ? "page" : undefined}
            onClick={() => setTapped({ href: t.href, from: pathname })}
            className={`-mb-px border-b-2 pt-1 pb-2.5 text-[0.8125rem] transition ${
              t.href === page.href ? "border-ink text-ink" : "border-transparent text-faint hover:text-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {open && page.href === "/tags" && <NewTagForm onClose={close} />}
      {open && page.href === "/lists" && <NewListForm onClose={close} />}
    </div>
  );
}
