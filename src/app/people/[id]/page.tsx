import Link from "next/link";
import { notFound } from "next/navigation";
import { BookGrid } from "@/components/BookGrid";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getPerson } from "@/lib/books";
import { RelationshipChoices } from "@/components/RelationshipChoices";
import { deletePersonAction, updatePersonAction } from "../actions";

export default async function PersonPage(props: PageProps<"/people/[id]">) {
  const { id } = await props.params;
  const data = await getPerson(Number(id));
  if (!data) notFound();
  const { person, recommendedBy, recommendedTo } = data;
  const name = `${person.first} ${person.last}`.trim();

  return (
    <div className="space-y-8 pb-6">
      <Link href="/people" className="font-medium text-accent">
        ‹ People
      </Link>
      <header>
        <h1 className="display text-3xl">{name}</h1>
        {person.relationship && <p className="text-muted">{person.relationship.split(",").join(" · ")}</p>}
      </header>

      <section className="space-y-3">
        <h2 className="section-title">Recommended by {person.first}</h2>
        <BookGrid books={recommendedBy} empty={`Nothing from ${person.first} yet.`} />
      </section>
      <section className="space-y-3">
        <h2 className="section-title">Books for {person.first}</h2>
        <BookGrid books={recommendedTo} empty={`No books picked for ${person.first} yet.`} />
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Edit {person.first}</summary>
        <form action={updatePersonAction} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={person.id} />
          <div className="grid grid-cols-2 gap-2">
            <input name="first" required defaultValue={person.first} aria-label="First name" className="field" />
            <input name="last" defaultValue={person.last} aria-label="Last name" placeholder="Last name" className="field" />
          </div>
          <RelationshipChoices selected={person.relationship.split(",")} />
          <button className="btn btn-primary">Save</button>
        </form>
        <form action={deletePersonAction} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={person.id} />
          <ConfirmButton className="btn btn-danger" message={`Delete ${name}? Their recommendations will be removed from your books.`}>
            Delete person
          </ConfirmButton>
        </form>
      </details>
    </div>
  );
}
