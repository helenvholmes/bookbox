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

/**
 * How far down each place you were when you last left it, by the same keys as `places`, and the
 * book at the top of the screen then: grids only estimate the height of cards you haven't reached,
 * so lining that book up again is what puts you back exactly.
 */
const scrolledTo = new Map<string, { y: number; anchor: { href: string; top: number } | null }>();
/** A place to put back where you were, once you arrive there (see scrollBackOnArrival). */
let restoring: string | null = null;

/** "/library?shelf=To+Read", the same way Nav notes places. */
export const placeOf = (pathname: string, search: string) => {
  const query = new URLSearchParams(search).toString();
  return query ? `${pathname}?${query}` : pathname;
};

/**
 * Notes how far down this page you are, as you leave it by tapping `link` (Nav calls this on every
 * tap of a link). The tapped book isn't used to line things up, since it may be about to be deleted.
 */
export function rememberScroll(link: Element) {
  const top = [...document.querySelectorAll("main a[href^='/books/']")].find((a) => a !== link && a.getBoundingClientRect().bottom > 0);
  const anchor = top ? { href: top.getAttribute("href")!, top: top.getBoundingClientRect().top } : null;
  scrolledTo.set(placeOf(window.location.pathname, window.location.search), { y: window.scrollY, anchor });
}

/** On arriving at `href` next, scroll back to where you were on it (after deleting a book, say). */
export function scrollBackOnArrival(href: string) {
  restoring = href;
}

/**
 * Nav calls this on every page. When it's the one to put back, scrolls there, trying again while
 * the page is still loading or fetching more books, until it's long enough or a few seconds pass.
 * Stops as soon as you scroll yourself.
 */
export function arrivedAt(href: string) {
  if (restoring !== href) return;
  restoring = null;
  const saved = scrolledTo.get(href);
  if (!saved?.y) return;
  const { y, anchor } = saved;
  const started = performance.now();
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const type of STOP_ON) window.removeEventListener(type, stop);
  };
  for (const type of STOP_ON) window.addEventListener(type, stop, { passive: true });
  const step = () => {
    if (stopped) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.min(y, max), behavior: "instant" });
    // Not there yet while the page is long enough but is still its loading skeleton (no books), or too short.
    const el = anchor && document.querySelector(`main a[href="${CSS.escape(anchor.href)}"]`);
    const ready = max >= y && (!anchor || el);
    if (!ready && performance.now() - started < 4000) return void setTimeout(step, 100);
    // Far enough: line the book that was at the top of the screen up where it was, and keep it there
    // for a moment while the cards around it finish laying out (they start at an estimated height).
    if (!anchor || !el) return stop();
    const settle = performance.now();
    const align = () => {
      if (stopped) return;
      const off = el.getBoundingClientRect().top - anchor.top;
      if (Math.abs(off) >= 1) window.scrollBy({ top: off, behavior: "instant" });
      if (performance.now() - settle < 500) requestAnimationFrame(align);
      else stop();
    };
    align();
  };
  requestAnimationFrame(step);
}

const STOP_ON = ["wheel", "touchstart", "keydown"] as const;
