import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getFacets } from "@/lib/books";
import { AddPersonButton } from "@/components/AddPersonButton";
import { RELATIONSHIPS } from "@/lib/constants";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const { people } = await getFacets();
  const groups = [...RELATIONSHIPS, "Other"].map((rel) => ({
    rel,
    people: people.filter((p) => (rel === "Other" ? !RELATIONSHIPS.some((r) => p.relationship.includes(r)) : p.relationship.split(",").includes(rel))),
  }));

  return (
    <div className="space-y-8 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-3xl">People</h1>
        <AddPersonButton />
      </header>

      {groups
        .filter((g) => g.people.length)
        .map((g) => (
          <section key={g.rel} className="space-y-2">
            <h2 className="section-title">{g.rel}</h2>
            <ul className="divide-y divide-line overflow-hidden card">
              {g.people.map((p) => (
                <li key={p.id}>
                  <Link href={`/people/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised">
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar id={p.id} name={p.name} className="size-8 text-[0.6875rem]" />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="text-right text-xs text-muted">
                      {[p.byCount && `${p.byCount} recommended`, p.forCount && `${p.forCount} for them`].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

    </div>
  );
}
