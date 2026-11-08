/**
 * A count with thousands separators: 1284 -> "1,284". Always in English, like the rest of the app, so the server's
 * render and the browser's agree whatever the browser's language.
 */
export const formatCount = (n: number) => n.toLocaleString("en-US");
