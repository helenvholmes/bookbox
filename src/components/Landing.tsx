import type { Metadata } from "next";
import Link from "next/link";
import { AUTHOR, FEATURE_REQUESTS_URL, SOURCE_URL, SUPPORT_URL } from "@/lib/constants";
import { Cover } from "./Cover";
import { Stars } from "./Stars";

/**
 * The public page about BookBox, shown at the site's address to visitors who aren't signed in
 * (when Settings allows). It leads with signing up to this copy; running your own copy comes
 * further down, for people who want more control. The library preview uses first editions of public-domain books (images
 * from Wikimedia Commons, credited in public/landing/CREDITS.md), so nothing from anyone's real
 * library appears here.
 */

export const LANDING_METADATA: Metadata = {
  title: { absolute: "BookBox · A free, private reading log" },
  description:
    "Track what you read, re-read, and want to read. Instant search, offline mode, barcode scanning, shareable lists, and Spotify audiobook progress. Free, private, and open source.",
  openGraph: {
    title: "BookBox",
    description: "A free, private reading log: instant search, offline mode, shareable lists, and Spotify audiobook progress.",
    type: "website",
  },
};

const DEPLOY_URL = `${SOURCE_URL}#deploy-your-own-free`;

const READING = [
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", cover: "great-gatsby.webp", progress: 62 },
  { title: "Dracula", author: "Bram Stoker", cover: "dracula.webp", progress: 18 },
];
const SHELF = [
  { title: "The Wonderful Wizard of Oz", author: "L. Frank Baum", cover: "wizard-of-oz.webp", rating: 5 },
  { title: "Anne of Green Gables", author: "L. M. Montgomery", cover: "anne-of-green-gables.webp", rating: 4 },
  { title: "The Sun Also Rises", author: "Ernest Hemingway", cover: "sun-also-rises.webp", rating: 4 },
  { title: "The Maltese Falcon", author: "Dashiell Hammett", cover: "maltese-falcon.webp", rating: null },
];
const COVERS = "/landing";

