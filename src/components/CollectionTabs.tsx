import Link from "next/link";

const TABS = [
  { href: "/tags", label: "Tags" },
  { href: "/series", label: "Series" },
  { href: "/stats", label: "Stats" },
] as const;

/** Underline tabs shared by the Tags, Series and Stats pages. */
export function CollectionTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Collections" className="-mx-4 flex gap-5 border-b border-line px-4">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`-mb-px border-b-2 pt-1 pb-2.5 text-[0.8125rem] transition ${
            t.href === current ? "border-ink text-ink" : "border-transparent text-faint hover:text-muted"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
