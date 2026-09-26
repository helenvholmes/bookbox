import Link from "next/link";
import { connection } from "next/server";
import { RefreshRunner } from "@/components/RefreshRunner";
import { getRefreshStatus, listSuggestions, type Suggestion } from "@/lib/refresh";
import { allSuggestionsAction, suggestionAction } from "./actions";

export const metadata = { title: "OpenLibrary refresh" };

const FIELD_LABEL: Record<Suggestion["field"], string> = { title: "Title", author: "Author", series: "Series" };

export default async function RefreshPage() {
  await connection();
  const status = await getRefreshStatus();
  const suggestions = await listSuggestions();
  const groups = (["title", "author", "series"] as const)
    .map((field) => ({ field, items: suggestions.filter((s) => s.field === field) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-8 pb-6">
      <Link href="/" className="block w-fit text-muted hover:text-ink">
        ‹ Library
      </Link>
      <header>
        <h1 className="display text-3xl">OpenLibrary refresh</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Checks every book that has an ISBN against OpenLibrary. Empty fields (publisher, year, pages, description) are filled in
          automatically; different titles, authors and series are listed below for you to accept or dismiss. Nothing you&rsquo;ve written is
          overwritten, and covers are left to the Missing covers page.
        </p>
      </header>

      <RefreshRunner remaining={status.remaining} total={status.total} />

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No suggestions to review.</p>
      ) : (
        groups.map((g) => (
          <section key={g.field} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">
                {FIELD_LABEL[g.field]} <span className="count">{g.items.length}</span>
              </h2>
              <form action={allSuggestionsAction} className="flex gap-3 text-xs">
                <input type="hidden" name="field" value={g.field} />
                <button name="decision" value="dismiss" className="text-muted hover:text-ink">
                  Dismiss all
                </button>
                <button name="decision" value="accept" className="text-muted hover:text-ink">
                  Accept all
                </button>
              </form>
            </div>
            <ul className="card divide-y divide-line">
              {g.items.map((s) => (
                <li key={`${s.book_id}-${s.field}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1 text-[0.8125rem]">
                    <Link href={`/books/${s.book_id}`} className="text-xs text-faint hover:text-muted">
                      {s.title}
                    </Link>
                    <p className="mt-0.5">
                      <span className="text-muted line-through decoration-faint">{s.current || "none"}</span>
                      <span className="mx-2 text-faint">→</span>
                      <span>{s.value}</span>
                    </p>
                  </div>
                  <form action={suggestionAction} className="flex shrink-0 gap-2">
                    <input type="hidden" name="book_id" value={s.book_id} />
                    <input type="hidden" name="field" value={s.field} />
                    <button name="decision" value="dismiss" className="btn rounded-full px-3 text-xs">
                      Dismiss
                    </button>
                    <button name="decision" value="accept" className="btn btn-primary rounded-full px-3 text-xs">
                      Accept
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
