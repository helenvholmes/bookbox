import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ApiKeyOriginsForm, NewApiKeyForm } from "@/components/ApiKeyForms";
import { ConfirmButton } from "@/components/ConfirmButton";
import { GoodreadsImport } from "@/components/GoodreadsImport";
import { HardcoverTokenForm } from "@/components/HardcoverTokenForm";
import { LibbyImport } from "@/components/LibbyImport";
import { SettingsForm } from "@/components/SettingsForm";
import { SignOutButton } from "@/components/SignOutButton";
import { listApiKeys } from "@/lib/api-keys";
import { authEnabled } from "@/lib/auth";
import { SpotifyKeysForm } from "@/components/SpotifyKeysForm";
import { SubmitButton } from "@/components/SubmitButton";
import { hardcoverToken } from "@/lib/hardcover";
import { getSettings } from "@/lib/settings";
import { callbackUrl, getSpotifyAccount, spotifyCredentials } from "@/lib/spotify";
import { disconnectAction, syncNowAction } from "../spotify/actions";
import { deleteApiKeyAction, removeHardcoverTokenAction, removeSpotifyKeysAction } from "./actions";

export const metadata = { title: "Settings" };

const TIDY_UP = [
  { href: "/missing-covers", title: "Missing covers", text: "Books without a cover, with ISBN matches first." },
  { href: "/missing-isbns", title: "Missing ISBNs", text: "Books without an ISBN, which OpenLibrary needs to look them up." },
  { href: "/duplicates", title: "Duplicates", text: "Books that share an ISBN or title." },
  { href: "/refresh", title: "OpenLibrary refresh", text: "Fills empty details from OpenLibrary and lists differences to review." },
];

const SPOTIFY_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "Spotify is connected. Your audiobooks are on the Spotify page." },
  setup: { text: "Add your Spotify app’s keys first.", error: true },
  denied: { text: "Spotify wasn’t connected: the request was declined.", error: true },
  state: { text: "That sign-in link had expired. Try connecting again.", error: true },
  connect: { text: "Spotify didn’t accept the connection. Check the keys and the redirect URI below, then try again.", error: true },
};

