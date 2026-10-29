import type { MetadataRoute } from "next";
import { demoMode } from "@/lib/demo";

/**
 * Crawlers may read the page about BookBox and nothing else: everything else needs signing in, and
 * share links (/s/…) are private to whoever has the link (their pages say noindex too). The demo is
 * for trying, not for search results.
 */
export default function robots(): MetadataRoute.Robots {
  if (demoMode()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: ["/$", "/about"], disallow: "/" } };
}
