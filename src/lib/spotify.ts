import "server-only";
import { db, transaction } from "./db";
import { getSearchEntries } from "./books";
import { searchBooks } from "./search";

/**
 * Listening progress from Spotify audiobooks. You connect your account once; BookBox keeps the
 * refresh token, finds the audiobooks saved in your Spotify library, and (for the ones you've
 * linked to a book) adds up how much you've listened to: finished chapters in full, plus how far
 * into the current one you are.
 *
 * Needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from a Spotify developer app, whose redirect
 * URIs include <site>/api/spotify/callback. Spotify only serves audiobooks in some countries.
 */

const SCOPES = "user-library-read user-read-playback-position";
/** Holds the OAuth state value between /api/spotify/connect and the callback. */
export const STATE_COOKIE = "bookbox_spotify_state";
const API = "https://api.spotify.com/v1";
/** Don't ask Spotify more often than this when the app is opened repeatedly. */
const SYNC_EVERY_MS = 5 * 60 * 1000;

export const spotifyConfigured = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

export const callbackUrl = (origin: string) => `${origin}/api/spotify/callback`;

export function authorizeUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: callbackUrl(origin),
    scope: SCOPES,
    state,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new SpotifyError(`Spotify sign-in failed (${res.status})`, res.status);
  return (await res.json()) as Tokens;
}

export class SpotifyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Finishes connecting: swaps the code from Spotify's redirect for tokens and remembers the account. */
export async function connectSpotify(code: string, origin: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(origin) });
  if (!t.refresh_token) throw new SpotifyError("Spotify didn't return a refresh token", 500);
  const me = (await (await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as {
    display_name?: string;
    id?: string;
    country?: string;
  };
  await db
    .prepare(
      `INSERT INTO spotify_account (id, display_name, country, access_token, refresh_token, expires_at) VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, country = excluded.country, access_token = excluded.access_token,
         refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, last_synced_at = NULL`,
    )
    .run(me.display_name || me.id || "", me.country ?? null, t.access_token, t.refresh_token, Date.now() + t.expires_in * 1000);
}

export async function disconnectSpotify() {
  await transaction(async () => {
    await db.exec("DELETE FROM spotify_account");
    await db.exec("DELETE FROM book_progress WHERE source = 'spotify'");
  });
}

type Account = { display_name: string; country: string | null; access_token: string; refresh_token: string; expires_at: number; last_synced_at: number | null };

export async function getSpotifyAccount() {
  return (await db.prepare("SELECT display_name, country, access_token, refresh_token, expires_at, last_synced_at FROM spotify_account WHERE id = 1").get()) as
    | Account
    | undefined;
}

async function accessToken(account: Account, force = false): Promise<string> {
  if (!force && account.expires_at - Date.now() > 60_000) return account.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: account.refresh_token });
  // Spotify sometimes rotates the refresh token; keep the old one when it doesn't.
  const refresh = t.refresh_token ?? account.refresh_token;
  const expires = Date.now() + t.expires_in * 1000;
  await db.prepare("UPDATE spotify_account SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1").run(t.access_token, refresh, expires);
  Object.assign(account, { access_token: t.access_token, refresh_token: refresh, expires_at: expires });
  return t.access_token;
}

