import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/AccountForms";
import { InviteForm } from "@/components/InviteForm";
import { ApiKeyOriginsForm, NewApiKeyForm } from "@/components/ApiKeyForms";
import { ConfirmButton } from "@/components/ConfirmButton";
import { GoodreadsImport } from "@/components/GoodreadsImport";
import { HardcoverTokenForm } from "@/components/HardcoverTokenForm";
import { HomeScreenHelp } from "@/components/HomeScreenHelp";
import { LibbyConnectForm } from "@/components/LibbyConnectForm";
import { LibbyImport } from "@/components/LibbyImport";
import { SettingsForm } from "@/components/SettingsForm";
import { SignOutButton } from "@/components/SignOutButton";
import { listApiKeys } from "@/lib/api-keys";
import { coverStorageUsage } from "@/lib/covers";
import { SpotifyKeysForm } from "@/components/SpotifyKeysForm";
import { SubmitButton } from "@/components/SubmitButton";
import { hardcoverToken } from "@/lib/hardcover";
import { libbyStatus } from "@/lib/libby-sync";
import { isOwner, listAccounts } from "@/lib/accounts";
import { openInvites } from "@/lib/invites";
import { currentAccount } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { callbackUrl, getSpotifyAccount, spotifyCredentials } from "@/lib/spotify";
import { disconnectAction, syncNowAction } from "../spotify/actions";
import { revokeInviteAction } from "./actions";
import { deleteApiKeyAction, disconnectLibbyAction, removeHardcoverTokenAction, removeSpotifyKeysAction, syncLibbyNowAction } from "./actions";

export const metadata = { title: "Settings" };

const TIDY_UP = [
  {
    href: "/missing-covers",
    title: "Missing covers",
    text: "Books without a cover, with ISBN matches first.",
  },
  {
    href: "/missing-isbns",
    title: "Missing ISBNs",
    text: "Books without an ISBN, which OpenLibrary needs to look them up.",
  },
  {
    href: "/duplicates",
    title: "Duplicates",
    text: "Books that share an ISBN or title.",
  },
  {
    href: "/authors",
    title: "Authors",
    text: "Each author’s gender, from Wikidata, for the Stats breakdown.",
  },
  {
    href: "/refresh",
    title: "OpenLibrary refresh",
    text: "Fills empty details from OpenLibrary and lists differences to review.",
  },
];

const SPOTIFY_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  connected: {
    text: "Spotify is connected. Your audiobooks are on the Spotify page.",
  },
  setup: { text: "Add your Spotify app’s keys first.", error: true },
  denied: {
    text: "Spotify wasn’t connected: the request was declined.",
    error: true,
  },
  state: {
    text: "That sign-in link had expired. Try connecting again.",
    error: true,
  },
  connect: {
    text: "Spotify didn’t accept the connection. Check the keys and the redirect URI below, then try again.",
    error: true,
  },
};

