import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import sharp from "sharp";
import { COVERS_DIR } from "./db";

/**
 * Covers live in a private Vercel Blob store when BLOB_READ_WRITE_TOKEN is set (the Vercel
 * deploy), and in data/covers otherwise. Either way the database stores only the filename and
 * pages load them through /covers/<file>, which is behind the password.
 */
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const blobPath = (filename: string) => `covers/${path.basename(filename)}`;

async function writeCover(filename: string, data: Buffer) {
  if (USE_BLOB) {
    await put(blobPath(filename), data, { access: "private", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  fs.writeFileSync(path.join(COVERS_DIR, filename), data);
}

/** The stored cover as a body for a Response, or null when it doesn't exist. */
export async function readCover(filename: string): Promise<BodyInit | null> {
  if (USE_BLOB) {
    const result = await get(blobPath(filename), { access: "private" }).catch(() => null);
    return result?.statusCode === 200 ? result.stream : null;
  }
  try {
    return new Uint8Array(await fs.promises.readFile(path.join(COVERS_DIR, path.basename(filename)))) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
}

const MAX_WIDTH = 600;

/**
 * Resizes and stores a cover image, returning its filename. Filenames include a
 * content hash so a replaced cover gets a new URL and can be cached forever.
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
  await writeCover(filename, out);
  return filename;
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
  if (USE_BLOB) await del(blobPath(filename)).catch(() => {});
  else fs.rmSync(path.join(COVERS_DIR, path.basename(filename)), { force: true });
}

const ALLOWED_COVER_HOSTS = new Set(["covers.openlibrary.org", "archive.org"]);

/** Downloads a cover from OpenLibrary. Other hosts are refused so the server can't be pointed anywhere. */
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

export const USER_AGENT = "BookBox/1.0 (personal reading log)";
