import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getFacets, getTag } from "@/lib/books";
import { deleteTagAction, mergeTagAction, updateTagAction } from "../actions";

export default async function TagPage(props: PageProps<"/tags/[id]">) {
  const { id } = await props.params;
  const [tag, facets] = await Promise.all([getTag(Number(id)), getFacets()]);
  if (!tag) notFound();
  const count = facets.tags.find((t) => t.id === tag.id)?.count ?? 0;

  return (
    <div className="space-y-6 pb-6">
      <Link href="/tags" className="block w-fit text-muted hover:text-ink">
        ‹ Tags
      </Link>
      <header className="flex items-end justify-between gap-3">
        <h1 className="display text-3xl">{tag.name}</h1>
        <Link href={`/?tag=${tag.id}`} className="btn shrink-0">
          {count} {count === 1 ? "book" : "books"}
        </Link>
      </header>

      <form action={updateTagAction} className="space-y-3 card p-4">
        <input type="hidden" name="id" value={tag.id} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input name="name" required defaultValue={tag.name} className="field" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Notes</span>
          <textarea name="notes" defaultValue={tag.notes} className="field" />
        </label>
        <button className="btn btn-primary">Save</button>
      </form>

      <form action={mergeTagAction} className="space-y-3 card p-4">
        <input type="hidden" name="id" value={tag.id} />
        <h2 className="font-semibold">Merge into another tag</h2>
        <p className="text-sm text-muted">Moves all {count} books to the tag you choose, then removes “{tag.name}”.</p>
        <select name="into" required className="field" defaultValue="">
          <option value="" disabled>
            Choose a tag…
          </option>
          {facets.tags
            .filter((t) => t.id !== tag.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count})
              </option>
            ))}
        </select>
        <button className="btn">Merge</button>
      </form>

      <form action={deleteTagAction} className="text-center">
        <input type="hidden" name="id" value={tag.id} />
        <ConfirmButton className="btn btn-danger" message={`Delete the “${tag.name}” tag? Books keep everything else.`}>
          Delete tag
        </ConfirmButton>
      </form>
    </div>
  );
}
