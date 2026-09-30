/* eslint-disable @next/next/no-img-element -- small audiobook art straight from Spotify's CDN */
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ConfirmButton } from "@/components/ConfirmButton";
import { callbackUrl, getSpotifyAccount, spotifyConfigured, spotifyLibrary, type AudiobookRow } from "@/lib/spotify";
import { addAction, disconnectAction, ignoreAction, linkAction, restoreAction, syncNowAction, unlinkAction } from "./actions";

export const metadata = { title: "Spotify" };

const ERRORS: Record<string, string> = {
  setup: "Spotify isn’t set up yet; see the steps below.",
  denied: "Spotify wasn’t connected: the request was declined.",
  state: "That sign-in link had expired. Try connecting again.",
  connect: "Spotify didn’t accept the connection. Check the client ID, secret and redirect URI, then try again.",
};

export default async function SpotifyPage(props: PageProps<"/spotify">) {
  await connection();
  const sp = await props.searchParams;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : null;
  const configured = spotifyConfigured();
  const account = configured ? await getSpotifyAccount() : undefined;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

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
      <header>
        <h1 className="display text-3xl">Spotify</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          When you start or pick up an audiobook on Spotify, its book moves to Currently Reading and shows how far you are. A book that isn&rsquo;t in BookBox yet
          is added for you. It updates when you open BookBox.
        </p>
      </header>

      {error && <p className="card border-danger/40 p-4 text-sm text-danger">{error}</p>}
      {sp.connected && account && <p className="card p-4 text-sm">Connected. Link your audiobooks below.</p>}

      {!configured ? (
        <Setup origin={origin} />
      ) : !account ? (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted">Connect your Spotify account so BookBox can read your audiobook progress. It only reads; it never plays or changes anything.</p>
          {/* A full page load: this goes to Spotify and back. */}
          <a href="/api/spotify/connect" className="btn btn-primary rounded-full px-5">
            Connect Spotify
          </a>
        </section>
      ) : (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm">
            Connected{account.display_name ? ` as ${account.display_name}` : ""}.
            <span className="text-muted">
              {" "}
              {account.last_synced_at ? `Last synced ${new Date(account.last_synced_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.` : ""}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <form action={syncNowAction}>
              <button className="btn rounded-full px-4">Sync now</button>
            </form>
            <form action={disconnectAction}>
              <ConfirmButton className="btn rounded-full px-4" message="Disconnect Spotify? Synced progress is removed." confirmLabel="Disconnect">
                Disconnect
              </ConfirmButton>
            </form>
          </div>
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
                        <button className="chip text-left hover:text-ink">
                          Link to <span className="text-ink">{c.title}</span>
                          {c.author && <span className="text-faint"> · {c.author}</span>}
                        </button>
                      </form>
                    ))}
                    <form action={addAction}>
                      <input type="hidden" name="audiobook_id" value={r.audiobook.id} />
                      <button className="chip border-ink text-ink hover:bg-raised">Add to Currently Reading</button>
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

/** Shown until SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set. */
function Setup({ origin }: { origin: string }) {
  return (
    <section className="card space-y-4 p-5 text-sm">
      <h2 className="section-title">Set up</h2>
      <ol className="list-decimal space-y-3 pl-5 text-muted">
        <li>
          Go to the{" "}
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-ink underline">
            Spotify developer dashboard
          </a>{" "}
          and create an app. Any name works; tick <span className="text-ink">Web API</span>.
        </li>
        <li>
          Add this redirect URI: <code className="rounded bg-raised px-1.5 py-0.5 text-ink">{callbackUrl(origin.replace("//localhost", "//127.0.0.1"))}</code>
          {origin.includes("//localhost") && <> (Spotify doesn&rsquo;t accept &ldquo;localhost&rdquo;, so open BookBox at 127.0.0.1 when connecting locally)</>}
        </li>
        <li>
          Copy the app&rsquo;s Client ID and Client secret into Vercel as <code className="text-ink">SPOTIFY_CLIENT_ID</code> and{" "}
          <code className="text-ink">SPOTIFY_CLIENT_SECRET</code>, then redeploy.
        </li>
      </ol>
    </section>
  );
}
