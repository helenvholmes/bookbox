"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SOURCE_URL } from "@/lib/constants";
import { arrivedAt, notePage, notePlace, rememberScroll } from "@/lib/history";
import { SignOutButton } from "./SignOutButton";
import { GooeyFilter } from "./GooeyFilter";
import { ShelfIcon, STATUS_SHELVES, shelfLabel } from "./ShelfIcon";
import { formatCount } from "@/lib/numbers";

const ICONS = {
  library: "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  add: "M12 5v14M5 12h14",
  people: "M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 9v-1a4 4 0 0 0-3-3.87M15 4.13a3 3 0 0 1 0 5.74",
  tags: "M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9-9-9Zm4.5-4.5h.01",
  series: "M5 20V5m4.5 15V5m4.5 15 3.5-14.5 3.5.9L17.5 20",
  stats: "M5 20v-8m6 8V5m6 15v-5M3 20h18",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  export: "M12 4v11m0 0-4-4m4 4 4-4M5 19h14",
  menu: "M4 7h16M4 12h16M4 17h10",
  close: "M6 6l12 12M18 6 6 18",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  folder: "M3 7a1.5 1.5 0 0 1 1.5-1.5H9l2 2h8.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z",
  chevron: "m9 6 6 6-6 6",
  signOut: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11",
  // Sliders.
  settings: "M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4",
};

/** Settings and the pages reached from it, which highlight Settings in the sidebar. */
const SETTINGS_PAGES = ["/settings", "/spotify", "/missing-covers", "/missing-isbns", "/duplicates", "/refresh"];

function Icon({ d, className = "size-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** A bookmark (the same shape as To Read's) that fills in for the selected year. */
function YearIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z" />
    </svg>
  );
}

/** `canSignOut` is false when the app has no password (running on your own computer), so there's nothing to sign out of. */
type Props = { years: { year: number; count: number }[]; lists: { id: number; name: string; count: number }[]; canSignOut: boolean };

const noSubscribe = () => () => {};
const deviceYear = () => new Date().getFullYear();

/**
 * This year (on the device's calendar), even before its first finished book so a new year's view
 * is there on January 1st, and the other years with reads. Until the device's year is known (the
 * server's render), the latest year with reads stands in for it.
 */
function useYears(years: Props["years"]) {
  const thisYear = useSyncExternalStore(noSubscribe, deviceYear, () => null);
  const year = thisYear ?? years[0]?.year;
  if (years.length === 0 || year === undefined) return { current: null, past: [] };
  return { current: years.find((y) => y.year === year) ?? { year, count: 0 }, past: years.filter((y) => y.year !== year) };
}

/** Sidebar rows; `large` is the phone menu, which has the whole screen and fingers to fit: everything there is at least 40 pixels square to tap. */
const item = (active: boolean, large = false) =>
  `flex items-center gap-2.5 rounded-md px-2.5 transition active:opacity-60 ${large ? "py-2.5 text-base" : "py-1.5 text-[0.8125rem]"} ${active ? "bg-raised text-ink" : "text-muted hover:text-ink"}`;

/**
 * Everything in the sidebar: shown beside the page on desktop, and in the full-screen Menu on
 * phones. Shelves come first, then this year with earlier years in a folder under it, then your lists.
 */
