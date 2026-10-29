# BookBox API

A small, read-only JSON API for other apps: a home screen widget, another website, a Shortcut. It lives at `/api/v1/` on your BookBox (for example `https://bookbox.lol/api/v1/summary`).

## Keys

Make a key in **Settings → API keys**, one per app, so you can revoke one without breaking the others. The key is shown once; BookBox keeps only a hash of it.

Send it in the `Authorization` header (never in the address, where it would end up in logs):

```
Authorization: Bearer bbx_…
```

Keys can only read. Settings shows when each key was last used (updated at most once an hour).

### From a browser (CORS)

A web page on another site can call the API only if its key lists that site. Add the site under the key in Settings, as `https://example.com` (`http://localhost:3000` works for development). Requests from servers, Scriptable and Shortcuts don't send an origin, so they need no websites listed.

Anything in a web page's code can be read by its visitors, key included. Use a browser key only on a site that's yours, or call the API from your other app's server instead, where the key stays private.

### Bot protection

If your BookBox is on Vercel with **Firewall → Bot Protection** turned on (bookbox.lol is), add a Firewall rule that skips it for request paths starting with `/api/v1`. Bot protection answers requests that look automated with a browser check, which servers, apps (like Steady), Scriptable and Shortcuts can't pass, so their calls fail without the rule. Skipping it there is safe: every API request still needs a key.

## Endpoints

All responses are JSON with camelCase fields, ISO dates and absolute URLs. Responses may be kept for a minute (`Cache-Control: private, max-age=60`).

### `GET /api/v1/summary`

What a widget needs in one request: this year's goal, what you're reading, and links into BookBox.

```json
{
  "year": 2026,
  "goal": { "target": 40, "read": 23, "percent": 58, "expected": 31, "status": "behind" },
  "reading": [
    {
      "id": 812,
      "title": "The Left Hand of Darkness",
      "author": "Ursula K. Le Guin",
      "pages": 304,
      "startedOn": "2026-10-02",
      "progress": { "percent": 42, "page": 128, "source": "manual", "updatedAt": "2026-10-13T21:04:11Z" },
      "coverUrl": "https://bookbox.lol/api/v1/covers/812-3f9a1c.webp",
      "url": "https://bookbox.lol/books/812"
    }
  ],
  "links": {
    "addBook": "https://bookbox.lol/books/new",
    "scan": "https://bookbox.lol/books/new?scan=1",
    "library": "https://bookbox.lol/library",
    "stats": "https://bookbox.lol/stats"
  }
}
```

`goal`:
- `target` is null when no goal is set for the year; `percent`, `expected` and `status` are then null too.
- `expected` is how many books an even pace would have reached by today.
- `status` is `"reached"`, `"on-track"` or `"behind"`.

### `GET /api/v1/stats`

What the Stats page shows. Without `year` it's this year, so it rolls over to the new year by itself. `?year=2025` gets another year, and `?year=latest` is the same as leaving it out.

```json
{
  "year": 2026,
  "goal": { "target": 40, "read": 23, "percent": 58, "expected": 31, "status": "behind" },
  "pages": 7412,
  "totals": { "books": 612, "read": 401, "rereads": 18, "averageRating": 3.84, "abandoned": 12 },
  "perYear": [{ "year": 2025, "books": 38, "reads": 40, "pages": 11204 }],
  "ratings": [{ "rating": 5, "count": 61 }],
  "topTags": [{ "name": "science fiction", "count": 88 }],
  "topAuthors": [{ "name": "Ursula K. Le Guin", "count": 9, "averageRating": 4.6 }],
  "links": { "stats": "https://bookbox.lol/stats", "yearInReview": "https://bookbox.lol/stats/2026" }
}
```

- `goal` and `pages` are for `year`.
- `totals`, `ratings`, `topTags` and `topAuthors` cover your whole library.
- `perYear` has every year with reads in it.

### `GET /api/v1/reading`

`{ "reading": [...] }`: the books on Currently Reading, most recently updated first, in the same shape as `summary.reading`.

### `GET /api/v1/covers/:file`

A cover image (WebP), from a `coverUrl`. It needs the same `Authorization` header.

## Errors

```json
{ "error": { "code": "unauthorized", "message": "…" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | A `year` that isn't a year |
| 401 | `unauthorized` | No key, or a revoked one |
| 403 | `origin_not_allowed` | A browser request from a site the key doesn't list |
| 404 | `not_found` | An unknown cover |
| 500 | `server_error` | Anything else |

## Scriptable widget

[`scripts/scriptable/bookbox-widget.js`](../scripts/scriptable/bookbox-widget.js) is a home screen widget built on `/summary`. Setup steps are at the top of the file.
