/**
 * Empties the browser's HTTP cache for this site, for signing out. Covers are cached for a year under
 * their filename, and two libraries can have a cover with the same name, so on a shared device the next
 * person to sign in could otherwise be shown the last person's.
 */
export function POST() {
  return new Response(null, { status: 204, headers: { "Clear-Site-Data": '"cache"' } });
}