async function api<T>(account: Account, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await accessToken(account, attempt > 0)}` } });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401 && attempt === 0) continue; // token revoked early; refresh once and retry
    throw new SpotifyError(`Spotify request failed (${res.status})`, res.status);
  }
}

type Paged<T> = { items: T[]; next: string | null };
export type SpotifyAudiobook = { id: string; name: string; authors: { name: string }[]; narrators: { name: string }[]; images: { url: string; width: number }[] };
type Chapter = { duration_ms: number; resume_point?: { fully_played: boolean; resume_position_ms: number } };

async function all<T>(account: Account, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await api<Paged<T>>(account, `${path}${path.includes("?") ? "&" : "?"}limit=50&offset=${offset}`);
    out.push(...page.items.filter(Boolean));
    if (!page.next || page.items.length === 0) return out;
  }
}

const market = (account: Account) => (account.country ? `market=${account.country}` : "");

/** How far through an audiobook you are, from each chapter's resume point. */
async function listeningProgress(account: Account, audiobookId: string) {
  const chapters = await all<Chapter>(account, `/audiobooks/${audiobookId}/chapters?${market(account)}`);
  let position = 0;
  let duration = 0;
  for (const c of chapters) {
    duration += c.duration_ms;
    position += c.resume_point?.fully_played ? c.duration_ms : Math.min(c.resume_point?.resume_position_ms ?? 0, c.duration_ms);
  }
  return { position, duration, percent: duration ? Math.min(100, (position / duration) * 100) : 0 };
}

/**
 * Updates progress for every linked audiobook. Skipped when it ran in the last few minutes,
 * unless `force`. Returns the books whose progress changed.
 */
export async function syncSpotify(force = false): Promise<{ synced: boolean; changed: number[] }> {
  const account = await getSpotifyAccount();
  if (!account || !spotifyConfigured()) return { synced: false, changed: [] };
  if (!force && account.last_synced_at && Date.now() - account.last_synced_at < SYNC_EVERY_MS) return { synced: false, changed: [] };
  await db.prepare("UPDATE spotify_account SET last_synced_at = ? WHERE id = 1").run(Date.now());

  const links = (await db.prepare("SELECT book_id, audiobook_id FROM spotify_links").all()) as { book_id: number; audiobook_id: string }[];
  const changed: number[] = [];
  for (const link of links) {
    const p = await listeningProgress(account, link.audiobook_id);
    if (!p.duration) continue;
    const before = (await db.prepare("SELECT percent FROM book_progress WHERE book_id = ?").get(link.book_id)) as { percent: number } | undefined;
    await db
      .prepare(
        `INSERT INTO book_progress (book_id, percent, source, page, position_ms, duration_ms, updated_at) VALUES (?, ?, 'spotify', NULL, ?, ?, datetime('now'))
         ON CONFLICT(book_id) DO UPDATE SET percent = excluded.percent, source = 'spotify', page = NULL, position_ms = excluded.position_ms,
           duration_ms = excluded.duration_ms, updated_at = excluded.updated_at`,
      )
      .run(link.book_id, p.percent, p.position, p.duration);
    if (!before || Math.abs(before.percent - p.percent) >= 0.1) changed.push(link.book_id);
  }
  return { synced: true, changed };
}

export type AudiobookRow = {
  audiobook: { id: string; name: string; authors: string; image: string | null };
  linked: { bookId: number; title: string } | null;
  /** Books that look like this audiobook, best first, when it isn't linked yet. */
  candidates: { id: number; title: string; author: string }[];
};

/** Your saved Spotify audiobooks, with what each is linked to or might be. */
export async function spotifyLibrary(): Promise<AudiobookRow[]> {
  const account = await getSpotifyAccount();
  if (!account) return [];
  const [saved, links, ignored, entries] = await Promise.all([
    all<SpotifyAudiobook>(account, "/me/audiobooks"),
    db.prepare("SELECT l.book_id, l.audiobook_id, b.title FROM spotify_links l JOIN books b ON b.id = l.book_id").all() as Promise<
      { book_id: number; audiobook_id: string; title: string }[]
    >,
    db.prepare("SELECT audiobook_id FROM spotify_ignored").all() as Promise<{ audiobook_id: string }[]>,
    getSearchEntries(),
  ]);
  const skip = new Set(ignored.map((r) => r.audiobook_id));
  const linkedIds = new Set(links.map((l) => l.book_id));
  return saved
    .filter((a) => !skip.has(a.id))
    .map((a) => {
      const link = links.find((l) => l.audiobook_id === a.id);
      const authors = a.authors.map((x) => x.name).join(", ");
      // Match on the title without its subtitle, plus the first author, falling back to the title alone.
      const title = a.name.split(/[:(]/)[0];
      const hits = searchBooks(entries, `${title} ${a.authors[0]?.name ?? ""}`);
      const candidates = (hits.length ? hits : searchBooks(entries, title))
        .filter((h) => !linkedIds.has(h.entry.id))
        .slice(0, 3)
        .map((h) => ({ id: h.entry.id, title: h.entry.title, author: h.entry.author }));
      return {
        audiobook: { id: a.id, name: a.name, authors, image: [...a.images].sort((x, y) => x.width - y.width)[0]?.url ?? null },
        linked: link ? { bookId: link.book_id, title: link.title } : null,
        candidates: link ? [] : candidates,
      };
    })
    .sort((x, y) => Number(!!x.linked) - Number(!!y.linked) || x.audiobook.name.localeCompare(y.audiobook.name));
}

export async function linkAudiobook(bookId: number, audiobookId: string, name: string) {
  await transaction(async () => {
    await db.prepare("DELETE FROM spotify_links WHERE book_id = ? OR audiobook_id = ?").run(bookId, audiobookId);
    await db.prepare("INSERT INTO spotify_links (book_id, audiobook_id, name) VALUES (?, ?, ?)").run(bookId, audiobookId, name);
    await db.prepare("DELETE FROM spotify_ignored WHERE audiobook_id = ?").run(audiobookId);
  });
}

export async function unlinkAudiobook(bookId: number) {
  await transaction(async () => {
    await db.prepare("DELETE FROM spotify_links WHERE book_id = ?").run(bookId);
    await db.prepare("DELETE FROM book_progress WHERE book_id = ? AND source = 'spotify'").run(bookId);
  });
}

export async function ignoreAudiobook(audiobookId: string) {
  await db.prepare("INSERT OR IGNORE INTO spotify_ignored (audiobook_id) VALUES (?)").run(audiobookId);
}
