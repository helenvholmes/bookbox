import Link from "next/link";

/** A numbered list of names and counts, in a card (top tags, authors, recommenders). */
export function RankList({
  title,
  note,
  rows,
  empty = "Nothing here yet.",
}: {
  title: string;
  note?: string;
  rows: { key: string; label: string; value: string; href?: string }[];
  empty?: string;
}) {
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="section-title">{title}</h2>
        {note && <p className="text-xs text-faint">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <ol className="divide-y divide-line text-[0.8125rem]">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 py-1.5">
              <span className="w-4 text-xs text-faint tabular-nums">{i + 1}</span>
              {r.href ? (
                <Link href={r.href} className="min-w-0 flex-1 truncate hover:underline">
                  {r.label}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
              )}
              <span className="shrink-0 text-xs text-muted tabular-nums">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
