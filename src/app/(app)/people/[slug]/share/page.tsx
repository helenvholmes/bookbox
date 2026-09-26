import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ShareEditor } from "@/components/ShareEditor";
import { getPerson } from "@/lib/books";
import { ACCENTS, defaultTitle, getShareSettings } from "@/lib/share";

export const metadata = { title: "Share" };

export default async function SharePage(props: PageProps<"/people/[slug]/share">) {
  const { slug } = await props.params;
  const data = await getPerson(decodeURIComponent(slug));
  if (!data) notFound();
  if (data.person.slug !== decodeURIComponent(slug)) permanentRedirect(`/people/${data.person.slug}/share`);
  const { person, recommendedBy, recommendedTo } = data;
  const settings = await getShareSettings(person.id);

  return (
    <div className="space-y-8 pb-6 md:space-y-10">
      <Link href={`/people/${person.slug}`} className="block w-fit text-muted hover:text-ink">
        ‹ {`${person.first} ${person.last}`.trim()}
      </Link>
      <header>
        <h1 className="display text-3xl">Share with {person.first}</h1>
        <p className="mt-1 text-sm text-muted">
          A read-only page anyone with the link can open, no password needed. Your private notes and spoilers are never shown.
        </p>
      </header>
      <ShareEditor
        personId={person.id}
        first={person.first}
        settings={settings}
        counts={{ for: recommendedTo.length, by: recommendedBy.length }}
        defaults={{ for: defaultTitle(person.first, "for"), by: defaultTitle(person.first, "by") }}
        accents={[...ACCENTS]}
      />
    </div>
  );
}
