import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OWNER_NAME } from "@/lib/constants";
import { getSharedList } from "@/lib/share";
import { SharedBooks } from "@/components/SharedBooks";

export async function generateMetadata(props: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const data = await getSharedList(token);
  return {
    title: { absolute: data ? `${data.title} · from ${OWNER_NAME}` : "Not found" },
    robots: { index: false, follow: false },
  };
}

/** A read-only list anyone with the link can see. */
export default async function SharedListPage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  const data = await getSharedList(token);
  if (!data) notFound();
  const { settings, books, title } = data;
  const srcBase = `/s/${token}/c`;
  const accent = settings.accent;

  return (
    <main className="mx-auto max-w-4xl px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-16 sm:px-8 sm:pt-16">
      <header className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="size-2 rounded-full" style={{ background: accent }} aria-hidden />A reading list from {OWNER_NAME}
        </p>
        <h1 className="display text-4xl leading-tight sm:text-5xl">{title}</h1>
        {settings.message && <p className="prose-text max-w-2xl text-[0.9375rem] text-muted">{settings.message}</p>}
        <p className="text-xs text-faint">
          {books.length} {books.length === 1 ? "book" : "books"}
        </p>
      </header>

      <div className="mt-10">
        {books.length === 0 ? (
          <p className="py-16 text-center text-muted">No books on this list yet.</p>
        ) : (
          <SharedBooks books={books} layout={settings.layout} srcBase={srcBase} accent={accent} owner={OWNER_NAME} />
        )}
      </div>

      <footer className="mt-16 text-center text-xs text-faint">Shared from BookBox</footer>
    </main>
  );
}
