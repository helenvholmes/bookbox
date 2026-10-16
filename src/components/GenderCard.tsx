import Link from "next/link";
import { countUnchecked, GENDER_LABELS, type Breakdown } from "@/lib/author-genders";
import { AuthorLookup } from "./AuthorLookup";

/**
 * Books read by women, men and nonbinary authors, as one bar split by share, with a legend that
 * gives the exact numbers. Colors are the first three categorical slots (validated on --card);
 * not known is the neutral gray, since it's missing data rather than a group.
 */
const GROUPS = [
  { key: "woman", label: GENDER_LABELS.woman, color: "#3987e5" },
  { key: "man", label: GENDER_LABELS.man, color: "#d95926" },
  { key: "nonbinary", label: GENDER_LABELS.nonbinary, color: "#199e70" },
  { key: "unknown", label: "Not known", color: "var(--faint)" },
] as const;

const percent = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** One bar split by share: 2px gaps between segments, rounded only at the bar's ends. */
function SplitBar({ breakdown, className = "h-3" }: { breakdown: Breakdown; className?: string }) {
  const shown = GROUPS.filter((g) => breakdown[g.key] > 0);
  return (
    <div className={`flex gap-[2px] overflow-hidden rounded-[4px] ${className}`} role="img" aria-label={shown.map((g) => `${g.label}: ${breakdown[g.key]}`).join(", ")}>
      {shown.map((g) => (
        <span
          key={g.key}
          className="h-full"
          style={{ width: `${(breakdown[g.key] / breakdown.total) * 100}%`, background: g.color, minWidth: 3 }}
          title={`${g.label}: ${breakdown[g.key]} (${percent(breakdown[g.key], breakdown.total)}%)`}
        />
      ))}
    </div>
  );
}

/**
 * `years` (on the Stats overview) adds the split for each year, as a bar per year with a table of
 * the numbers to open (bars show their numbers on hover, which phones don't have).
 */
export async function GenderCard({ breakdown, scope, years }: { breakdown: Breakdown; scope: string; years?: { year: number; breakdown: Breakdown }[] }) {
  const unchecked = await countUnchecked();
  const { total } = breakdown;
  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Who wrote them</h2>
        <Link href="/authors" className="text-xs text-muted hover:text-ink">
          Authors
        </Link>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted">No books read {scope} yet.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Of {total.toLocaleString()} {total === 1 ? "book" : "books"} read {scope}, by the author on each.
          </p>
          <SplitBar breakdown={breakdown} />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {GROUPS.map((g) => (
              <li key={g.key} className={`flex items-center gap-2 ${breakdown[g.key] ? "" : "text-faint"}`}>
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: g.color }} />
                <span className="min-w-0 flex-1">{g.label}</span>
                <span className="tabular-nums">
                  {breakdown[g.key]} <span className="text-xs text-muted">{percent(breakdown[g.key], total)}%</span>
                </span>
              </li>
            ))}
          </ul>
          {years && years.length > 1 && (
            <div className="space-y-2 border-t border-line pt-4">
              <h3 className="text-xs text-muted">By year</h3>
              <ul className="space-y-1.5">
                {years.map(({ year, breakdown: y }) => (
                  <li key={year} className="grid grid-cols-[2.75rem_minmax(0,1fr)_2rem] items-center gap-3 text-xs">
                    <Link href={`/stats/${year}`} className="text-muted tabular-nums hover:text-ink">
                      {year}
                    </Link>
                    <SplitBar breakdown={y} className="h-2" />
                    <span className="text-right text-muted tabular-nums" title={`${y.total} books read`}>
                      {y.total}
                    </span>
                  </li>
                ))}
              </ul>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted hover:text-ink">Show the numbers</summary>
                <table className="mt-2 w-full text-right tabular-nums">
                  <thead className="text-faint">
                    <tr>
                      <th className="py-1 text-left font-normal">Year</th>
                      {GROUPS.map((g) => (
                        <th key={g.key} className="py-1 pl-2 font-normal">
                          {g.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {years.map(({ year, breakdown: y }) => (
                      <tr key={year} className="border-t border-line">
                        <td className="py-1 text-left text-muted">{year}</td>
                        {GROUPS.map((g) => (
                          <td key={g.key} className={`py-1 pl-2 ${y[g.key] ? "" : "text-faint"}`}>
                            {y[g.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          )}
          {breakdown.unknown > 0 && unchecked === 0 && (
            <p className="text-xs text-muted">
              {breakdown.unknown === 1 ? "One book's author isn't" : `${breakdown.unknown} books' authors aren't`} known.{" "}
              <Link href="/authors?show=unknown" className="text-ink underline">
                Set them
              </Link>
            </p>
          )}
        </>
      )}
      <AuthorLookup remaining={unchecked} />
    </section>
  );
}
