# BookBox

A personal reading log that replaces an Airtable base. It's built with Next.js and SQLite, and it fills in book details from [OpenLibrary](https://openlibrary.org).

- **Library**: search, shelves (Currently Reading, To Read, Read, …, or no shelf), year read, tag, person, rating, and owned/Kindle filters.
- **Add a book**: search OpenLibrary by title, author or ISBN. The title, author, ISBN, description, publisher, year, pages and cover fill in automatically.
- **Refresh from OpenLibrary** on any book: empty fields get filled, and fields that differ are shown for you to accept one at a time.
- **People**: who recommended a book and who it's for. **Tags**: rename, merge or delete them.
- Installs to the home screen as a standalone web app, with an icon, iOS launch screens and support for the notch and home bar.

## Running it

Needs **Node 22.13 or newer**, because the database uses the built-in `node:sqlite`.

```bash
npm install
npm run dev
```

With `BOOKBOX_PASSWORD` unset there's no login, which is fine on your own machine. See `.env.example` for all the settings.

## Data

Everything lives in `DATA_DIR` (default `./data`, which git ignores):

| Path | What |
|---|---|
| `bookbox.db` | SQLite database |
| `covers/` | Covers resized to 600px WebP; filenames include a content hash |
| `airtable-*` | The original Airtable export, kept for reference |

Back up by copying the folder. Covers and the database are the whole app state.

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

The app needs a host with a **persistent disk** for SQLite and covers (Fly.io, Railway, Render, a VPS). Serverless platforms like Vercel won't work, because their filesystem resets.

```bash
npm run build
cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public
DATA_DIR=/path/to/data BOOKBOX_PASSWORD=… node .next/standalone/server.js
```

Copy your local `data/` folder to the server once to bring your library along. Always set `BOOKBOX_PASSWORD` on a public host.
