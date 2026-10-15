/**
 * Whether the browser's Back button leads to another BookBox page, so forms can step back to the
 * page you opened them from instead of leaving themselves in the history. Counts the pages seen
 * since the app loaded (Nav reports each one); a reload starts over, since the history before it
 * can't be read.
 */

let pages = 0;
let last: string | null = null;

export function notePage(pathname: string) {
  if (pathname === last) return;
  last = pathname;
  pages++;
}

export const hasPageBefore = () => pages > 1;

/** The pages you've been on since the app loaded, with their filters ("/library?shelf=To+Read"), newest last. */
const places: string[] = [];

export function notePlace(href: string) {
  if (places.at(-1) === href) return;
  places.push(href);
  if (places.length > 50) places.shift();
}

/**
 * The last page you were on that isn't under `prefix` (a book's own page and its edit form, say),
 * for where to go once that book is deleted. Null when there's none, like after a reload.
 */
export function lastPlaceOutside(prefix: string): string | null {
  const inside = (href: string) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`);
  return places.findLast((href) => !inside(href)) ?? null;
}
