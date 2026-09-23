import Link from "next/link";
import { TagsHeader } from "@/components/TagsHeader";
import { getFacets } from "@/lib/books";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const { tags } = await getFacets();
  return (
    <div className="space-y-6 pb-6">
      <TagsHeader />
      <p className="text-sm text-muted">Tap a tag to see its books. You can also add tags from any book&rsquo;s edit screen.</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tags.map((t) => (
          <li key={t.id} className="flex overflow-hidden card">
            <Link href={`/?tag=${t.id}`} className="min-w-0 flex-1 px-3 py-3 hover:bg-raised">
              <span className="line-clamp-2 leading-snug font-medium">{t.name}</span>
              <span className="text-xs text-muted">
                {t.count} {t.count === 1 ? "book" : "books"}
              </span>
            </Link>
            <Link href={`/tags/${t.id}`} aria-label={`Edit ${t.name}`} className="flex items-center border-l border-line px-3 text-muted hover:bg-raised">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
