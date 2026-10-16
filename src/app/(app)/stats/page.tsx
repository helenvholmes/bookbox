import Link from "next/link";
import { CollectionTabs } from "@/components/CollectionTabs";
import { GenderCard } from "@/components/GenderCard";
import { GoalCard } from "@/components/GoalCard";
import { RankList } from "@/components/RankList";
import { Stars } from "@/components/Stars";
import { YearChart } from "@/components/YearChart";
import { genderBreakdown, genderByYear } from "@/lib/author-genders";
import { getStats } from "@/lib/stats";

export const metadata = { title: "Stats" };

export default async function StatsPage() {
  const [s, authors, authorsByYear] = await Promise.all([getStats(), genderBreakdown(), genderByYear()]);
  const maxRating = Math.max(1, ...s.ratings.map((r) => r.count));

  const tiles = [
    { value: s.totals.books, label: "books in your library" },
    { value: s.totals.read, label: "books read" },
    { value: s.totals.rereads, label: s.totals.rereads === 1 ? "re-read" : "re-reads" },
    { value: s.totals.avgRating ?? "–", label: "average rating" },
    { value: s.totals.pagesThisYear ? s.totals.pagesThisYear.toLocaleString() : "–", label: `pages in ${s.year}` },
    { value: s.totals.abandoned, label: "abandoned" },
  ];

  return (
    <div className="space-y-8 pb-6">
      <CollectionTabs current="/stats" />
      <header className="flex items-center justify-between gap-4">
        <h1 className="display text-3xl">Stats</h1>
        <a href="/export/books.csv" download className="btn rounded-full px-4">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
          </svg>
          Export CSV
        </a>
      </header>

      <GoalCard year={s.year} goal={s.goal} read={s.readThisYear} />

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <li key={t.label} className="card p-3">
            <p className="display text-2xl">{t.value}</p>
            <p className="text-xs leading-tight text-muted">{t.label}</p>
          </li>
        ))}
      </ul>

      <YearChart rows={s.perYear} highlight={s.year} />

      <section className="space-y-3">
        <h2 className="section-title">Year in review</h2>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([s.year, ...s.perYear.map((r) => r.year)])]
            .sort((a, b) => b - a)
            .map((y) => (
              <Link key={y} href={`/stats/${y}`} className="chip hover:text-ink">
                {y}
              </Link>
            ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <GenderCard breakdown={authors} scope="all time" years={authorsByYear} />

        <section className="card space-y-3 p-5">
          <h2 className="section-title">Your ratings</h2>
          <ul className="space-y-2">
            {[...s.ratings].reverse().map((r) => (
              <li key={r.rating} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-xs" title={`${r.count} books rated ${r.rating}`}>
                <Stars rating={r.rating} label={false} />
                <span className="h-2 rounded-r-[4px] bg-faint" style={{ width: `${(r.count / maxRating) * 100}%`, minWidth: r.count ? 2 : 0 }} />
                <span className="text-right text-muted tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <RankList title="Top tags" rows={s.topTags.map((t) => ({ key: t.label, label: t.label, value: `${t.count}` }))} />

        <RankList
          title="Most-read authors"
          rows={s.topAuthors.map((a) => ({
            key: a.label,
            label: a.label,
            href: `/library?q=${encodeURIComponent(a.label)}`,
            value: `${a.count} books${a.avg ? ` · ${a.avg}★` : ""}`,
          }))}
        />

        <RankList
          title="Best recommenders"
          note="Average rating you gave books they recommended (2+ books)"
          rows={s.recommenders.map((p) => ({ key: String(p.id), label: p.label, href: `/people/${p.slug}`, value: `${p.avg}★ · ${p.count} books` }))}
          empty="Not enough rated recommendations yet."
        />
      </div>
    </div>
  );
}
