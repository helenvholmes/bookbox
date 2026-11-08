/**
 * A share page's accent as it's drawn. The choices (src/lib/share.ts) are pale, made for the dark
 * page; on the light one --share-tone darkens them so the dots and stars still stand out.
 */
export function shownAccent(accent: string) {
  return `color-mix(in oklab, ${accent} var(--share-tone), black)`;
}
