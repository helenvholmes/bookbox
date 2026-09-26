# BookBox

A personal reading log that replaces an Airtable base. It's built with Next.js and SQLite (a local file, or [Turso](https://turso.tech) when hosted), and it fills in book details from [OpenLibrary](https://openlibrary.org).

- **Search**: results appear as you type, from a copy of the library kept in the browser. It covers titles, authors (including original-script names), series, tags, ISBNs, and your reviews, quotes and notes. Accents don't matter, words match by their start, and small typos are forgiven ("kill crek" finds *Kill Creek*).
- **Offline**: once opened online, the home screen app keeps working without a connection. The library, the main pages, every cover and search stay available, and a page that wasn't saved falls back to a searchable offline library. Anything saved while the connection drops goes through once it's back, as long as the app stays open.
- **Library**: shelves (Currently Reading, To Read, Read, …, or no shelf), year read, tag, person, rating, and owned/Kindle filters.
- **Add a book**: search OpenLibrary by title, author or ISBN. The title, author, ISBN, description, publisher, year, pages and cover fill in automatically.
- **Refresh from OpenLibrary** on any book: empty fields get filled, and fields that differ are shown for you to accept one at a time.
- **People**: who recommended a book and who it's for. **Tags**: rename, merge or delete them.
- **Reads**: every read of a book is logged separately, so re-reads (with an optional note) are tracked.
- **Stats**: a reading goal per year, books per year, ratings, top tags and authors, and whose recommendations you rate highest.
- **Series**: group books into series with their number; titles like "(Shades of Magic, #3)" can be filed automatically.
- **Library borrowing**: mark a book as borrowed, with the library and due date; overdue books are flagged.
- **Sharing**: each person can have a public, read-only page ("Books for Walter") at an unguessable `/s/…` link, with its own title, message, layout, accent colour, and whether ratings and reviews show. Private notes and spoilers are never shown.
- **Tidy up**: Missing covers, Missing ISBNs, Duplicates, and a bulk OpenLibrary refresh that fills empty fields and suggests fixes.
- **Export**: download the whole library as CSV.
- Installs to the home screen as a standalone web app, with an icon, iOS launch screens and support for the notch and home bar.

## Running it

```bash
npm install
npm run dev
```

With `BOOKBOX_PASSWORD` unset there's no login, which is fine on your own machine. See `.env.example` for all the settings.

The service worker (offline support) only runs in production builds, so `npm run dev` always shows fresh code. Try it with `npm run build && npm start`.

## Data

Running locally, everything lives in `DATA_DIR` (default `./data`, which git ignores):

| Path | What |
|---|---|
| `bookbox.db` | SQLite database |
| `covers/` | Covers resized to 600px WebP; filenames include a content hash |
| `airtable-*` | The original Airtable export, kept for reference |

Back up by copying the folder. Covers and the database are the whole app state.

When hosted, the database is on Turso and covers are in a private Vercel Blob store instead (see Deploying). The database stores only cover filenames either way, and pages always load covers through `/covers/…`, which requires signing in.

### Re-importing from Airtable

```bash
npm run import:airtable -- --fresh
```

This rebuilds the database from `data/airtable-books.csv`, `data/airtable-people.json` and `data/airtable-covers/`. `--fresh` deletes the current database first, so anything added in BookBox since then is lost.

## Home screen assets

`npm run generate:icons` redraws the icon (defined as SVG in `scripts/generate-icons.mts`) and writes:

- `public/icons/`: manifest icons (192, 512, maskable, SVG)
- `src/app/apple-icon.png`, `src/app/icon.png`: iOS home screen icon and favicon
- `public/splash/`: iOS launch screens; the device list is in `src/lib/splash.ts`

On iPhone, open the site in Safari, tap Share, then **Add to Home Screen**. The home screen app keeps its own cookies, so you sign in once inside it.

## Deploying

BookBox runs on the free tiers of Vercel (the app), Turso (the database) and Vercel Blob (covers). The code picks these up from environment variables; without them it uses `data/` as above.

1. **Create the database.** Sign up at [turso.tech](https://turso.tech) and create a database, in the region closest to where Vercel will run the app. Copy its URL (`libsql://…`) and create an auth token for it.
2. **Create the Vercel project** from the GitHub repo. Under **Storage**, create a **Blob** store with **Private** access and connect it to the project; that sets `BLOB_READ_WRITE_TOKEN`.
3. **Set the environment variables** on the project:

   | Variable | Value |
   |---|---|
   | `BOOKBOX_PASSWORD` | The password you'll sign in with. On Vercel the app stays locked until this is set. |
   | `TURSO_DATABASE_URL` | The `libsql://…` URL |
   | `TURSO_AUTH_TOKEN` | The token |

4. **Copy your library up** from this machine, before you start using the hosted app. This replaces whatever is in the Turso database and uploads every cover that isn't there yet:

   ```bash
   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… BLOB_READ_WRITE_TOKEN=… npm run push:cloud
   ```

5. **Deploy.** From then on, the hosted copy is the real one; `data/` on this machine is a snapshot.

Limits to know about: Vercel caps request bodies at 4.5 MB (cover photos are shrunk in the browser before upload, so this only matters for very large files the browser can't read). The OpenLibrary refresh runs a few books at a time from the page, so keep the page open while it runs.

### Self-hosting instead

Any host with a persistent disk works too (Fly.io, Railway, Render, a VPS), with the database and covers in `DATA_DIR`:

```bash
npm run build
cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public
DATA_DIR=/path/to/data BOOKBOX_PASSWORD=… node .next/standalone/server.js
```

Copy your local `data/` folder to the server once to bring your library along. Always set `BOOKBOX_PASSWORD` on a public host.
