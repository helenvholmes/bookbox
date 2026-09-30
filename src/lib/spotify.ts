import "server-only";
import { getSearchEntries, saveBook, setCover, setStatus } from "./books";
import { fetchCover, fetchSpotifyImage, isUsableImage, saveCover } from "./covers";
import { db, transaction } from "./db";
import { getOpenLibraryDetails, searchOpenLibrary } from "./openlibrary";
import { FINISHED_PERCENT } from "./progress";
import { fold, searchBooks } from "./search";

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

const isBaselined = async () => ((await db.prepare("SELECT baselined FROM spotify_account WHERE id = 1").get()) as { baselined: number } | undefined)?.baselined === 1;

/** A listening position counts as having moved once it differs by this much (Spotify rounds, and a stray tap shouldn't count). */
const MOVED_MS = 30_000;
/** Unlinked audiobooks beyond the newest few are only re-checked this often, to keep each sync to a handful of requests. */
const RECHECK_UNLINKED_MS = 60 * 60 * 1000;
const ALWAYS_CHECK = 5;

/**
 * Syncs Spotify listening into BookBox. Skipped when it ran in the last few minutes, unless
 * `force`. Returns the books that changed.
 *
 * - Linked audiobooks get their progress updated.
 * - An audiobook you start or resume is linked to its book (created from OpenLibrary, or from
 *   Spotify's own details, when it isn't in BookBox yet) and the book moves to Currently
 *   Reading, including one already marked Read that you're listening to again.
 * - "Start or resume" means the listening position moved since the last sync. Audiobooks that
 *   were already part-listened when this first ran are only recorded, not pulled in.
 */
export async function syncSpotify(force = false): Promise<{ synced: boolean; changed: number[] }> {
  const account = await getSpotifyAccount();
  if (!account || !spotifyConfigured()) return { synced: false, changed: [] };
  if (!force && account.last_synced_at && Date.now() - account.last_synced_at < SYNC_EVERY_MS) return { synced: false, changed: [] };
  const now = Date.now();
  await db.prepare("UPDATE spotify_account SET last_synced_at = ? WHERE id = 1").run(now);

  const changed = new Set<number>();
  const links = (await db.prepare("SELECT book_id, audiobook_id FROM spotify_links").all()) as { book_id: number; audiobook_id: string }[];
  const progress = new Map<string, Awaited<ReturnType<typeof listeningProgress>>>();
  const inProgress = (p: { position: number; percent: number }) => p.position > 0 && p.percent < FINISHED_PERCENT;

  // 1. Audiobooks that aren't linked yet: notice the ones you've started or resumed.
  const saved = await all<SpotifyAudiobook>(account, "/me/audiobooks").catch(() => null); // progress for linked books still syncs if this fails
  if (saved) {
    const baselined = await isBaselined();
    const ignored = new Set(((await db.prepare("SELECT audiobook_id FROM spotify_ignored").all()) as { audiobook_id: string }[]).map((r) => r.audiobook_id));
    const seen = new Map(
      ((await db.prepare("SELECT audiobook_id, position_ms, checked_at FROM spotify_seen").all()) as { audiobook_id: string; position_ms: number; checked_at: number }[]).map(
        (r) => [r.audiobook_id, r],
      ),
    );
    const unlinked = saved.filter((a) => !ignored.has(a.id) && !links.some((l) => l.audiobook_id === a.id));
    for (const [i, a] of unlinked.entries()) {
      const before = seen.get(a.id);
      if (baselined && i >= ALWAYS_CHECK && before && now - before.checked_at < RECHECK_UNLINKED_MS) continue;
      const p = await listeningProgress(account, a.id);
      await db
        .prepare("INSERT INTO spotify_seen (audiobook_id, position_ms, checked_at) VALUES (?, ?, ?) ON CONFLICT(audiobook_id) DO UPDATE SET position_ms = excluded.position_ms, checked_at = excluded.checked_at")
        .run(a.id, p.position, now);
      // New to your Spotify library since the baseline, or moved since we last looked.
      const active = baselined && inProgress(p) && (!before || Math.abs(p.position - before.position_ms) >= MOVED_MS);
      if (!active) continue;
      const bookId = await findOrCreateBook(a);
      await linkAudiobook(bookId, a.id, a.name);
      await setStatus(bookId, "Currently Reading");
      links.push({ book_id: bookId, audiobook_id: a.id });
      progress.set(a.id, p);
      changed.add(bookId);
    }
    if (!baselined) await db.prepare("UPDATE spotify_account SET baselined = 1 WHERE id = 1").run();
  }

  // 2. Linked audiobooks: update progress, and bring a book back to Currently Reading when you're listening to it again.
  for (const link of links) {
    const p = progress.get(link.audiobook_id) ?? (await listeningProgress(account, link.audiobook_id));
    if (!p.duration) continue;
    const before = (await db.prepare("SELECT percent, position_ms FROM book_progress WHERE book_id = ? AND source = 'spotify'").get(link.book_id)) as
      | { percent: number; position_ms: number | null }
      | undefined;
    await db
      .prepare(
        `INSERT INTO book_progress (book_id, percent, source, page, position_ms, duration_ms, updated_at) VALUES (?, ?, 'spotify', NULL, ?, ?, datetime('now'))
         ON CONFLICT(book_id) DO UPDATE SET percent = excluded.percent, source = 'spotify', page = NULL, position_ms = excluded.position_ms,
           duration_ms = excluded.duration_ms, updated_at = excluded.updated_at`,
      )
      .run(link.book_id, p.percent, p.position, p.duration);
    if (!before || Math.abs(before.percent - p.percent) >= 0.1) changed.add(link.book_id);
    if (before && inProgress(p) && Math.abs(p.position - (before.position_ms ?? 0)) >= MOVED_MS) {
      const reading = await db
        .prepare("SELECT 1 FROM book_shelves bs JOIN shelves s ON s.id = bs.shelf_id WHERE bs.book_id = ? AND s.name = 'Currently Reading'")
        .get(link.book_id);
      if (!reading) {
        await setStatus(link.book_id, "Currently Reading");
        changed.add(link.book_id);
      }
    }
  }
  return { synced: true, changed: [...changed] };
}

