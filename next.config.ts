import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The database and covers live in DATA_DIR at runtime; never bundle them into the build.
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./scripts/**/*"] },
  experimental: {
    // Cover photos are downscaled in the browser first; this is headroom for when that isn't possible.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