export default async function SettingsPage(props: PageProps<"/settings">) {
  await connection();
  const sp = await props.searchParams;
  const [settings, keys, spotifyAccount, hardcover, apiKeys, libby, storage, account] = await Promise.all([
    getSettings(),
    spotifyCredentials(),
    getSpotifyAccount(),
    hardcoverToken(),
    listApiKeys(),
    libbyStatus(),
    coverStorageUsage(),
    currentAccount(),
  ]);
  // Without accounts (a copy on your own computer) you're the owner of the only library.
  const siteOwner = !account || isOwner(account);
  const [people, invites] = account && siteOwner ? await Promise.all([listAccounts(), openInvites()]) : [[], []];
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

      <HomeScreenHelp />

      <section id="spotify" className="max-w-xl scroll-mt-8 space-y-3">
        <h2 className="section-title">Spotify</h2>
        <p className="text-sm text-muted">
          Follow your audiobook listening: when you start or pick up an audiobook on Spotify, its book moves to Currently Reading with your progress.
        </p>
        {message && <p className={`card p-4 text-sm ${message.error ? "border-danger/40 text-danger" : ""}`}>{message.text}</p>}

        <div className="card divide-y divide-line">
          {spotifyAccount ? (
            <div className="space-y-4 p-5">
              <p className="text-sm">
                Connected
                {spotifyAccount.display_name ? ` as ${spotifyAccount.display_name}` : ""}.
                {spotifyAccount.last_synced_at && (
                  <span className="text-muted">
                    {" "}
                    Last synced {new Date(spotifyAccount.last_synced_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.
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
                      {origin.includes("//localhost") && (
                        <> (Spotify doesn&rsquo;t accept &ldquo;localhost&rdquo;, so open BookBox at 127.0.0.1 to connect locally)</>
                      )}
                    </li>
                    <li>Copy the app&rsquo;s Client ID and Client secret here.</li>
                  </ol>
                )}
                <SpotifyKeysForm replacing={!!keys} />
                {keys && (
                  <form action={removeSpotifyKeysAction}>
                    <ConfirmButton
                      className="text-xs text-faint hover:text-danger"
                      message="Remove the keys? Spotify is disconnected too."
                      confirmLabel="Remove"
                    >
                      Remove keys
                    </ConfirmButton>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section id="libby" className="max-w-xl scroll-mt-8 space-y-3">
        <h2 className="section-title">Libby</h2>
        <p className="text-sm text-muted">
          Follow your library loans: a book you borrow moves to Currently Reading with its library and due date, and when it goes back it moves to Read. Holds
          you don&rsquo;t have yet go on To Read.
        </p>
        <div className="card divide-y divide-line text-sm">
          {libby && (
            <div className="space-y-4 p-5">
              <p>
                Connected{libby.libraries ? ` to ${libby.libraries}` : ""}.{" "}
                <span className="text-muted">
                  {libby.loans} {libby.loans === 1 ? "loan" : "loans"}, {libby.holds} {libby.holds === 1 ? "hold" : "holds"}.
                  {libby.lastSyncedAt && (
                    <>
                      {" "}
                      Last synced{" "}
                      {new Date(libby.lastSyncedAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      .
                    </>
                  )}
                </span>
              </p>
              {libby.error && <p className="text-danger">{libby.error}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <form action={syncLibbyNowAction}>
                  <SubmitButton className="btn rounded-full px-4" pending="Syncing…">
                    Sync now
                  </SubmitButton>
                </form>
                <form action={disconnectLibbyAction}>
                  <ConfirmButton className="btn rounded-full px-4" message="Disconnect Libby? Your books stay as they are." confirmLabel="Disconnect">
                    Disconnect
                  </ConfirmButton>
                </form>
              </div>
            </div>
          )}
          <div className="space-y-4 p-5">
            <h3 className="font-medium">{libby ? "Connect again" : "Follow your loans"}</h3>
            <ol className="list-decimal space-y-2 pl-5 text-muted">
              <li>
                In the Libby app, open <span className="text-ink">Settings → Copy To Another Device</span> and pick the option that shows a code (
                <a href="https://help.libbyapp.com/en-us/6070.htm" target="_blank" rel="noreferrer" className="text-ink underline">
                  Libby&rsquo;s help
                </a>{" "}
                has the steps).
              </li>
              <li>Type the 8-digit code here within a minute.</li>
            </ol>
            <p className="text-xs text-faint">
              Libby has no API for other apps, so this uses the private one the Libby app uses, and may stop working if Libby changes it. BookBox only reads
              your loans and holds. Returned books count as read, so change any you didn&rsquo;t finish to Abandoned.
            </p>
            <LibbyConnectForm reconnecting={!!libby} />
          </div>
          <LibbyImport />
        </div>
      </section>

      <GoodreadsImport />

      {/* A token set on the host covers every library, so there's nothing for anyone to do here. */}
      {hardcover?.from !== "environment" && (
        <section id="hardcover" className="max-w-xl scroll-mt-8 space-y-3">
          <h2 className="section-title">Hardcover</h2>
          <p className="text-sm text-muted">
            Shows the books in each of your series that you don&rsquo;t have yet, on its series page, ready to add to To Read.
          </p>
          <div className="card space-y-4 p-5 text-sm">
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
          </div>
        </section>
      )}

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
                  <code className="font-mono">{k.prefix}…</code> · made {shortDate(k.createdAt)} ·{" "}
                  {k.lastUsedAt ? `last used ${shortDate(k.lastUsedAt)}` : "not used yet"}
                </p>
                {k.origins.length > 0 && <p className="text-xs break-all text-muted">Websites: {k.origins.join(", ")}</p>}
              </div>
              <form action={deleteApiKeyAction}>
                <input type="hidden" name="id" value={k.id} />
                <ConfirmButton
                  className="text-xs text-faint hover:text-danger"
                  message={`Revoke the key for ${k.name}? Apps using it stop working.`}
                  confirmLabel="Revoke"
                >
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

      {storage && (
        <section id="storage" className="max-w-xl scroll-mt-8 space-y-3">
          <h2 className="section-title">Cover storage</h2>
          <p className="text-sm text-muted">
            Covers are kept in {storage.store === "r2" ? "Cloudflare R2" : "Vercel Blob"}. To stay within its free tier, BookBox stops saving new covers (or
            showing stored ones) once {Math.round(storage.stopAt * 100)}% of either free amount is used, until the next period starts on{" "}
            {dayDate(storage.period.next)}.
          </p>
          <div className="card divide-y divide-line text-sm">
            {(["upload", "read"] as const).map((op) => {
              const used = storage.usage[op];
              const stop = Math.floor(storage.free[op] * storage.stopAt);
              const paused = used >= stop;
              return (
                <div key={op} className="space-y-2 p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-medium">{op === "upload" ? "New covers saved" : "Covers loaded"}</p>
                    <p className={`tabular-nums ${paused ? "text-danger" : "text-muted"}`}>
                      {used.toLocaleString("en-US")} of {stop.toLocaleString("en-US")}
                    </p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${Math.round((used / stop) * 100)}% used`}>
                    <div
                      className={`h-full rounded-full ${paused ? "bg-danger" : "bg-accent"}`}
                      style={{
                        width: `${Math.min(100, (used / stop) * 100)}%`,
                      }}
                    />
                  </div>
                  {paused && <p className="text-xs text-danger">Paused until {dayDate(storage.period.next)}.</p>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-faint">
            Loads count once per cover per device; browsers keep covers after that. Counts since {dayDate(storage.period.start)}.
          </p>
        </section>
      )}

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

      {account && siteOwner && (
        <section id="people" className="max-w-xl scroll-mt-8 space-y-3">
          <h2 className="section-title">People</h2>
          <p className="text-sm text-muted">
            Invite family and friends. Each person gets a library of their own, which nobody else can see, you included. They sign in here with their own email
            and password.
          </p>
          <div className="card divide-y divide-line text-sm">
            {people.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <span className="min-w-0 truncate">{p.email}</span>
                <span className="shrink-0 text-xs text-muted">{p.owner ? "You" : `Joined ${shortDate(p.createdAt)}`}</span>
              </div>
            ))}
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="min-w-0 truncate text-muted">
                  Invite{i.note ? ` for ${i.note}` : ""}, until{" "}
                  {new Date(i.expiresAt).toLocaleDateString("en-US", {
                    dateStyle: "medium",
                  })}
                </span>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <ConfirmButton
                    className="text-xs text-faint hover:text-danger"
                    message="Cancel this invite? The link stops working."
                    confirmLabel="Cancel invite"
                  >
                    Cancel
                  </ConfirmButton>
                </form>
              </div>
            ))}
            <div className="p-5">
              <InviteForm />
            </div>
          </div>
        </section>
      )}

      {account && (
        <section id="account" className="max-w-xl scroll-mt-8 space-y-3">
          <h2 className="section-title">Account</h2>
          <div className="card divide-y divide-line text-sm">
            <div className="p-5">
              <ChangeEmailForm email={account.email} />
            </div>
            <div className="space-y-3 p-5">
              <h3 className="font-medium">Password</h3>
              <p className="text-muted">Changing it signs out your other devices.</p>
              <ChangePasswordForm />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <p className="max-w-sm text-muted">Signs out this device and removes the copy of your library it keeps for offline use.</p>
              <SignOutButton className="btn rounded-full px-4" />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** "Oct 14, 2026" from SQLite's UTC "2026-10-14 08:12:00". */
function shortDate(s: string) {
  return new Date(`${s.replace(" ", "T")}Z`).toLocaleDateString("en-US", {
    dateStyle: "medium",
  });
}

/** A YYYY-MM-DD date, as written. */
function dayDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
