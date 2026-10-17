import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { coverStore } from "./cover-store";
import { COVERS_DIR, currentLibrary, db, mainLibrary } from "./db";
import { allowed, billingPeriod, countRead, countUpload, FREE, getUsage, STOP_AT } from "./storage-meter";

/**
 * Covers live in Cloudflare R2 or a private Vercel Blob store when hosted (see cover-store.ts),
 * and in data/covers otherwise. Either way the database stores only the filename and pages load
 * them through /covers/<file>, which is behind the password. Hosted uploads and reads are
 * counted, and stop short of the free tier (see storage-meter.ts).
 *
 * The main library's covers sit at the top (covers/<file>); each other person's in a folder of their
 * own (covers/a<account id>/<file>), since two libraries can have a book with the same id.
 */
const store = coverStore(process.env);

/** Covers one library may keep, so one person can't use up the shared free storage. */
export const MAX_COVERS = 5000;

/** Where the current library's covers go, under covers/. */
async function stored(filename: string) {
  const library = await currentLibrary();
  const name = path.basename(filename);
  return library.url === mainLibrary().url ? name : `a${library.accountId}/${name}`;
}

/** Whether the current library already has as many covers as it may keep. */
export async function coverLimitReached() {
  const row = (await db.prepare("SELECT COUNT(*) AS n FROM books WHERE cover IS NOT NULL").get()) as { n: number };
  return Number(row.n) >= MAX_COVERS;
}

/** Whether new covers can't be saved right now, because this period's free uploads are nearly used up. */
export async function coverUploadsPaused() {
  return !!store && !(await allowed(store.name, "upload"));
}

/** This billing period's hosted cover uploads and reads against the free tier, for Settings. Null when covers are local files. */
export async function coverStorageUsage() {
  if (!store) return null;
  const usage = await getUsage(store.name, true);
  return { store: store.name, usage, free: FREE[store.name], stopAt: STOP_AT, period: billingPeriod() };
}

/** Stores a cover, or returns false when uploads are paused or the library has all the covers it may keep. */
async function writeCover(filename: string, data: Buffer) {
  if (await coverLimitReached()) return false;
  const name = await stored(filename);
  if (store) {
    if (!(await allowed(store.name, "upload"))) return false;
    await store.put(name, data);
    await countUpload(store.name);
    return true;
  }
  const file = path.join(COVERS_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return true;
}

/** The stored cover as a body for a Response, or null when it doesn't exist. */
export async function readCover(filename: string): Promise<BodyInit | null> {
  const name = await stored(filename);
  if (store) {
    if (!(await allowed(store.name, "read"))) return null;
    countRead(store.name);
    return store.get(name);
  }
  try {
    return new Uint8Array(await fs.promises.readFile(path.join(COVERS_DIR, name))) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
}

const MAX_WIDTH = 600;

/**
 * Resizes and stores a cover image, returning its filename (or null when it isn't an image, or
 * uploads are paused). Filenames include a content hash so a replaced cover gets a new URL and can
 * be cached forever.
 */
export async function saveCover(bookId: number, input: Buffer): Promise<string | null> {
  const image = sharp(input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  // OpenLibrary and Airtable both hand out 1x1 placeholders for missing covers.
  if (!meta.width || !meta.height || meta.width < 20 || meta.height < 20) return null;

  const out = await image
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const hash = crypto.createHash("sha1").update(out).digest("hex").slice(0, 8);
  const filename = `${bookId}-${hash}.webp`;
  return (await writeCover(filename, out)) ? filename : null;
}

export async function isUsableImage(input: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(input).metadata();
    return !!meta.width && !!meta.height && meta.width >= 20 && meta.height >= 20;
  } catch {
    return false;
  }
}

export async function deleteCover(filename: string | null | undefined) {
  if (!filename) return;
  const name = await stored(filename);
  if (store) await store.remove(name);
  else fs.rmSync(path.join(COVERS_DIR, name), { force: true });
}

const ALLOWED_COVER_HOSTS = new Set(["covers.openlibrary.org", "archive.org", "inventaire.io"]);

/** Downloads a cover from OpenLibrary or Inventaire. Other hosts are refused so the server can't be pointed anywhere. */
export async function fetchCover(url: string): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_COVER_HOSTS.has(parsed.hostname)) return null;
  const res = await fetch(parsed, { redirect: "follow", headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const finalHost = new URL(res.url).hostname;
  if (!finalHost.endsWith("archive.org") && !ALLOWED_COVER_HOSTS.has(finalHost)) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Downloads a cover from OverDrive's image CDN (img1.od-cdn.com and the like), for books imported from Libby. */
export async function fetchLibbyImage(url: string): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".od-cdn.com")) return null;
  const res = await fetch(parsed, { redirect: "error" }).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/** Downloads audiobook art from Spotify's image CDN, for books added from Spotify that OpenLibrary has no cover for. */
export async function fetchSpotifyImage(url: string): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "i.scdn.co") return null;
  const res = await fetch(parsed, { redirect: "error" }).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

export const USER_AGENT = "BookBox/1.0 (personal reading log)";
