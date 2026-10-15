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

export async function GenderCard({ breakdown, scope }: { breakdown: Breakdown; scope: string }) {
  const unchecked = await countUnchecked();
  const { total } = breakdown;
  const shown = GROUPS.filter((g) => breakdown[g.key] > 0);
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
          {/* 2px gaps between segments; rounded only at the bar's ends. */}
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={shown.map((g) => `${g.label}: ${breakdown[g.key]}`).join(", ")}>
            {shown.map((g) => (
              <span
                key={g.key}
                className="h-full"
                style={{ width: `${(breakdown[g.key] / total) * 100}%`, background: g.color, minWidth: 3 }}
                title={`${g.label}: ${breakdown[g.key]} (${percent(breakdown[g.key], total)}%)`}
              />
            ))}
          </div>
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