const FEATURES: { title: string; body: string; d: string }[] = [
  {
    title: "Add a book in seconds.",
    body: "Search by title, author, or ISBN, or scan the barcode with your phone. The cover, description, pages, and publisher fill themselves in.",
    d: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6",
  },
  {
    title: "Bring your library with you.",
    body: "Import your Goodreads export or your Libby timeline: shelves, ratings, reviews, and the dates you finished. Nothing to retype.",
    // An arrow down into a tray.
    d: "M12 4v11m0 0-4-4m4 4 4-4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
  },
  {
    title: "Search as you type.",
    body: "Titles, authors, series, tags, and your own reviews. Accents don’t matter and typos are forgiven: “kill crek” becomes Kill Creek.",
    d: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-3.5-3.5",
  },
  {
    title: "Lists of your own.",
    body: "Gather books into lists like Urbanism or Gifts to give, right beside To Read and Read. A book can be on as many as you like.",
    // A bulleted list.
    d: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  },
  {
    title: "Works offline.",
    body: "Add it to your home screen and it opens instantly, even with no signal. Changes save on your phone and sync when you’re back.",
    d: "M5 12.5a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18",
  },
  {
    title: "Follows your audiobooks.",
    body: "Start an audiobook on Spotify and it moves to Currently Reading on its own, with how far you’ve listened.",
    d: "M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z",
  },
  {
    title: "Lists worth sharing.",
    body: "Give a friend their own page of the books you’d pick for them, and the ones they picked for you, with ratings and reviews.",
    d: "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  },
  {
    title: "Re-reads, goals, and stats.",
    body: "Every read is logged with its dates, so re-reads count. Set a yearly goal, browse your reading calendar, and look back on any year in review.",
    d: "M5 20v-8m6 8V5m6 15v-5M3 20h18",
  },
  {
    title: "Finish the series.",
    body: "See the books you’re missing from each series, from Hardcover, and add the next one to To Read in a click.",
    // Spines on a shelf, one leaning.
    d: "M5 20V5m4.5 15V5m4.5 15 3.5-14.5 3.5.9L17.5 20",
  },
  {
    title: "Lend your copies.",
    body: "Keep track of who has your books and when they’re due back, with every past loan.",
    // Two arrows passing a book back and forth.
    d: "M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3-3m-3 3 3 3",
  },
];

/** `signedIn` swaps "Sign in" and "Sign up" for a way back to the library. */
export function Landing({ signedIn }: { signedIn: boolean }) {
  const account = signedIn ? { href: "/library", label: "Open your library" } : { href: "/login", label: "Sign in" };
  const start = signedIn ? account : { href: "/signup", label: "Sign up" };
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <span className="display text-xl">BookBox</span>
        <nav aria-label="Site" className="flex items-center gap-4 text-sm">
          {!signedIn && (
            <Link href={account.href} className="text-muted hover:text-ink">
              {account.label}
            </Link>
          )}
          <Link href={start.href} className="btn btn-primary rounded-full px-4">
            {start.label}
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
              Keep track of what you&rsquo;re reading, what you want to read, what friends recommend, and what you thought. Your library is private to you,
              with no ads, no feeds, and nobody else&rsquo;s algorithm.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link href={start.href} className="btn btn-primary rounded-full px-5">
                {start.label}
              </Link>
              <a href="#features" className="btn rounded-full px-5">
                See what it does
              </a>
            </div>
            <p className="text-xs text-faint">
              Invite-only, or{" "}
              <a href="#run-your-own" className="underline decoration-line underline-offset-2 hover:text-muted">
                run your own copy
              </a>
              .
            </p>
          </div>

          <LibraryPreview />
        </section>

        <section aria-labelledby="features" className="scroll-mt-8 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 id="features" className="display max-w-xl text-3xl leading-tight sm:text-4xl">
              Everything a reading log should do.
            </h2>
            <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="space-y-3">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-line text-muted">
                    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <h2 className="display text-3xl leading-tight sm:text-4xl">Start your library.</h2>
              <p className="max-w-md leading-relaxed text-muted">Your books stay yours: export them as a CSV whenever you like.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={start.href} className="btn btn-primary rounded-full px-5">
                {start.label}
              </Link>
            </div>
          </div>
        </section>

        <section id="run-your-own" aria-labelledby="run-your-own-title" className="scroll-mt-8 border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:grid-cols-2">
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-muted">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                Open source
              </p>
              <h2 id="run-your-own-title" className="display text-3xl leading-tight sm:text-4xl">
                Or run your own copy.
              </h2>
              <p className="max-w-md leading-relaxed text-muted">
                Want more control? BookBox is open source, so you can fork it and run it yourself on the free tiers of Vercel and Turso. Your library lives in
                your own database, on your own accounts, and you can change anything you like.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a href={DEPLOY_URL} className="btn rounded-full px-5">
                  Deploy your own
                </a>
                <a href={SOURCE_URL} className="btn rounded-full px-5">
                  View the code
                </a>
              </div>
              <p className="text-xs text-faint">Takes about ten minutes to set up. Costs nothing to run. Spotify and Hardcover are optional extras.</p>
            </div>
            <ol className="space-y-6">
              {[
                ["Fork it", "Copy the code to your GitHub account."],
                ["Deploy it", "Connect it to Vercel with a free database and cover storage, then set a password and sign in."],
                ["Add your books", "Search, scan, or import from Goodreads or Libby, then open it on your phone."],
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

      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-faint sm:px-8">
          <span className="space-y-1">
            <span className="block">
              BookBox is open source under the AGPL-3.0. Covers shown are{" "}
              <a href={`${SOURCE_URL}/blob/main/public/landing/CREDITS.md`} className="underline decoration-line underline-offset-2 hover:text-muted">
                public-domain first editions
              </a>
              .
            </span>
            <span className="block">
              Built with <span aria-label="love">♥</span> by{" "}
              <a href={AUTHOR.url} className="underline decoration-line underline-offset-2 hover:text-muted">
                {AUTHOR.handle}
              </a>
              .
            </span>
          </span>
          <span className="flex flex-wrap gap-x-4 gap-y-2 whitespace-nowrap">
            <a href={SOURCE_URL} className="hover:text-muted">
              Source code
            </a>
            <a href={FEATURE_REQUESTS_URL} className="hover:text-muted">
              Request a feature
            </a>
            <a href={SUPPORT_URL} className="hover:text-muted">
              Support BookBox
            </a>
            <Link href={account.href} className="hover:text-muted">
              {account.label}
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
          <p className="display text-2xl leading-tight">Hello, Helen</p>
          <p className="display text-2xl leading-tight text-faint">It&rsquo;s a good day to read</p>
        </div>
        <div className="space-y-3">
          <p className="section-title">Currently reading</p>
          <div className="grid grid-cols-2 gap-4">
            {READING.map((b) => (
              <div key={b.title} className="card overflow-hidden">
                <Cover cover={b.cover} srcBase={COVERS} title={b.title} author={b.author} bleed eager />
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
                <Cover cover={b.cover} srcBase={COVERS} title={b.title} author={b.author} className="rounded-sm" eager />
                <div className="flex justify-center">
                  <Stars rating={b.rating} className="h-2" label={false} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

