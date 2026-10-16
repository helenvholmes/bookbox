import Link from "next/link";
import { CollectionTabs } from "@/components/CollectionTabs";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ListsHeader } from "@/components/ListForms";
import { getFacets, listLists } from "@/lib/books";
import { listFromTagAction } from "./actions";

export const metadata = { title: "Lists" };

export default async function ListsPage() {
  const [lists, { tags }] = await Promise.all([listLists(), getFacets()]);
  return (
    <div className="space-y-6 pb-6">
      <CollectionTabs current="/lists" />
      <ListsHeader />
      <p className="text-sm text-muted">
        Your own collections of books, like Urbanism or Gifts to give. A book can be on any number of lists, whatever its reading status. Add books from each
        book&rsquo;s page.
      </p>
      {lists.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {lists.map((l) => (
            <li key={l.id} className="flex overflow-hidden card">
              <Link href={`/library?shelf=${encodeURIComponent(l.name)}`} className="min-w-0 flex-1 px-3 py-3 hover:bg-raised">
                <span className="line-clamp-2 leading-snug font-medium">{l.name}</span>
                <span className="text-xs text-muted">
                  {l.count} {l.count === 1 ? "book" : "books"}
                </span>
              </Link>
              <Link href={`/lists/${l.id}`} aria-label={`Edit ${l.name}`} className="flex items-center border-l border-line px-3 text-muted hover:bg-raised">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tags.length > 0 && (
        <form action={listFromTagAction} className="max-w-xl space-y-3 card p-4">
          <h2 className="font-semibold">Make a list from a tag</h2>
          <p className="text-sm text-muted">
            Imported Goodreads shelves come in as tags. This moves a tag&rsquo;s books onto a list of the same name, then removes the tag.
          </p>
          <select name="tag" required className="field" defaultValue="">
            <option value="" disabled>
              Choose a tag…
            </option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
          <ConfirmButton className="btn" message="Turn this tag into a list? The tag is removed; its books go on the list." confirmLabel="Make list">
            Make list
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
