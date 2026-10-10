import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { RankList } from "@/components/RankList";
import { formatSpan } from "@/lib/dates";
import { getYearReview, type ReviewBook } from "@/lib/stats";
import { validYear } from "@/lib/sync-ops";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseYear(raw: string) {
  const year = Number(raw);
  if (!/^\d{4}$/.test(raw) || !validYear(year)) notFound();
  return year;
}

export async function generateMetadata(props: PageProps<"/stats/[year]">): Promise<Metadata> {
  return { title: `${parseYear((await props.params).year)} in review` };
}

/** A year in books: there for every year without setting anything up. */
export default async function YearReviewPage(props: PageProps<"/stats/[year]">) {
  const year = parseYear((await props.params).year);
  const r = await getYearReview(year);
  const n = r.books.length;
  const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
  const maxMonth = Math.max(1, ...r.perMonth);
  const hasMonths = r.perMonth.some(Boolean);
  // The month chart only means something once most of the year's reads have days.
  const showMonthChart = r.perMonth.reduce((a, b) => a + b, 0) * 2 >= r.books.length;

  const tiles = [
    { value: n, label: n === 1 ? "book finished" : "books finished" },
    { value: r.pages ? r.pages.toLocaleString() : "–", label: "pages" },
    { value: r.avgRating ?? "–", label: "average rating" },
    { value: r.rereads, label: r.rereads === 1 ? "re-read" : "re-reads" },
    ...(r.readingDays ? [{ value: r.readingDays, label: "days with a book on the go" }] : []),
    ...(r.longestStreak > 1 ? [{ value: r.longestStreak, label: "days in a row, at most" }] : []),
  ];

  // Grouped by the month each book was finished; books without a finish day go last.
  // Reads only have days from when dates were added, so undated ones (the older ones) come first.
  const groups = hasMonths
    ? [
        { name: `Sometime in ${year}`, books: r.books.filter((b) => !b.finished) },
        ...MONTHS.map((name, i) => ({ name, books: r.books.filter((b) => b.finished?.slice(5, 7) === String(i + 1).padStart(2, "0")) })),
      ].filter((g) => g.books.length)
    : [{ name: null, books: r.books }];

  return (
    <div className="space-y-10 pb-6">
      <nav className="flex items-center justify-between">
        <Link href="/stats" className="text-muted hover:text-ink">
          ‹ Stats
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/stats/${year - 1}`} aria-label={`${year - 1} in review`} className="flex size-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink">
            ‹
          </Link>
          <Link href={`/stats/${year + 1}`} aria-label={`${year + 1} in review`} className="flex size-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink">
            ›
          </Link>
        </div>
      </nav>

      <header className="space-y-2">
        <h1 className="display text-4xl md:text-5xl">{year} in books</h1>
        <p className="text-muted">
          {n === 0
            ? `Nothing finished in ${year} yet.`
            : `${plural(n, "book")}${r.pages ? `, ${plural(r.pages, "page")}` : ""}${r.goal ? ` · goal ${r.goal}${n >= r.goal ? ", reached" : ""}` : ""}`}
        </p>
        {r.goal ? (
          <div className="h-1.5 max-w-sm overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Reading goal" aria-valuenow={n} aria-valuemin={0} aria-valuemax={r.goal}>
            <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (n / r.goal) * 100)}%` }} />
          </div>
        ) : null}
      </header>

      {n > 0 && (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <li key={t.label} className="card p-3">
                <p className="display text-2xl">{t.value}</p>
                <p className="text-xs leading-tight text-muted">{t.label}</p>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {r.favourites.length > 0 && (
              <Highlight title={r.favourites.length === 1 ? "Favourite" : "Favourites"} books={r.favourites} note={`${r.favourites[0].rating}★`} />
            )}
            {r.longest && <Highlight title="Longest" books={[r.longest]} note={plural(r.longest.pages!, "page")} />}
            {r.shortest && <Highlight title="Shortest" books={[r.shortest]} note={plural(r.shortest.pages!, "page")} />}
            {r.fastest && <Highlight title="Quickest read" books={[r.fastest.book]} note={plural(r.fastest.days, "day")} />}
          </div>

          {showMonthChart && (
            <section className="card space-y-4 p-5">
              <h2 className="section-title">Books finished per month</h2>
              <div className="flex h-32 items-end gap-1 border-b border-line">
                {r.perMonth.map((count, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${MONTHS[i]}: ${plural(count, "book")}`}>
                    <span className="block w-full rounded-t-[4px] bg-faint" style={{ height: `${(count / maxMonth) * 100}%`, minHeight: count ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-1 text-center text-[0.6875rem] text-faint">
                {MONTHS.map((m) => (
                  <span key={m} className="flex-1">
                    {m[0]}
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.name ?? "all"} className="space-y-3">
                <h2 className="section-title">
                  {g.name ?? "Every book"} <span className="count">{g.books.length}</span>
                </h2>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {g.books.map((b) => (
                    <li key={b.id}>
                      <Link href={`/books/${b.id}`} title={`${b.title}${b.author ? ` by ${b.author}` : ""}`} className="block transition hover:opacity-80">
                        <Cover cover={b.cover} title={b.title} author={b.author} className="rounded-sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <RankList
              title="Authors"
              rows={r.topAuthors.map((a) => ({ key: a.label, label: a.label, href: `/library?q=${encodeURIComponent(a.label)}`, value: `${a.count} books${a.avg ? ` · ${a.avg}★` : ""}` }))}
              empty="No author twice this year."
            />
            <RankList title="Tags" rows={r.topTags.map((t) => ({ key: String(t.id), label: t.label, href: `/library?tag=${t.id}`, value: `${t.count}` }))} />
            <RankList
              title="Recommended by"
              rows={r.recommenders.map((p) => ({ key: String(p.id), label: p.label, href: `/people/${p.slug}`, value: `${p.count} ${p.count === 1 ? "book" : "books"}${p.avg ? ` · ${p.avg}★` : ""}` }))}
              empty="No recommendations read this year."
            />
            {r.abandoned.length > 0 && (
              <RankList title="Set aside" rows={r.abandoned.map((b) => ({ key: String(b.id), label: b.title, href: `/books/${b.id}`, value: "" }))} />
            )}
          </div>

          <p className="text-xs text-faint">
            <Link href={`/library?year=${year}`} className="underline hover:text-muted">
              See {year}&rsquo;s books in the library
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function Highlight({ title, books, note }: { title: string; books: ReviewBook[]; note: string }) {
  const [first] = books;
  return (
    <section className="card space-y-3 p-4">
      <h2 className="section-title">{title}</h2>
      <div className="flex gap-1.5">
        {books.slice(0, 3).map((b) => (
          <Link key={b.id} href={`/books/${b.id}`} className="w-14 shrink-0 transition hover:opacity-80" title={b.title}>
            <Cover cover={b.cover} title={b.title} className="rounded-sm" />
          </Link>
        ))}
      </div>
      <p className="text-[0.8125rem]">
        {books.length === 1 ? <span className="line-clamp-2">{first.title}</span> : <span>{books.length} books</span>}
        <span className="block text-muted">
          {note}
          {books.length === 1 && first.started && first.finished ? ` · ${formatSpan(first.started, first.finished)}` : ""}
        </span>
      </p>
    </section>
  );
}