function SidebarLinks({ years: withReads, lists, canSignOut, large = false }: Props & { large?: boolean }) {
  const { current, past } = useYears(withReads);
  const pathname = usePathname();
  const params = useSearchParams();
  const onLibrary = pathname === "/library";
  const shelf = onLibrary ? params.get("shelf") : null;
  const year = onLibrary ? params.get("year") : null;
  const plainLibrary = onLibrary && !shelf && !year;
  // The folder opens by itself while one of its years is showing, until you open or close it.
  const [yearsOpen, setYearsOpen] = useState<boolean | null>(null);
  const showYears = yearsOpen ?? past.some((y) => String(y.year) === year);
  const row = (active: boolean) => item(active, large);
  const yearLink = ({ year: y, count }: { year: number; count: number }, nested = false) => (
    <Link key={y} href={`/library?year=${y}`} className={`${row(year === String(y))} ${nested ? "pl-8" : ""}`}>
      <YearIcon filled={year === String(y)} />
      <span className="flex-1">{y}</span>
      <span className="text-xs text-faint tabular-nums">{formatCount(count)}</span>
    </Link>
  );

  return (
    <>
      <Link href="/library" className={`display flex items-center gap-2 px-2.5 text-xl ${large ? "min-h-10" : ""}`}>
        BookBox
      </Link>
      <nav aria-label="Main" className="space-y-0.5">
        <Link href="/library" className={row(plainLibrary || pathname.startsWith("/books/") && pathname !== "/books/new")}>
          <Icon d={ICONS.library} /> Library
        </Link>
        <Link href="/books/new" className={row(pathname === "/books/new")}>
          <Icon d={ICONS.add} /> Add a book
        </Link>
        <Link href="/people" className={row(pathname.startsWith("/people"))}>
          <Icon d={ICONS.people} /> People
        </Link>
        <Link href="/tags" className={row(pathname.startsWith("/tags"))}>
          <Icon d={ICONS.tags} /> Tags
        </Link>
        <Link href="/series" className={row(pathname.startsWith("/series"))}>
          <Icon d={ICONS.series} /> Series
        </Link>
        <Link href="/stats" className={row(pathname.startsWith("/stats"))}>
          <Icon d={ICONS.stats} /> Stats
        </Link>
        <Link href="/calendar" className={row(pathname.startsWith("/calendar"))}>
          <Icon d={ICONS.calendar} /> Calendar
        </Link>
      </nav>

      <div className="space-y-0.5">
        <p className="px-2.5 pb-1 text-xs text-faint">Shelves</p>
        {STATUS_SHELVES.map((s) => (
          <Link key={s} href={`/library?shelf=${encodeURIComponent(s)}`} className={row(shelf === s)}>
            <ShelfIcon shelf={s} /> {shelfLabel(s)}
          </Link>
        ))}
      </div>

      {current && (
        <div className="space-y-0.5">
          {yearLink(current)}
          {past.length > 0 && (
            <>
              <button type="button" className={`${row(false)} w-full`} aria-expanded={showYears} onClick={() => setYearsOpen(!showYears)}>
                <Icon d={ICONS.folder} />
                <span className="flex-1 text-left">Years</span>
                <Icon d={ICONS.chevron} className={`size-3.5 text-faint transition-transform ${showYears ? "rotate-90" : ""}`} />
              </button>
              {showYears && past.map((y) => yearLink(y, true))}
            </>
          )}
        </div>
      )}

      <div className="space-y-0.5">
        <div className={`flex items-center justify-between px-2.5 ${large ? "" : "pb-1"}`}>
          <Link href="/lists" className={`text-xs text-faint hover:text-muted ${large ? "flex min-h-10 min-w-10 items-center" : ""}`}>
            Lists
          </Link>
          {/* In the phone menu, a 40-pixel square to tap, its icon still lined up with the rows' right edge. */}
          <Link href="/lists" aria-label="Lists: make or edit one" className={`text-faint hover:text-ink ${large ? "-mr-3 flex size-10 items-center justify-center" : ""}`}>
            <Icon d={ICONS.add} className="size-3.5" />
          </Link>
        </div>
        {lists.map((l) => (
          <Link key={l.id} href={`/library?shelf=${encodeURIComponent(l.name)}`} className={row(shelf === l.name)}>
            <Icon d={ICONS.list} />
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            <span className="text-xs text-faint tabular-nums">{formatCount(l.count)}</span>
          </Link>
        ))}
        {lists.length === 0 && (
          <Link href="/lists" className={row(pathname === "/lists")}>
            <Icon d={ICONS.add} /> New list
          </Link>
        )}
      </div>

      <div className="mt-auto space-y-0.5">
        <a href="/export/books.csv" download className={row(false)}>
          <Icon d={ICONS.export} /> Export CSV
        </a>
        <Link href="/settings" className={row(SETTINGS_PAGES.includes(pathname))}>
          <Icon d={ICONS.settings} /> Settings
        </Link>
        {canSignOut && (
          <SignOutButton
            className={`${row(false)} w-full`}
            label={
              <>
                <Icon d={ICONS.signOut} /> Sign out
              </>
            }
          />
        )}
        <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={`block px-2.5 pt-3 text-[0.6875rem] text-faint hover:text-muted ${large ? "min-h-10" : ""}`}>
          BookBox is open source ↗
        </a>
      </div>
    </>
  );
}

/** How long the phone menu takes to slide in or out (its duration-300 class), or to fade with reduced motion (duration-150). */
const SLIDE_MS = 300;
const FADE_MS = 150;
/** A swipe to the right closes the menu once it's dragged this share of its width, or let go faster than this (px/ms). */
const DISMISS_SHARE = 0.4;
const DISMISS_SPEED = 0.5;

/**
 * Opens and closes the phone menu with a slide from the right. It's driven from here rather than
 * with CSS alone (@starting-style and transitioning `overlay`), which Safari on iPhone doesn't fully
 * support: there the menu appeared without sliding in, and left the screen before sliding out.
 * Opening shows the dialog off-screen first, then slides it in; closing slides it out, then closes it.
 *
 * It can also be swiped closed, back the way it came: it follows the finger to the right, and closes when let go far
 * enough or fast enough, or slides back. Up-and-down swipes scroll it as usual.
 */
function useSlidingDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef<number | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; dx: number; axis: "x" | "y" | null; lastX: number; lastT: number; speed: number } | null>(null);
  const open = useCallback(() => {
    const d = ref.current;
    if (!d) return;
    window.clearTimeout(closing.current);
    if (!d.open) d.showModal();
    // Lay it out off-screen first, so the browser has somewhere to slide from.
    void d.offsetWidth;
    d.dataset.shown = "true";
  }, []);
  const close = useCallback(() => {
    const d = ref.current;
    if (!d?.open || d.dataset.shown !== "true") return;
    d.dataset.shown = "false";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closing.current = window.setTimeout(() => d.close(), still ? FADE_MS : SLIDE_MS);
  }, []);

  const swipe = {
    onPointerDown(e: React.PointerEvent<HTMLDialogElement>) {
      if (e.pointerType === "mouse") return;
      drag.current = { x: e.clientX, y: e.clientY, dx: 0, axis: null, lastX: e.clientX, lastT: e.timeStamp, speed: 0 };
    },
    onPointerMove(e: React.PointerEvent<HTMLDialogElement>) {
      const g = drag.current;
      const d = e.currentTarget;
      if (!g) return;
      const dx = e.clientX - g.x;
      // Decide once, after a few pixels, whether this is a sideways swipe or a scroll.
      if (!g.axis) {
        if (Math.hypot(dx, e.clientY - g.y) < 8) return;
        g.axis = Math.abs(dx) > Math.abs(e.clientY - g.y) ? "x" : "y";
        if (g.axis === "x") d.style.transition = "none";
      }
      if (g.axis !== "x") return;
      g.speed = (e.clientX - g.lastX) / Math.max(1, e.timeStamp - g.lastT);
      g.lastX = e.clientX;
      g.lastT = e.timeStamp;
      g.dx = Math.max(0, dx);
      // Straight onto the element, not through React state, so it keeps up with the finger.
      d.style.transform = `translate3d(${g.dx}px,0,0)`;
    },
    onPointerUp(e: React.PointerEvent<HTMLDialogElement>) {
      const g = drag.current;
      const d = e.currentTarget;
      drag.current = null;
      if (g?.axis !== "x") return;
      // The finger lifting off a link at the end of a swipe isn't a tap on it. (Only the click that comes straight
      // after: a swipe often produces none, and the next real tap must get through.)
      if (g.dx > 0) {
        const swallow = (c: MouseEvent) => c.preventDefault();
        d.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => d.removeEventListener("click", swallow, { capture: true }), 300);
      }
      d.style.transition = "";
      if (g.dx > d.offsetWidth * DISMISS_SHARE || g.speed > DISMISS_SPEED) close();
      // Either way the CSS transition takes it from here: on out, or back into place.
      d.style.transform = "";
    },
    onPointerCancel(e: React.PointerEvent<HTMLDialogElement>) {
      drag.current = null;
      e.currentTarget.style.transition = "";
      e.currentTarget.style.transform = "";
    },
  };
  return { ref, open, close, swipe };
}

