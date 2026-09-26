import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for self-hosting; Vercel builds its own functions.
  output: process.env.VERCEL ? undefined : "standalone",
  // The database and covers live in DATA_DIR at runtime; never bundle them into the build.
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./scripts/**/*"] },
  // The service worker must always be revalidated, or a stale one keeps serving old pages.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
  experimental: {
    // Navigations and saves made while the connection drops wait and retry instead of failing.
    useOffline: true,
    // Cover photos are downscaled in the browser first; this is headroom for when that isn't possible.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
