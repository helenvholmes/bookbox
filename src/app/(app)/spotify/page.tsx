/* eslint-disable @next/next/no-img-element -- small audiobook art straight from Spotify's CDN */
import Link from "next/link";
import { connection } from "next/server";
import { SubmitButton } from "@/components/SubmitButton";
import { getSpotifyAccount, spotifyLibrary, type AudiobookRow } from "@/lib/spotify";
import { addAction, ignoreAction, linkAction, restoreAction, unlinkAction } from "./actions";

export const metadata = { title: "Spotify" };

/** Your Spotify audiobooks and the books they're linked to. Connecting the account is in Settings. */
export default async function SpotifyPage() {
  await connection();
  const account = await getSpotifyAccount();

  let rows: AudiobookRow[] = [];
  let libraryError: string | null = null;
  if (account) {
    try {
      rows = await spotifyLibrary();
    } catch {
      libraryError = "Couldn’t load your Spotify library just now. Try again in a minute.";
    }
  }
  const unlinked = rows.filter((r) => !r.linked && !r.ignored);
  const ignored = rows.filter((r) => r.ignored);
  const linked = rows.filter((r) => r.linked);

  return (
    <div className="space-y-8 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-3xl">Spotify</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            When you start or pick up an audiobook on Spotify, its book moves to Currently Reading and shows how far you are. A book that isn&rsquo;t in BookBox
            yet is added for you. It updates when you open BookBox.
          </p>
        </div>
        {account && (
          <Link href="/settings#spotify" className="btn shrink-0 rounded-full px-4">
            Spotify settings
          </Link>
        )}
      </header>

      {!account && (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted">Spotify isn&rsquo;t connected yet. Connect your account in Settings, and your audiobooks show up here.</p>
          <Link href="/settings#spotify" className="btn btn-primary rounded-full px-5">
            Connect in Settings
          </Link>
        </section>
      )}

      {libraryError && <p className="text-sm text-danger">{libraryError}</p>}

      {account && !libraryError && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No audiobooks in your Spotify library yet. Start one on Spotify and it shows up here.</p>
      )}

      {unlinked.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">
            Not in Currently Reading <span className="count">{unlinked.length}</span>
          </h2>
          <p className="text-xs text-faint">
            These are added by themselves when you next listen to them. To bring one in now, add it (its book is created if BookBox doesn&rsquo;t have it) or link it to a
            book you already have.
          </p>
          <ul className="card divide-y divide-line">
            {unlinked.map((r) => (
              <li key={r.audiobook.id} className="flex flex-wrap items-start gap-4 p-4">
                <Art row={r} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-[0.8125rem]">{r.audiobook.name}</p>
                    <p className="text-xs text-muted">{r.audiobook.authors}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.candidates.map((c) => (
                      <form key={c.id} action={linkAction}>
                        <input type="hidden" name="book_id" value={c.id} />
                        <input type="hidden" name="audiobook_id" value={r.audiobook.id} />
                        <input type="hidden" name="name" value={r.audiobook.name} />
                        <SubmitButton className="chip text-left hover:text-ink" pending="Linking…">
                          Link to <span className="text-ink">{c.title}</span>
                          {c.author && <span className="text-faint"> · {c.author}</span>}
                        </SubmitButton>
                      </form>
                    ))}
                    <form action={addAction}>
                      <input type="hidden" name="audiobook_id" value={r.audiobook.id} />
                      <SubmitButton className="chip border-ink text-ink hover:bg-raised" pending="Adding…">
                        Add to Currently Reading
                      </SubmitButton>
                    </form>
                    <form action={ignoreAction}>
                      <input type="hidden" name="audiobook_id" value={r.audiobook.id} />
                      <button className="text-xs text-faint hover:text-muted">Leave this one alone</button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {linked.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">
            Linked <span className="count">{linked.length}</span>
          </h2>
          <ul className="card divide-y divide-line">
            {linked.map((r) => (
              <li key={r.audiobook.id} className="flex items-center gap-4 p-4">
                <Art row={r} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem]">{r.audiobook.name}</p>
                  <Link href={`/books/${r.linked!.bookId}`} className="text-xs text-muted hover:text-ink">
                    → {r.linked!.title}
                  </Link>
                </div>
                <form action={unlinkAction}>
                  <input type="hidden" name="book_id" value={r.linked!.bookId} />
                  <button className="text-xs text-faint hover:text-danger">Unlink</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ignored.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">
            Left alone <span className="count">{ignored.length}</span>
          </h2>
          <ul className="card divide-y divide-line">
            {ignored.map((r) => (
              <li key={r.audiobook.id} className="flex items-center gap-4 p-4">
                <Art row={r} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] text-muted">{r.audiobook.name}</p>
                  <p className="truncate text-xs text-faint">{r.audiobook.authors}</p>
                </div>
                <form action={restoreAction}>
                  <input type="hidden" name="audiobook_id" value={r.audiobook.id} />
                  <button className="text-xs text-faint hover:text-ink">Restore</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Art({ row }: { row: AudiobookRow }) {
  return (
    <span className="size-12 shrink-0 overflow-hidden rounded-md bg-line">
      {row.audiobook.image && <img src={row.audiobook.image} alt="" className="size-full object-cover" loading="lazy" />}
    </span>
  );
}
