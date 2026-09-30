import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SettingsForm } from "@/components/SettingsForm";
import { SpotifyKeysForm } from "@/components/SpotifyKeysForm";
import { SubmitButton } from "@/components/SubmitButton";
import { getSettings } from "@/lib/settings";
import { callbackUrl, getSpotifyAccount, spotifyCredentials } from "@/lib/spotify";
import { disconnectAction, syncNowAction } from "../spotify/actions";
import { removeSpotifyKeysAction } from "./actions";

export const metadata = { title: "Settings" };

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
  const [settings, keys, account] = await Promise.all([getSettings(), spotifyCredentials(), getSpotifyAccount()]);
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
    </div>
  );
}
