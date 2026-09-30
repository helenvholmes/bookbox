import Link from "next/link";
import { SOURCE_URL } from "@/lib/constants";
import { Cover, spineColor } from "./Cover";
import { Stars } from "./Stars";

/**
 * The public page about BookBox, shown at the site's address to visitors who aren't signed in
 * (when Settings allows). The library preview is drawn with the app's own generated covers and
 * public-domain titles, so nothing from anyone's real library appears here.
 */

const DEPLOY_URL = `${SOURCE_URL}#deploy-your-own-free`;

const READING = [
  { title: "Middlemarch", author: "George Eliot", progress: 62 },
  { title: "The Moonstone", author: "Wilkie Collins", progress: 18 },
];
const SHELF = [
  { title: "Frankenstein", author: "Mary Shelley", rating: 5 },
  { title: "Persuasion", author: "Jane Austen", rating: 4 },
  { title: "The Age of Innocence", author: "Edith Wharton", rating: 5 },
  { title: "Dracula", author: "Bram Stoker", rating: null },
];

const FEATURES: { title: string; body: string; d: string }[] = [
  {
    title: "Add a book in seconds",
    body: "Search by title, author or ISBN, or scan the barcode with your phone. The cover, description, pages and publisher fill themselves in.",
    d: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6",
  },
  {
    title: "Search as you type",
    body: "Titles, authors, series, tags, and your own reviews and notes. Accents don’t matter and typos are forgiven: “kill crek” finds Kill Creek.",
    d: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-3.5-3.5",
  },
  {
    title: "Works offline",
    body: "Add it to your home screen and it opens instantly, even with no signal. Changes save on your phone and sync when you’re back.",
    d: "M5 12.5a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18",
  },
  {
    title: "Follows your audiobooks",
    body: "Start an audiobook on Spotify and it moves to Currently Reading on its own, with how far you’ve listened.",
    d: "M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z",
  },
  {
    title: "Lists worth sharing",
    body: "Give a friend their own page of the books you’d pick for them, and the ones they picked for you, with your ratings and reviews if you like.",
    d: "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  },
  {
    title: "Re-reads, goals and stats",
    body: "Every read is logged, so re-reads count. Set a yearly goal and see your years, ratings, favourite authors and whose recommendations land.",
    d: "M5 20v-8m6 8V5m6 15v-5M3 20h18",
  },
];

export function Landing() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <span className="display text-xl">BookBox</span>
        <nav aria-label="Site" className="flex items-center gap-5 text-sm">
          <a href={SOURCE_URL} className="text-muted hover:text-ink">
            GitHub
          </a>
          <Link href="/login" className="btn rounded-full px-4">
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero: the pitch on one side, a living preview of the library on the other. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:pt-24">
          <div className="space-y-6">
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              Free and open source
            </p>
            <h1 className="display text-[2.75rem] leading-[1.05] sm:text-6xl">A reading log that&rsquo;s yours.</h1>
            <p className="max-w-lg text-[1.0625rem] leading-relaxed text-muted">
              Everything you&rsquo;ve read, are reading and want to read, with who recommended it and what you thought. On your own site, on the free tiers of
              Vercel and Turso, with no ads, no feed and nobody else&rsquo;s algorithm.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a href={DEPLOY_URL} className="btn btn-primary rounded-full px-5">
                Deploy your own
              </a>
              <a href={SOURCE_URL} className="btn rounded-full px-5">
                View the code
              </a>
            </div>
            <p className="text-xs text-faint">About ten minutes to set up. Costs nothing to run.</p>
          </div>

          <LibraryPreview />
        </section>

        <section aria-labelledby="features" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 id="features" className="display max-w-xl text-3xl leading-tight sm:text-4xl">
              Everything a reading log should do, and nothing it shouldn&rsquo;t.
            </h2>
            <ul className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="space-y-3">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-line text-muted">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d={f.d} />
                    </svg>
                  </span>
                  <h3 className="text-[0.9375rem] font-medium">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="yours" className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:grid-cols-2">
            <div className="space-y-4">
              <h2 id="yours" className="display text-3xl leading-tight sm:text-4xl">
                One reader per copy.
              </h2>
              <p className="max-w-md leading-relaxed text-muted">
                BookBox isn&rsquo;t a service you sign up for. You run your own copy, on your own free accounts, and your library never sits in anyone
                else&rsquo;s database. Export it as a spreadsheet whenever you like.
              </p>
            </div>
            <ol className="space-y-6">
              {[
                ["Fork it", "Copy the code to your GitHub account."],
                ["Deploy it", "Connect it to Vercel with a free database and cover storage, then set a password."],
                ["Add your books", "Search, scan, or import, and open it on your phone."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="display flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-muted">{i + 1}</span>
                  <div>
                    <p className="font-medium">{t}</p>
                    <p className="text-sm text-muted">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
            <h2 className="display text-3xl leading-tight sm:text-4xl">Start your library.</h2>
            <div className="flex flex-wrap gap-3">
              <a href={DEPLOY_URL} className="btn btn-primary rounded-full px-5">
                Deploy your own
              </a>
              <a href={SOURCE_URL} className="btn rounded-full px-5">
                Read the guide
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-faint sm:px-8">
          <span>BookBox is open source under the AGPL-3.0.</span>
          <span className="flex gap-4">
            <a href={SOURCE_URL} className="hover:text-muted">
              Source code
            </a>
            <Link href="/login" className="hover:text-muted">
              Sign in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** A still of the library: a Currently Reading row with progress, then a shelf of rated books. */
function LibraryPreview() {
  return (
    <div aria-hidden className="relative">
      <div className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(ellipse_at_top,rgba(236,236,237,0.07),transparent_70%)]" />
      <div className="card relative space-y-6 p-5 shadow-2xl shadow-black/50 sm:p-6">
        <div>
          <p className="display text-2xl leading-tight">Hello, Sam</p>
          <p className="display text-2xl leading-tight text-faint">It&rsquo;s a good day to read</p>
        </div>
        <div className="space-y-3">
          <p className="section-title">Currently reading</p>
          <div className="grid grid-cols-2 gap-4">
            {READING.map((b) => (
              <div key={b.title} className="card overflow-hidden">
                <Cover cover={null} title={b.title} author={b.author} bleed />
                <div className="h-1.5 bg-line">
                  <div className="h-full bg-ink" style={{ width: `${b.progress}%` }} />
                </div>
                <p className="px-3 pt-2.5 pb-3 text-center text-xs text-muted">{b.progress}%</p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="section-title">Read</p>
          <div className="grid grid-cols-4 gap-3">
            {SHELF.map((b) => (
              <div key={b.title} className="space-y-1.5">
                <MiniCover title={b.title} />
                <div className="flex justify-center">
                  <Stars rating={b.rating} className="size-2" label={false} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A generated cover small enough for a shelf of six: the title only, in type that fits. */
function MiniCover({ title }: { title: string }) {
  const color = spineColor(title);
  return (
    <div
      className="flex aspect-[2/3] w-full items-start overflow-hidden rounded-sm p-1.5 text-white"
      style={{ background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 70%, black))` }}
    >
      <span className="line-clamp-4 text-[0.625rem] leading-tight font-medium hyphens-auto">{title}</span>
    </div>
  );
}
