import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { COVERS_DIR } from "./db";

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
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  fs.writeFileSync(path.join(COVERS_DIR, filename), out);
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

export function deleteCover(filename: string | null | undefined) {
  if (!filename) return;
  const file = path.join(COVERS_DIR, path.basename(filename));
  fs.rmSync(file, { force: true });
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
