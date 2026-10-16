import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SOURCE_URL } from "@/lib/constants";
import { ownerName } from "@/lib/settings";
import { getSharedList } from "@/lib/share";
import { SharedBooks } from "@/components/SharedBooks";

export async function generateMetadata(props: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const [data, owner] = await Promise.all([getSharedList(token), ownerName()]);
  return {
    title: { absolute: data ? [data.title, owner && `from ${owner}`].filter(Boolean).join(" · ") : "Not found" },
    robots: { index: false, follow: false },
  };
}

/** A read-only list anyone with the link can see. */
export default async function SharedListPage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  const data = await getSharedList(token);
  if (!data) notFound();
  const { settings, forThem, fromThem, title } = data;
  const srcBase = `/s/${token}/c`;
  const accent = settings.accent;
  const owner = await ownerName();

  return (
    <main className="mx-auto max-w-4xl px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-16 sm:px-8 sm:pt-16">
      <header className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="size-2 rounded-full" style={{ background: accent }} aria-hidden />{owner ? `A reading list from ${owner}` : "A reading list"}
        </p>
        <h1 className="display text-4xl leading-tight sm:text-5xl">{title}</h1>
        {settings.message && <p className="prose-text max-w-2xl text-[0.9375rem] text-muted">{settings.message}</p>}
        <p className="text-xs text-faint">{count(forThem.length)}</p>
      </header>

      <div className="mt-10">
        {forThem.length === 0 ? (
          <p className="py-16 text-center text-muted">No books on this list yet.</p>
        ) : (
          <SharedBooks books={forThem} layout={settings.layout} srcBase={srcBase} accent={accent} owner={owner} />
        )}
      </div>

      {fromThem.length > 0 && (
        <section className="mt-16 space-y-5 border-t border-line pt-10" aria-labelledby="from-them">
          <div>
            <h2 id="from-them" className="display text-2xl sm:text-3xl">
              Books you recommended to me
            </h2>
            <p className="mt-1 text-xs text-faint">
              {count(fromThem.length)}
              {settings.show_ratings || settings.show_reviews ? ", and what I thought of them" : ""}
            </p>
          </div>
          <SharedBooks books={fromThem} layout={settings.layout} srcBase={srcBase} accent={accent} owner={owner} />
        </section>
      )}

      <footer className="mt-16 text-center text-xs text-faint">
        Shared from{" "}
        <a href={SOURCE_URL} className="underline decoration-line underline-offset-2 hover:text-muted">
          BookBox
        </a>
      </footer>
    </main>
  );
}

const count = (n: number) => `${n} ${n === 1 ? "book" : "books"}`;
