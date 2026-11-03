/** Starts the app for the tests: a fresh, empty library and no sign-in, with the catalogs stubbed (catalog-stub.mjs), or the demo. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// Each server wipes its own folder: Playwright starts them one after the other, and the demo's wiping the
// other's would delete the database under a server that has already set it up.
const data = path.join(import.meta.dirname, process.env.DEMO === "1" ? ".data-demo" : ".data");
fs.rmSync(data, { recursive: true, force: true });
fs.mkdirSync(data);

const env = { ...process.env, DATA_DIR: data, NODE_OPTIONS: `--import ${path.join(import.meta.dirname, "catalog-stub.mjs")}` };
// A local library with no sign-in, whatever .env.local says (set here, these win over it). Covers go to
// R2 as on the hosted site, with made-up keys: catalog-stub.mjs answers for R2 from memory.
for (const k of ["BOOKBOX_PASSWORD", "BOOKBOX_SECRET", "VERCEL", "TURSO_AUTH_TOKEN", "TURSO_API_TOKEN", "ACCOUNTS_DATABASE_URL", "BLOB_READ_WRITE_TOKEN"]) env[k] = "";
env.TURSO_DATABASE_URL = `file:${path.join(data, "bookbox.db")}`;
Object.assign(env, { R2_ACCOUNT_ID: "e2e", R2_ACCESS_KEY_ID: "e2e", R2_SECRET_ACCESS_KEY: "e2e", R2_BUCKET: "covers" });

// DEMO=1: the public demo instead (throwaway libraries from the snapshot, no database at all), with its own
// build folder so it can run beside the other test server. It refuses to start with real keys set.
if (process.env.DEMO === "1") {
  delete env.TURSO_DATABASE_URL;
  for (const k of ["HARDCOVER_TOKEN", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) env[k] = "";
  env.BOOKBOX_DEMO = "1";
  env.BOOKBOX_DIST_DIR = ".next/e2e-demo";
}

const port = process.env.PORT ?? "3210";
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-p", port], { cwd: root, env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
