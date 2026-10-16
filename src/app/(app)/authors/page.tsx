import Link from "next/link";
import { AuthorGenderSelect } from "@/components/AuthorGenderSelect";
import { AuthorLookup } from "@/components/AuthorLookup";
import { countUnchecked, listAuthors } from "@/lib/author-genders";

export const metadata = { title: "Authors" };

export default async function AuthorsPage(props: PageProps<"/authors">) {
  const { show } = await props.searchParams;
  const [all, unchecked] = await Promise.all([listAuthors(), countUnchecked()]);
  const unknown = all.filter((a) => !a.gender);
  const authors = show === "unknown" ? unknown : all;
  const tab = (active: boolean) =>
    `-mb-px border-b-2 pt-1 pb-2.5 text-[0.8125rem] transition ${active ? "border-ink text-ink" : "border-transparent text-faint hover:text-muted"}`;

  return (
    <div className="space-y-6 pb-6">
      <Link href="/stats" className="block w-fit text-muted hover:text-ink">
        ‹ Stats
      </Link>
      <header className="space-y-2">
        <h1 className="display text-3xl">Authors</h1>
        <p className="max-w-2xl text-sm text-muted">
          For the &ldquo;Who wrote them&rdquo; part of Stats. Each author is looked up on{" "}
          <a href="https://www.wikidata.org" target="_blank" rel="noreferrer" className="text-ink underline">
            Wikidata
          </a>
          , and only filled in when it&rsquo;s sure. Change any of them here; what you set is never replaced by a lookup.
        </p>
        <AuthorLookup remaining={unchecked} />
      </header>

      <nav aria-label="Show" className="-mx-4 flex gap-5 border-b border-line px-4">
        <Link href="/authors" className={tab(show !== "unknown")} aria-current={show !== "unknown" ? "page" : undefined}>
          All <span className="text-faint">{all.length}</span>
        </Link>
        <Link href="/authors?show=unknown" className={tab(show === "unknown")} aria-current={show === "unknown" ? "page" : undefined}>
          Not known <span className="text-faint">{unknown.length}</span>
        </Link>
      </nav>

      {authors.length === 0 ? (
        <p className="text-sm text-muted">{show === "unknown" ? "Every author is known." : "No authors yet."}</p>
      ) : (
        <ul className="card divide-y divide-line">
          {authors.map((a) => (
            <li key={a.name} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/library?q=${encodeURIComponent(a.name)}`} className="block truncate text-sm hover:underline">
                  {a.name}
                </Link>
                <p className="text-xs text-faint">
                  {a.read} of {a.books} {a.books === 1 ? "book" : "books"} read
                  {a.source === "wikidata" && a.wikidataId && (
                    <>
                      {" · "}
                      <a href={`https://www.wikidata.org/wiki/${a.wikidataId}`} target="_blank" rel="noreferrer" className="hover:text-muted">
                        from Wikidata
                      </a>
                    </>
                  )}
                  {a.source === "you" && " · set by you"}
                </p>
              </div>
              <AuthorGenderSelect name={a.name} gender={a.gender} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
