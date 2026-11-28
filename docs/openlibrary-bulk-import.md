# Adding missing books to Open Library in bulk

BookBox finds books through Open Library, so a book missing there is missing from BookBox search. Poetry
from small and literary presses (Copper Canyon Press, Faber & Faber, FSG) is often missing. Open Library
is a wiki and accepts bulk imports, so the fix is to send it the records.

The steps below follow Open Library's developer wiki as of late 2026. Its batch-import section is marked
as needing an update, so expect details to shift and ask staff if something doesn't match.

## 1. Collect ISBNs

Put them in a text file, one per line (`#` starts a comment), or use a CSV. A publisher's backlist
spreadsheet or ONIX export saved as CSV works best, because it has the publisher's own titles and dates.
The script recognises columns named like `title`, `author`/`authors`/`contributors`, `isbn`/`isbn13`/`ean`,
`publisher`/`imprint`, `publish_date`/`year`, `pages`, `description` and `subjects`. Separate several
authors with `;`, `|` or `&`.

Other places to get ISBNs: the publisher's website and seasonal catalogues, the copyright pages of the
books on your friend's shelf, or a BookBox export (`/export/books.csv`).

## 2. Build the import file

```sh
GOOGLE_BOOKS_API_KEY=… npm run openlibrary:batch -- copper-canyon.txt --out copper-canyon --publisher "Copper Canyon Press"
```

For each ISBN, the script checks whether Open Library already has the edition and skips it if so. For
missing books it takes the details from your CSV and fills gaps from Google Books. A Google Books API key
is optional, but without one Google rate-limits quickly. You get a free key from Google Cloud Console
under APIs & Services > Books API. The script writes:

- `copper-canyon.jsonl`: one Open Library import record per line.
- `copper-canyon-report.csv`: every ISBN, marked as already on Open Library, ready, needing details
  (with the fields that are missing), or an error.

Open Library requires a title, at least one author, a publisher and a publish date. To fix the rows
marked "needs details", add them to a CSV with those columns and run the script again.

`--source` sets the `source_records` prefix (default `bookbox`, giving `bookbox:<isbn13>`). If a publisher
sends you its data, use a prefix naming it, for example `--source coppercanyon`, so Open Library can tell
where each record came from.

## 3. Upload the batch

1. Create an Open Library account at openlibrary.org, or sign in to an existing one.
2. Go to **openlibrary.org/import/batch/new** and upload the `.jsonl` file.
3. Note the batch number from the status page (`/import/batch/<id>`). Batches from accounts that aren't
   admins wait for review (status `needs_review`).

## 4. Ask for the batch to be reviewed

Open an issue at github.com/internetarchive/openlibrary/issues/new (or post in the Open Library Slack,
linked from that repository's README). Text to start from:

> **Title:** Batch import review: poetry from Copper Canyon Press, Faber & Faber and FSG
>
> Hi! I've uploaded a batch of poetry editions that aren't on Open Library yet: batch #`<id>`
> (`<count>` records). Poetry from these presses is badly covered, and readers of apps built on Open
> Library can't find the books.
>
> - I checked every ISBN against `/isbn/<isbn>.json` first. All are ISBN-13 editions Open Library
>   doesn't have.
> - Details come from `<the publisher's own catalogue / Google Books>`. Each record has a title,
>   authors, publisher, publish date and ISBN-13, plus page count and language where known.
> - `source_records` use the prefix `<bookbox>:<isbn13>`. Happy to change it if you'd prefer another.
>
> Could an admin review and approve it? If you'd rather this went through a bot account, I'm glad to
> set one up. I expect more batches as publishers send their catalogues.

## 5. For repeat or large imports: a bot account

To import regularly, for example an ongoing feed from a publisher, Open Library wants a separate bot
account:

1. Register a second account whose username ends in `Bot` (for example `PoetryImportBot`).
2. Open a GitHub issue asking a site admin to give it bot privileges and add it to the `API` usergroup.
   Explain what it will import and link the script.
3. Wait for an admin to review the script before running it. Bulk edits made before approval can cost
   the bot its privileges.
4. The bot can then POST each record to `https://openlibrary.org/api/import`, after logging in with a
   JSON POST to `/account/login.json`, which sets a `session` cookie.

## For a single book

Use **Add a book** on openlibrary.org (`/books/add`). Visiting `/isbn/<isbn-10>?high_priority=true` can
also import a book from Open Library's partner data, but the wiki says this may be switched off.
