import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
        ],
      },
      // The service worker must always be revalidated, or a stale one keeps serving old pages.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  experimental: {
    // Navigations and saves made while the connection drops wait and retry instead of failing.
    useOffline: true,
    // Cover photos are downscaled in the browser first; this is headroom for when that isn't possible.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
