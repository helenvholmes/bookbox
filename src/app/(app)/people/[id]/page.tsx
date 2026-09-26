import { notFound } from "next/navigation";
import { BookGrid } from "@/components/BookGrid";
import { getPerson } from "@/lib/books";
import { PersonHeader } from "@/components/PersonHeader";

export default async function PersonPage(props: PageProps<"/people/[id]">) {
  const { id } = await props.params;
  const data = await getPerson(Number(id));
  if (!data) notFound();
  const { person, recommendedBy, recommendedTo } = data;

  return (
    <div className="pb-6">
      <PersonHeader person={person}>
        <section className="space-y-3">
          <h2 className="section-title">Recommended by {person.first}</h2>
          <BookGrid books={recommendedBy} empty={`Nothing from ${person.first} yet.`} />
        </section>
        <section className="space-y-3">
          <h2 className="section-title">Books for {person.first}</h2>
          <BookGrid books={recommendedTo} empty={`No books picked for ${person.first} yet.`} />
        </section>
      </PersonHeader>
    </div>
  );
}