export function Nav({ years, lists, canSignOut }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { ref: menuRef, open: openMenu, close: closeMenu, swipe } = useSlidingDialog();
  // The tab you just tapped, lit at once rather than when its page arrives; it counts only until you're somewhere new.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);

  // Close the drawer once something in it is picked (the page or its filters change).
  const location = `${pathname}?${params}`;
  useEffect(() => closeMenu(), [location, closeMenu]);
  useEffect(() => notePage(pathname), [pathname]);
  useEffect(() => {
    const place = params.size ? location : pathname;
    notePlace(place);
    arrivedAt(place);
  }, [location, params.size, pathname]);
  // Before a link takes you away, note how far down this page you were (capture: before the navigation starts).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (link) rememberScroll(link);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (pathname === "/login") return null;
  const onLibrary = pathname === "/library";
  // Pages reached from the Menu tab, which lights up while you're on one.
  const inMenu = ["/people", "/tags", "/lists", "/series", "/calendar", "/missing-covers", "/missing-isbns", "/duplicates", "/refresh", "/spotify", "/settings"].some((p) => pathname.startsWith(p));

  const tabs = [
    { href: "/library", label: "Library", d: ICONS.library, active: onLibrary || (pathname.startsWith("/books/") && pathname !== "/books/new") },
    { href: "/books/new", label: "Add", d: ICONS.add, active: pathname === "/books/new" },
    { href: "/stats", label: "Stats", d: ICONS.stats, active: pathname.startsWith("/stats") },
  ];
  const tappedIndex = tapped?.from === location ? tabs.findIndex((t) => t.href === tapped.href) : -1;
  // Which tab is lit: the one just tapped, else this page's (the Menu tab is the last), else none.
  const lit = tappedIndex >= 0 ? tappedIndex : inMenu ? tabs.length : tabs.findIndex((t) => t.active);

  return (
    <>
      {/* Desktop: Oku-style sidebar. */}
      <aside style={{ viewTransitionName: "sidebar" }} className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-sidebar px-3 py-5 md:flex">
        <SidebarLinks years={years} lists={lists} canSignOut={canSignOut} />
      </aside>

      {/* Phone: the same links on a full-screen panel that slides in from the right, opened by the Menu tab. */}
      <dialog
        ref={menuRef}
        aria-label="Menu"
        data-shown="false"
        style={{ viewTransitionName: "menu" }}
        // Escape slides it away too, rather than closing it at once.
        onCancel={(e) => {
          e.preventDefault();
          closeMenu();
        }}
        // Picking any link closes it.
        onClick={(e) => {
          if ((e.target as Element).closest("a")) closeMenu();
        }}
        {...swipe}
        // Slides in from the right; with reduced motion it fades in where it is instead.
        className="m-0 h-dvh max-h-none w-full max-w-none touch-pan-y overflow-y-auto overscroll-contain bg-sidebar p-0 text-ink backdrop:bg-transparent motion-safe:[transform:translate3d(100%,0,0)] motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-(--vt-ease) motion-safe:will-change-transform motion-safe:data-[shown=true]:[transform:translate3d(0,0,0)] motion-reduce:opacity-0 motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:ease-out motion-reduce:data-[shown=true]:opacity-100 md:hidden"
      >
        <button
          type="button"
          onClick={closeMenu}
          aria-label="Close menu"
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex size-10 items-center justify-center rounded-full text-muted hover:text-ink"
        >
          <Icon d={ICONS.close} className="size-5" />
        </button>
        <div className="flex min-h-full flex-col gap-6 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SidebarLinks years={years} lists={lists} canSignOut={canSignOut} large />
        </div>
      </dialog>

      {/* Phone: bottom tab bar. */}
      <nav
        aria-label="Tabs"
        style={{ viewTransitionName: "tab-bar" }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <TabBlob index={lit} count={tabs.length + 1} />
        {/* The tabs fill the bar, 8 pixels apart and from its edges, and each lights up across its whole width. */}
        <div className="relative flex gap-2 px-2">
          {tabs.map((t, i) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              onClick={() => setTapped({ href: t.href, from: location })}
              // Touching it fetches the whole page (src/components/TouchPrefetch.tsx).
              data-prefetch="full"
              className={`flex min-h-10 min-w-10 flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem] transition-[color,opacity] duration-200 active:opacity-60 ${lit === i ? "text-ink" : "text-muted"}`}
            >
              <Icon d={t.d} className="size-5" />
              {t.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={openMenu}
            aria-haspopup="dialog"
            className={`flex min-h-10 min-w-10 flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem] transition-[color,opacity] duration-200 active:opacity-60 ${lit === tabs.length ? "text-ink" : "text-muted"}`}
          >
            <Icon d={ICONS.menu} className="size-5" />
            Menu
          </button>
        </div>
      </nav>
    </>
  );
}

/** The space between tabs, and between the outer tabs and the screen's edges (the tab row's gap-2 and px-2). */
const TAB_GAP = "0.5rem";

/**
 * The rounded rectangle behind the lit tab, as wide as the tab. Moving to another tab, a second drop trails the pill and the
 * gooey filter melts the two together, so it stretches across like liquid and snaps back into shape.
 * Without SVG filters on HTML (some Safari versions) the two drops just overlap into a longer pill.
 */
function TabBlob({ index, count }: { index: number; count: number }) {
  const drop = "absolute left-0 transition-transform motion-reduce:transition-none";
  // One tab's width, stepped along by a tab and a gap (a percentage in translateX is of the drop's own width).
  const at = { width: `calc((100% - ${count - 1} * ${TAB_GAP}) / ${count})`, transform: `translateX(calc(${Math.max(index, 0)} * (100% + ${TAB_GAP})))` };
  return (
    <>
      <GooeyFilter id="tab-goo" />
      <div aria-hidden className={`pointer-events-none absolute inset-x-2 top-0 bottom-[env(safe-area-inset-bottom)] transition-opacity duration-200 ${index < 0 ? "opacity-0" : ""}`} style={{ filter: "url(#tab-goo)" }}>
        {/* The pill gets there in 240ms and the trailing drop catches up by 300ms, on the page transitions' curve. */}
        <div className={`${drop} inset-y-1 duration-[240ms] ease-(--vt-ease)`} style={at}>
          <div className="h-full w-full rounded-xl bg-raised" />
        </div>
        <div className={`${drop} inset-y-3 duration-300 ease-(--vt-ease)`} style={at}>
          <div className="mx-auto h-full w-[70%] rounded-xl bg-raised" />
        </div>
      </div>
    </>
  );
}
