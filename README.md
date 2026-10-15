# BookBox

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/helenvholmes)

A personal reading log you host yourself, for free. Track what you're reading, what you've read (and re-read), who recommended what, and what you thought, with book details filled in from [OpenLibrary](https://openlibrary.org). It installs to your phone's home screen, works offline, and can follow your audiobook progress on Spotify.

BookBox is for one reader per copy: you deploy your own, on your own free accounts, and your library stays yours. It's built with Next.js and SQLite (a local file, or [Turso](https://turso.tech) when hosted).

## Features

- **Add books in seconds**: search OpenLibrary by title, author or ISBN, or scan the barcode on the back with your phone's camera. The title, author, description, publisher, year, pages and cover fill in automatically.
- **Search as you type**: titles, authors (including names in their original script), series, tags, ISBNs, and your reviews, quotes and notes. Accents don't matter, words match by their start, and small typos are forgiven ("kill crek" finds *Kill Creek*).
- **Shelves and filters**: Currently Reading, To Read, Read and Abandoned, plus year read, tag, person, rating, and owned/Kindle/borrowed.
- **Lists**: your own collections, like Urbanism or Gifts to give, in the sidebar. Add a book from its page; a book can be on any number. A tag (such as an imported Goodreads shelf) can be turned into a list in one step.
- **Reads and progress**: every read is logged separately, so re-reads are tracked. Progress is set by page (or by percentage for Kindle books) and shows on your Currently Reading shelf.
- **Spotify audiobooks** (optional): when you start or resume an audiobook on Spotify, its book moves to Currently Reading (and is added if it isn't in your library yet), with your listening progress.
- **Offline**: once opened online, the home screen app keeps working without a connection. Search, covers and the main pages stay available, and changes to status, ratings, reads, progress and notes are saved on your device and sync when you're back online.
- **People and sharing**: note who recommended a book and who it's for, and give anyone a read-only page ("Books for Sam") at an unguessable link, with its own title, message, layout, accent colour, and whether your ratings and reviews show. Private notes and spoilers are never shared.
- **Stats**: a reading goal per year, books per year, ratings, top tags and authors, how many of the books you read were written by women, men and nonbinary authors (looked up on [Wikidata](https://www.wikidata.org), and yours to correct on the Authors page), and whose recommendations you rate highest, plus a reading calendar and a year in review for every year.
- **Series** (optional, with Hardcover): each series page lists the books in the series you don't have yet, from [Hardcover](https://hardcover.app), with a button to add one to To Read. Series Hardcover doesn't know are left off the Series page.
- **Lending**: note who has your copy of a book and when it's due back, with a history of past loans.
- **Tags** (rename, merge, delete), **library borrowing** with due dates, and **tidy-up tools** in Settings for missing covers, missing ISBNs, duplicates and a bulk OpenLibrary refresh.
- **Import from Goodreads**: bring in your Goodreads export (books, shelves, ratings, reviews and finish dates) from Settings. Books you already have are flagged so you choose which to add, and covers are fetched from OpenLibrary.
- **Import from Libby**: bring in your Libby timeline export (books you've borrowed, returned and placed holds on) from Settings. Returned books count as read on the day you returned them, unless you mark them as not finished.
- **Export** your whole library as CSV at any time.

## Deploy your own (free)

BookBox runs within the free tiers of [Vercel](https://vercel.com) (the app and cover storage) and [Turso](https://turso.tech) (the database). You'll need a GitHub account and about ten minutes.

1. **Fork this repository** on GitHub.
2. **Create a Vercel project** from your fork (Vercel → Add New → Project → import the repo). The first deploy will show a locked app until the next steps are done; that's expected.
3. **Add a database.** In the project, open **Storage → Create Database → Turso**, pick the free plan, and connect it to the project. That sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. (Or create a database at [turso.tech](https://turso.tech) yourself and set those two variables.)
4. **Add cover storage.** Still under **Storage**, create a **Blob** store with **Private** access and connect it. That sets `BLOB_READ_WRITE_TOKEN`.
5. **Set a password.** Under **Settings → Environment Variables**, add `BOOKBOX_PASSWORD`. Mark it Sensitive, and use a long passphrase: it's the only thing protecting your library.
6. **Redeploy** (Deployments → ⋯ → Redeploy), open your site, and sign in. The database is set up on first use. Then open **Settings** in BookBox's sidebar to add your name.

Your library is at `/library`. Visitors who aren't signed in get the sign-in page, or a page about BookBox if you turn that on in Settings.

On iPhone, open your site in the browser, tap Share, then **Add to Home Screen**. The home screen app keeps its own sign-in, so you sign in once inside it.

### Environment variables

These are for the server: the password and the services BookBox runs on. Preferences, like your name, are on the **Settings** page in the app and saved with your library.

| Variable | Required | What it's for |
|---|---|---|
| `BOOKBOX_PASSWORD` | Yes, when hosted | The password you sign in with. When deployed on Vercel, the app stays locked until it's set. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Yes, when hosted | The database. Without them, BookBox uses a SQLite file in `DATA_DIR`. |
| `BLOB_READ_WRITE_TOKEN` | Yes, when hosted | Cover storage (a private Vercel Blob store). Without it, covers are files in `DATA_DIR`. |
| `BOOKBOX_SECRET` | No | Signs the sign-in cookie. Defaults to the password. |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | No | Spotify app keys, if you'd rather set them here than in Settings; see below. |
| `HARDCOVER_TOKEN` | No | A Hardcover API token, if you'd rather set it here than in Settings; see below. |
| `DATA_DIR` | No | Where the local database and covers live (default `./data`). |

Changing the password signs out every device.

### Spotify (optional)

Spotify only lets each developer app serve a handful of users, so everyone uses their own. It's free, but the Spotify account that owns it needs Premium, and Spotify only offers audiobooks in some countries.

1. In BookBox, open **Settings → Spotify**. It shows the redirect URI for your site.
2. On the [Spotify developer dashboard](https://developer.spotify.com/dashboard), create an app, tick **Web API**, and add that redirect URI.
3. Paste the app's Client ID and Client secret into Settings, then tap **Connect Spotify**.

BookBox only reads your saved audiobooks and listening positions; it never plays or changes anything. It checks when you open the app, at most every few minutes. The first check only records where each audiobook stands, so audiobooks you'd already started aren't all pulled in at once. Add any of them from the **Spotify** page (linked from Settings), which lists your audiobooks and what they're linked to.

(You can set the keys as `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` on the host instead; those win over Settings.)

### Libby (optional)

Libby has no API for other apps, so BookBox uses the private one the Libby app itself uses (as [odmpy](https://github.com/ping/odmpy) and the [Libby plugin for Calibre](https://github.com/ping/libby-calibre-plugin) do). It can stop working whenever Libby changes it.

1. In the Libby app, open **Settings → Copy To Another Device** and pick the option that shows an 8-digit code ([Libby's help](https://help.libbyapp.com/en-us/6070.htm) has the steps).
2. In BookBox, open **Settings → Libby**, type the code within a minute, and tap **Connect Libby**.

BookBox checks your shelf when you open the app, at most every ten minutes. A new loan moves its book to Currently Reading (adding it if it isn't in your library yet) with its library and due date. When a loan goes back, by you or because it was due, the book moves to Read that day if it's still Currently Reading: Libby doesn't say whether you finished, so change any you didn't to Abandoned. New holds you don't have yet go on To Read. The first check takes your shelf as it is, but leaves books you've already marked Read or Abandoned alone. Magazines are skipped.

BookBox only reads your loans and holds. The connection could borrow and return on your cards, though, so it's kept on the server and never copied by `pull:cloud`. If Libby signs BookBox out, Settings says so; connect again with a new code. For your history from before you connected, use the timeline import below it.

### Hardcover (optional)

Series pages can show the books in each series that you don't have yet, using [Hardcover](https://hardcover.app)'s series data.

1. Sign in to Hardcover (a free account is fine) and open [Hardcover API](https://hardcover.app/account/api) in your account settings.
2. Make a token and paste it into **Settings → Hardcover**. BookBox checks it with Hardcover before saving it.

Each series is looked up once and remembered; the Series page checks a few new ones per visit to stay within Hardcover's rate limits. Hardcover tokens expire, so make a new one if series pages say it was refused. (You can set the token as `HARDCOVER_TOKEN` on the host instead; that wins over Settings.)

## Running it on your computer

```bash
npm install
npm run dev
```

With `BOOKBOX_PASSWORD` unset there's no sign-in, which is fine on your own machine. The database and covers go in `./data` (ignored by git). See `.env.example` for every setting.

The service worker (offline support) only runs in production builds, so `npm run dev` always shows fresh code. Try offline mode with `npm run build && npm start`.

### Moving a local library to your hosted copy

If you've been using BookBox locally first, copy it up once, before you start using the hosted copy (this replaces what's in the hosted database, and uploads every cover that isn't there yet):

```bash
TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… BLOB_READ_WRITE_TOKEN=… npm run push:cloud
```

### Keeping a local copy up to date

To work on BookBox against your real library, copy the hosted one down (the local database is backed up to `data/backups` first):

```bash
npm run pull:cloud
```

It uses the same keys file as `push:cloud`, saved as `.env.cloud` (git-ignored) with `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `BLOB_READ_WRITE_TOKEN`. With that file in place, `npm run dev` also shows a **Pull latest** notice whenever the local copy is more than three days old. Your Spotify sign-in and other server-only records stay on the server.

### Importing

`scripts/import-airtable.mts` imports the Airtable base BookBox was first built to replace; it's a starting point for writing an importer for your own spreadsheet.

### Home screen assets

`npm run generate:icons` redraws the app icon (defined as SVG in `scripts/generate-icons.mts`) and writes the manifest icons, favicon and iOS launch screens.

## Hosting elsewhere

Any host with a persistent disk works too (Fly.io, Railway, Render, a VPS), with the database and covers in `DATA_DIR`:

```bash
npm run build
cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public
DATA_DIR=/path/to/data BOOKBOX_PASSWORD=… node .next/standalone/server.js
```

Always set `BOOKBOX_PASSWORD` on a host others can reach.

## Feature requests

Ideas for BookBox go in [Feature requests](https://github.com/helenvholmes/bookbox/discussions/categories/feature-requests) on GitHub Discussions. Search first, and give an existing request a 👍 rather than posting it again: the most-wanted ideas get built first. Bugs go in [issues](https://github.com/helenvholmes/bookbox/issues).

## Support BookBox

BookBox is free and open source. If it's useful to you, you can [leave a tip on Ko-fi](https://ko-fi.com/helenvholmes).

## Security

- One password protects everything except share pages, which are only reachable by their unguessable links and never include private notes or spoilers. Covers are served through the app, so they're private too.
- After 10 wrong passwords from one network address in 15 minutes, sign-in from that address pauses for the rest of the 15 minutes.
- Found a problem? Please open an issue, or for anything sensitive, contact the maintainer privately rather than posting details publicly.

## License

[AGPL-3.0](LICENSE). You're free to use, change and share BookBox. If you run a modified copy for other people to use, you have to offer them its source code under the same license. The "BookBox is open source" link in the app's sidebar is there for that: point `SOURCE_URL` in `src/lib/constants.ts` at your fork.