/** "Diavola: A Novel" and "Diavola (Unabridged)" -> "diavola", for comparing titles across catalogues. */
const baseTitle = (title: string) => fold(title.split(/[:(\[]/)[0]);
const lastName = (name: string) => fold(name).split(" ").pop() ?? "";

/** The book for an audiobook: the one already in BookBox with the same title and author, or a new one. */
async function findOrCreateBook(a: SpotifyAudiobook): Promise<number> {
  const author = a.authors[0]?.name ?? "";
  const title = a.name.split(/[:(\[]/)[0].trim() || a.name;
  const entries = (await db.prepare("SELECT id, title, author, additional_authors FROM books").all()) as {
    id: number;
    title: string;
    author: string;
    additional_authors: string;
  }[];
  const linked = new Set(((await db.prepare("SELECT book_id FROM spotify_links").all()) as { book_id: number }[]).map((r) => r.book_id));
  const existing = entries.find(
    (b) => !linked.has(b.id) && baseTitle(b.title) === baseTitle(a.name) && (!author || fold(`${b.author} ${b.additional_authors}`).split(" ").includes(lastName(author))),
  );
  if (existing) return existing.id;

  // Not in BookBox: fill it in from OpenLibrary when it has the same title, otherwise from Spotify's details.
  const match = (await searchOpenLibrary(`${title} ${author}`).catch(() => [])).find((r) => baseTitle(r.title) === baseTitle(a.name));
  const details = match ? await getOpenLibraryDetails(match.work, match.edition).catch(() => null) : null;
  const bookId = await saveBook(null, {
    title: details?.title || match?.title || title,
    author: details?.author || match?.authors[0] || author,
    author_original: "",
    additional_authors: details?.additional_authors ?? a.authors.slice(1).map((x) => x.name).join(", "),
    isbn13: details?.isbn13 ?? match?.isbn13 ?? null,
    rating: null,
    description: details?.description ?? "",
    review: "",
    spoiler: "",
    quotes: "",
    private_notes: "",
    on_kindle: false,
    owned: false,
    publisher: details?.publisher || match?.publisher || "",
    publish_year: details?.publish_year ?? match?.year ?? null,
    pages: details?.pages ?? match?.pages ?? null,
    ol_work: match?.work ?? null,
    ol_edition: details?.ol_edition ?? match?.edition ?? null,
    borrowed: false,
    library: "",
    due_date: null,
    series_name: "",
    series_position: null,
    years: [],
    shelves: ["Currently Reading"],
    tags: [],
    recommendedFor: [],
    recommendedBy: [],
  });

  const coverUrl = details?.coverUrl ?? match?.coverUrl;
  const art = [...a.images].sort((x, y) => y.width - x.width)[0]?.url;
  const image = (coverUrl ? await fetchCover(coverUrl).catch(() => null) : null) ?? (art ? await fetchSpotifyImage(art) : null);
  if (image && (await isUsableImage(image))) {
    const name = await saveCover(bookId, image);
    if (name) await setCover(bookId, name);
  }
  return bookId;
}

export type AudiobookRow = {
  audiobook: { id: string; name: string; authors: string; image: string | null };
  linked: { bookId: number; title: string } | null;
  /** You've said to leave this one alone. */
  ignored: boolean;
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
        ignored: !link && skip.has(a.id),
        candidates: link || skip.has(a.id) ? [] : candidates,
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

/** Unlinks a book and leaves its audiobook alone from now on (otherwise the next sync would link it again). */
export async function unlinkAudiobook(bookId: number) {
  await transaction(async () => {
    await db.prepare("INSERT OR IGNORE INTO spotify_ignored (audiobook_id) SELECT audiobook_id FROM spotify_links WHERE book_id = ?").run(bookId);
    await db.prepare("DELETE FROM spotify_links WHERE book_id = ?").run(bookId);
    await db.prepare("DELETE FROM book_progress WHERE book_id = ? AND source = 'spotify'").run(bookId);
  });
}

export async function restoreAudiobook(audiobookId: string) {
  await db.prepare("DELETE FROM spotify_ignored WHERE audiobook_id = ?").run(audiobookId);
}

export async function ignoreAudiobook(audiobookId: string) {
  await db.prepare("INSERT OR IGNORE INTO spotify_ignored (audiobook_id) VALUES (?)").run(audiobookId);
}
