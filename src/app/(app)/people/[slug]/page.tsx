import { notFound, permanentRedirect } from "next/navigation";
import { BookGrid } from "@/components/BookGrid";
import { getPerson } from "@/lib/books";
import { PersonHeader } from "@/components/PersonHeader";
import { formatDay } from "@/lib/dates";

export default async function PersonPage(props: PageProps<"/people/[slug]">) {
  const { slug } = await props.params;
  const data = await getPerson(decodeURIComponent(slug));
  if (!data) notFound();
  // Old links used the id: /people/12 -> /people/colette-shade
  if (data.person.slug !== decodeURIComponent(slug)) permanentRedirect(`/people/${data.person.slug}`);
  const { person, recommendedBy, recommendedTo, borrowing, borrowedBefore } = data;

  return (
    <div className="pb-6">
      <PersonHeader person={person}>
        {borrowing.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-title">
              Borrowing from you <span className="count">{borrowing.length}</span>
            </h2>
            <BookGrid books={borrowing} caption={(b) => `since ${formatDay(borrowing.find((l) => l.id === b.id)!.lentOn)}`} />
          </section>
        )}
        <section className="space-y-3">
          <h2 className="section-title">Recommended by {person.first}</h2>
          <BookGrid books={recommendedBy} empty={`Nothing from ${person.first} yet.`} />
        </section>
        <section className="space-y-3">
          <h2 className="section-title">Books for {person.first}</h2>
          <BookGrid books={recommendedTo} empty={`No books picked for ${person.first} yet.`} />
        </section>
        {borrowedBefore.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-title">
              Borrowed before <span className="count">{borrowedBefore.length}</span>
            </h2>
            <BookGrid books={borrowedBefore} />
          </section>
        )}
      </PersonHeader>
    </div>
  );
}
