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
