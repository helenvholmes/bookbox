import type { NextConfig } from "next";
import { checkDemoEnvironment, demoMode } from "./src/lib/demo";

/**
 * Where the browser may load things from. Everything BookBox fetches is its own (covers come through
 * /covers, lookups through /api), so only images may come from elsewhere: Hardcover's, Open
 * Library's and Inventaire's cover suggestions. Inline scripts stay allowed because Next.js streams pages with them
 * (nonces would need every page, the offline one included, rendered per visit); scripts from other
 * sites, plugins, framing, and forms posting elsewhere are all refused.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");

// The public demo (see src/lib/demo.ts). It won't even build with keys for anything real set.
const demo = demoMode();
checkDemoEnvironment();

const nextConfig: NextConfig = {
  // The tests run a demo server beside the normal one (e2e/serve.mjs), and each dev server needs its own folder.
  ...(process.env.BOOKBOX_DIST_DIR ? { distDir: process.env.BOOKBOX_DIST_DIR } : {}),
  // Built in, so the browser knows it's the demo too (demoMode() in src/lib/demo.ts).
  env: { BOOKBOX_DEMO: demo ? "1" : "" },
  // No "N" badge in the corner during development (build and runtime errors still show).
  devIndicators: false,
  // Standalone output is for self-hosting; Vercel builds its own functions.
  output: process.env.VERCEL ? undefined : "standalone",
  // The database and covers live in DATA_DIR at runtime; never bundle them into the build.
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./scripts/**/*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Other sites can't show BookBox in a frame (so a page can't trick you into clicking its buttons).
          { key: "X-Frame-Options", value: "DENY" },
          // Files are only treated as the type they're served as.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Links to other sites send only "bookbox.lol", never the page (share-page links carry their token).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The camera is for the barcode scanner on this site only; nothing else is used.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
      // The service worker must always be revalidated, or a stale one keeps serving old pages.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      // The demo is for trying BookBox, not for finding in search results.
      ...(demo ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : []),
    ];
  },
  // The demo has no accounts: its front page is the library, and signing in, signing up and invites go there too.
  async redirects() {
    if (!demo) return [];
    return ["/", "/login", "/signup", "/join/:code"].map((source) => ({ source, destination: "/library", permanent: false }));
  },
  experimental: {
    // Navigations and saves made while the connection drops wait and retry instead of failing.
    useOffline: true,
    // Cover photos are downscaled in the browser first; this is headroom for when that isn't possible.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
