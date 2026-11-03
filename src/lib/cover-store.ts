import { AwsClient } from "aws4fetch";

/**
 * Where hosted covers live: a Cloudflare R2 bucket when the R2 keys are set, otherwise a private
 * Vercel Blob store. R2's free tier allows far more reads and uploads than Blob's (whose limit,
 * once passed, blocks the store for 30 days), so R2 is preferred.
 *
 * Takes the environment as an argument so the cloud scripts can pass the keys from .env.cloud.
 * Returns null when neither is set up (covers are then files in DATA_DIR).
 */
export type CoverStore = {
  name: "r2" | "blob";
  put(file: string, data: Uint8Array): Promise<void>;
  /** The cover as a stream, or null when it isn't there. */
  get(file: string): Promise<ReadableStream<Uint8Array> | null>;
  has(file: string): Promise<boolean>;
  remove(file: string): Promise<void>;
};

type Env = Record<string, string | undefined>;

/** A cover's key in the bucket: covers/<file>, or covers/a<account id>/<file> for a person's own library. */
const key = (file: string) => {
  if (!/^(a\d+\/)?[\w-]+\.webp$/.test(file)) throw new Error(`Not a cover name: ${file}`);
  return `covers/${file}`;
};

export function r2Configured(env: Env) {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

function r2Store(env: Env): CoverStore {
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  const url = (file: string) => `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key(file)}`;
  return {
    name: "r2",
    async put(file, data) {
      // Signed, then sent with the bytes as the body. aws.fetch() sends a Request object, whose body
      // Next.js's fetch streams without a Content-Length, and R2 refuses that (411).
      const body = data as Uint8Array<ArrayBuffer>;
      const signed = await aws.sign(url(file), { method: "PUT", body, headers: { "Content-Type": "image/webp" } });
      const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body });
      if (!res.ok) throw new Error(`R2 upload of ${file} failed: ${res.status} ${await res.text()}`);
    },
    async get(file) {
      const res = await aws.fetch(url(file)).catch(() => null);
      return res?.ok ? res.body : null;
    },
    async has(file) {
      const res = await aws.fetch(url(file), { method: "HEAD" }).catch(() => null);
      return !!res?.ok;
    },
    async remove(file) {
      await aws.fetch(url(file), { method: "DELETE" }).catch(() => {});
    },
  };
}

function blobStore(token: string): CoverStore {
  // Loaded on first use, so an R2-only setup never needs the Blob package's token checks.
  const blob = () => import("@vercel/blob");
  return {
    name: "blob",
    async put(file, data) {
      const { put } = await blob();
      await put(key(file), Buffer.from(data), { access: "private", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true, token });
    },
    async get(file) {
      const { get } = await blob();
      const result = await get(key(file), { access: "private", token }).catch(() => null);
      return result?.statusCode === 200 ? result.stream : null;
    },
    async has(file) {
      const { head } = await blob();
      return head(key(file), { token }).then(
        () => true,
        () => false,
      );
    },
    async remove(file) {
      const { del } = await blob();
      await del(key(file), { token }).catch(() => {});
    },
  };
}

export function coverStore(env: Env): CoverStore | null {
  if (r2Configured(env)) return r2Store(env);
  if (env.BLOB_READ_WRITE_TOKEN) return blobStore(env.BLOB_READ_WRITE_TOKEN);
  return null;
}