export default async function SettingsPage(props: PageProps<"/settings">) {
  await connection();
  const sp = await props.searchParams;
  const [settings, keys, account, hardcover, apiKeys] = await Promise.all([getSettings(), spotifyCredentials(), getSpotifyAccount(), hardcoverToken(), listApiKeys()]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const message = typeof sp.spotify === "string" ? SPOTIFY_MESSAGES[sp.spotify] : undefined;

  return (
    <div className="space-y-10 pb-6">
      <header>
        <h1 className="display text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted">Saved with your library, so they follow you to every device.</p>
      </header>

      <SettingsForm settings={settings} />

      <section id="spotify" className="max-w-xl scroll-mt-8 space-y-3">
        <h2 className="section-title">Spotify</h2>
        <p className="text-sm text-muted">
          Follow your audiobook listening: when you start or pick up an audiobook on Spotify, its book moves to Currently Reading with your progress.
        </p>
        {message && <p className={`card p-4 text-sm ${message.error ? "border-danger/40 text-danger" : ""}`}>{message.text}</p>}

        <div className="card divide-y divide-line">
          {account ? (
            <div className="space-y-4 p-5">
              <p className="text-sm">
                Connected{account.display_name ? ` as ${account.display_name}` : ""}.
                {account.last_synced_at && (
                  <span className="text-muted">
                    {" "}
                    Last synced {new Date(account.last_synced_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.
                  </span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/spotify" className="btn btn-primary rounded-full px-4">
                  Your audiobooks
                </Link>
                <form action={syncNowAction}>
                  <SubmitButton className="btn rounded-full px-4" pending="Syncing…">
                    Sync now
                  </SubmitButton>
                </form>
                <form action={disconnectAction}>
                  <ConfirmButton className="btn rounded-full px-4" message="Disconnect Spotify? Synced progress is removed." confirmLabel="Disconnect">
                    Disconnect
                  </ConfirmButton>
                </form>
              </div>
            </div>
          ) : keys ? (
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <p className="text-sm text-muted">Connect your Spotify account. BookBox only reads your saved audiobooks and listening positions.</p>
              {/* A full page load: this goes to Spotify and back. */}
              <a href="/api/spotify/connect" className="btn btn-primary rounded-full px-5">
                Connect Spotify
              </a>
            </div>
          ) : null}

          <div className="space-y-4 p-5 text-sm">
            <h3 className="font-medium">Spotify app keys</h3>
            {keys?.from === "environment" ? (
              <p className="text-muted">Set on the host (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET), so there&rsquo;s nothing to enter here.</p>
            ) : (
              <>
                {keys ? (
                  <p className="text-muted">Saved. The secret isn&rsquo;t shown again; paste new keys to replace them.</p>
                ) : (
                  <ol className="list-decimal space-y-2 pl-5 text-muted">
                    <li>
                      On the{" "}
                      <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-ink underline">
                        Spotify developer dashboard
                      </a>
                      , create an app (any name) and tick <span className="text-ink">Web API</span>. Spotify requires the account that owns it to have Premium.
                    </li>
                    <li>
                      Add this redirect URI:{" "}
                      <code className="rounded bg-raised px-1.5 py-0.5 break-all text-ink">{callbackUrl(origin.replace("//localhost", "//127.0.0.1"))}</code>
                      {origin.includes("//localhost") && <> (Spotify doesn&rsquo;t accept &ldquo;localhost&rdquo;, so open BookBox at 127.0.0.1 to connect locally)</>}
                    </li>
                    <li>Copy the app&rsquo;s Client ID and Client secret here.</li>
                  </ol>
                )}
                <SpotifyKeysForm replacing={!!keys} />
                {keys && (
                  <form action={removeSpotifyKeysAction}>
                    <ConfirmButton className="text-xs text-faint hover:text-danger" message="Remove the keys? Spotify is disconnected too." confirmLabel="Remove">
                      Remove keys
                    </ConfirmButton>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section id="hardcover" className="max-w-xl scroll-mt-8 space-y-3">
        <h2 className="section-title">Hardcover</h2>
        <p className="text-sm text-muted">
          Shows the books in each of your series that you don&rsquo;t have yet, on its series page, ready to add to To Read.
        </p>
        <div className="card space-y-4 p-5 text-sm">
          {hardcover?.from === "environment" ? (
            <p className="text-muted">Set on the host (HARDCOVER_TOKEN), so there&rsquo;s nothing to enter here.</p>
          ) : (
            <>
              {hardcover ? (
                <p className="text-muted">Saved. The token isn&rsquo;t shown again; paste a new one to replace it.</p>
              ) : (
                <p className="text-muted">
                  Sign in to Hardcover (a free account is fine), open{" "}
                  <a href="https://hardcover.app/account/api" target="_blank" rel="noreferrer" className="text-ink underline">
                    Hardcover API
                  </a>{" "}
                  in your account settings, make a token, and paste it here.
                </p>
              )}
              <HardcoverTokenForm replacing={!!hardcover} />
              {hardcover && (
                <form action={removeHardcoverTokenAction}>
                  <ConfirmButton className="text-xs text-faint hover:text-danger" message="Remove the Hardcover token?" confirmLabel="Remove">
                    Remove token
                  </ConfirmButton>
                </form>
              )}
            </>
          )}
        </div>
      </section>

      <section id="api" className="max-w-xl scroll-mt-8 space-y-3">
        <h2 className="section-title">API keys</h2>
        <p className="text-sm text-muted">
          Let other apps read your stats and what you&rsquo;re reading, like a home screen widget made with Scriptable. Make a key for each app, so you can
          revoke one without the others. Keys can only read. See{" "}
          <a href="https://github.com/helenvholmes/bookbox/blob/main/docs/api.md" target="_blank" rel="noreferrer" className="text-ink underline">
            the API docs
          </a>
          .
        </p>
        <div className="card divide-y divide-line text-sm">
          {apiKeys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-5">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{k.name}</p>
                <p className="text-xs text-muted">
                  <code className="font-mono">{k.prefix}…</code> · made {shortDate(k.createdAt)} · {k.lastUsedAt ? `last used ${shortDate(k.lastUsedAt)}` : "not used yet"}
                </p>
                {k.origins.length > 0 && <p className="text-xs break-all text-muted">Websites: {k.origins.join(", ")}</p>}
              </div>
              <form action={deleteApiKeyAction}>
                <input type="hidden" name="id" value={k.id} />
                <ConfirmButton className="text-xs text-faint hover:text-danger" message={`Revoke the key for ${k.name}? Apps using it stop working.`} confirmLabel="Revoke">
                  Revoke
                </ConfirmButton>
              </form>
              <ApiKeyOriginsForm id={k.id} origins={k.origins} />
            </div>
          ))}
          <div className="space-y-3 p-5">
            {apiKeys.length > 0 && <h3 className="font-medium">New key</h3>}
            <NewApiKeyForm />
          </div>
        </div>
      </section>

      <GoodreadsImport />

      <LibbyImport />

      <section id="tidy-up" className="max-w-xl scroll-mt-8 space-y-3">
        <h2 className="section-title">Tidy up</h2>
        <div className="card divide-y divide-line">
          {TIDY_UP.map((t) => (
            <Link key={t.href} href={t.href} className="flex items-center justify-between gap-4 p-4 hover:bg-raised">
              <span>
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="block text-sm text-muted">{t.text}</span>
              </span>
              <span aria-hidden className="text-faint">
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>

      {authEnabled() && (
        <section className="max-w-xl space-y-3">
          <h2 className="section-title">Sign out</h2>
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="max-w-sm text-sm text-muted">
              Signs out this device and removes the copy of your library it keeps for offline use. To sign out every device at once, change your password
              (BOOKBOX_PASSWORD) on your host.
            </p>
            <SignOutButton className="btn rounded-full px-4" />
          </div>
        </section>
      )}
    </div>
  );
}

/** "Oct 14, 2026" from SQLite's UTC "2026-10-14 08:12:00". */
function shortDate(s: string) {
  return new Date(`${s.replace(" ", "T")}Z`).toLocaleDateString("en-US", { dateStyle: "medium" });
}
