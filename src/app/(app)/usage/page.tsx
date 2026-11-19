import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isOwner, listAccounts } from "@/lib/accounts";
import { currentAccount } from "@/lib/session";
import { recentEvents, USAGE_KEEP_DAYS, type StoredEvent } from "@/lib/usage";

export const metadata = { title: "Usage" };

const WINDOWS = [7, 30, 90, USAGE_KEEP_DAYS];
const SOURCES: Record<string, string> = { goodreads: "Goodreads", libby: "Libby", spotify: "Spotify", hardcover: "Hardcover" };
const VIA: Record<string, string> = { search: "searched", scan: "scanned", manual: "typed in" };

/** /books/123/edit → /books/…/edit, so pages group together whatever book they're about. */
const pageName = (path: string) => path.replace(/\/\d+(?=\/|$)/g, "/…").replace(/^\/(people|s|join)\/[^/]+/, "/$1/…") || "/";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);

function ago(at: number, now: number) {
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const when = (at: number) => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/**
 * The owner's view of how the people they invited use BookBox (see src/lib/usage.ts): who's active,
 * what they've added and imported and from where, and where they get frustrated. Owner only.
 */
export default async function UsagePage(props: PageProps<"/usage">) {
  await connection();
  const account = await currentAccount();
  if (!account || !isOwner(account)) notFound();

  const sp = await props.searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const [accounts, { events, now }] = await Promise.all([listAccounts(), recentEvents(days)]);
  const people = accounts.filter((a) => !a.owner);
  const email = new Map(accounts.map((a) => [a.id, a.email]));
  const who = (id: number) => email.get(id) ?? `Account ${id} (deleted)`;

  const byPerson = new Map<number, StoredEvent[]>();
  for (const e of events) byPerson.set(e.accountId, [...(byPerson.get(e.accountId) ?? []), e]);

  const rows = people
    .map((p) => {
      const evs = byPerson.get(p.id) ?? [];
      const count = (kind: string) => evs.filter((e) => e.kind === kind).length;
      const imported: Record<string, number> = {};
      for (const e of evs) if (e.kind === "import") imported[str(e.detail.source)] = (imported[str(e.detail.source)] ?? 0) + num(e.detail.books);
      const added: Record<string, number> = {};
      for (const e of evs) if (e.kind === "book_added") added[str(e.detail.via)] = (added[str(e.detail.via)] ?? 0) + 1;
      const opens = evs.filter((e) => e.kind === "open");
      return {
        ...p,
        lastSeen: evs[0]?.at ?? null,
        activeDays: new Set(evs.map((e) => new Date(e.at).toISOString().slice(0, 10))).size,
        pages: count("page"),
        added,
        imported,
        connected: [...new Set(evs.filter((e) => e.kind === "connect").map((e) => str(e.detail.service)))],
        rage: count("rage_click"),
        errors: count("js_error") + count("page_error"),
        homeScreen: opens.some((e) => e.detail.standalone === true),
        phone: opens.some((e) => e.detail.phone === true),
        desktop: opens.some((e) => e.detail.phone === false),
      };
    })
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));

  const total = (kind: string) => events.filter((e) => e.kind === kind).length;
  const importedTotal = events.filter((e) => e.kind === "import").reduce((n, e) => n + num(e.detail.books), 0);
  const frustration = events.filter((e) => e.kind === "rage_click" || e.kind === "js_error" || e.kind === "page_error").slice(0, 40);

  // Imports and connections, one line per person and source, with any file looked at but not imported.
  type DataLine = { accountId: number; source: string; books: number; previewed: number; last: number; connected: boolean };
  const data = new Map<string, DataLine>();
  for (const e of events) {
    if (e.kind !== "import" && e.kind !== "import_preview" && e.kind !== "connect") continue;
    const source = str(e.detail.source) || str(e.detail.service);
    const key = `${e.accountId}:${source}`;
    const line = data.get(key) ?? { accountId: e.accountId, source, books: 0, previewed: 0, last: e.at, connected: false };
    if (e.kind === "import") line.books += num(e.detail.books);
    if (e.kind === "import_preview") line.previewed = Math.max(line.previewed, num(e.detail.books));
    if (e.kind === "connect") line.connected = true;
    data.set(key, line);
  }

  // Where rage clicks happen, worst first.
  const hotspots = new Map<string, { page: string; target: string; times: number; people: Set<number> }>();
  for (const e of events) {
    if (e.kind !== "rage_click") continue;
    const page = pageName(e.path);
    const target = str(e.detail.target);
    const h = hotspots.get(`${page} ${target}`) ?? { page, target, times: 0, people: new Set<number>() };
    h.times++;
    h.people.add(e.accountId);
    hotspots.set(`${page} ${target}`, h);
  }

  const pages = new Map<string, { views: number; people: Set<number> }>();
  for (const e of events) {
    if (e.kind !== "page") continue;
    const p = pages.get(pageName(e.path)) ?? { views: 0, people: new Set<number>() };
    p.views++;
    p.people.add(e.accountId);
    pages.set(pageName(e.path), p);
  }

  const active = rows.filter((r) => r.lastSeen !== null).length;

  return (
    <div className="space-y-10 pb-6">
      <div className="space-y-6">
        <Link href="/settings#people" className="block w-fit text-muted hover:text-ink">
          ‹ Settings
        </Link>
        <header>
          <h1 className="display text-3xl">Usage</h1>
          <p className="mt-1 text-sm text-muted">
            How the people you&rsquo;ve invited use BookBox. Only you can see this, and your own use isn&rsquo;t recorded. Times are UTC.
          </p>
        </header>
        <nav aria-label="Time window" className="flex flex-wrap gap-2">
          {WINDOWS.map((d) => (
            <Link key={d} href={`/usage?days=${d}`} replace className="chip" aria-current={d === days ? "true" : undefined}>
              {d === USAGE_KEEP_DAYS ? "Everything" : `${d} days`}
            </Link>
          ))}
        </nav>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Active" value={`${active} of ${people.length}`} />
        <Tile label="Books added" value={total("book_added")} />
        <Tile label="Books imported" value={importedTotal} />
        <Tile label="Rage clicks" value={total("rage_click")} alert={total("rage_click") > 0} />
        <Tile label="Errors" value={total("js_error") + total("page_error")} alert={total("js_error") + total("page_error") > 0} />
      </section>

      <section className="space-y-3">
        <h2 className="section-title">People</h2>
        {people.length === 0 ? (
          <p className="text-sm text-muted">
            Nobody else has an account yet. Invite people from <Link href="/settings#people" className="text-ink underline">Settings</Link>.
          </p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 truncate font-medium">{r.email}</span>
                  <span className="text-xs text-muted">{r.lastSeen ? `Seen ${ago(r.lastSeen, now)}` : `Not seen in ${days} days`}</span>
                </div>
                {r.lastSeen && (
                  <dl className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
                    <Stat label="Active" value={`${r.activeDays} ${r.activeDays === 1 ? "day" : "days"}`} />
                    <Stat label="Pages" value={r.pages} />
                    <Stat
                      label="Added"
                      value={
                        Object.entries(r.added)
                          .map(([via, n]) => `${n} ${VIA[via] ?? via}`)
                          .join(", ") || "none"
                      }
                    />
                    <Stat
                      label="Imported"
                      value={
                        Object.entries(r.imported)
                          .map(([s, n]) => `${n} from ${SOURCES[s] ?? s}`)
                          .join(", ") || "none"
                      }
                    />
                    {r.connected.length > 0 && <Stat label="Connected" value={r.connected.map((s) => SOURCES[s] ?? s).join(", ")} />}
                    <Stat label="On" value={[r.phone && (r.homeScreen ? "phone (home screen)" : "phone"), r.desktop && "computer"].filter(Boolean).join(", ") || "—"} />
                    {r.rage > 0 && <Stat label="Rage clicks" value={r.rage} alert />}
                    {r.errors > 0 && <Stat label="Errors" value={r.errors} alert />}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Getting books in</h2>
        {data.size === 0 ? (
          <p className="text-sm text-muted">No imports or connections in this time.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {[...data.values()]
              .sort((a, b) => b.last - a.last)
              .map((d) => (
                <li key={`${d.accountId}:${d.source}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                  <span className="min-w-0 truncate">
                    {who(d.accountId)} <span className="text-muted">· {SOURCES[d.source] ?? d.source}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {d.books > 0
                      ? `${d.books} ${d.books === 1 ? "book" : "books"} imported`
                      : d.previewed > 0
                        ? <span className="text-danger">Opened a file of {d.previewed}, didn&rsquo;t import</span>
                        : d.connected
                          ? "Connected"
                          : ""}
                    {" · "}
                    {ago(d.last, now)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Frustration</h2>
        <p className="text-sm text-muted">Rage clicks are three or more quick clicks in the same spot, usually on something that didn&rsquo;t respond.</p>
        {hotspots.size > 0 && (
          <ul className="card divide-y divide-line text-sm">
            {[...hotspots.values()]
              .sort((a, b) => b.times - a.times)
              .slice(0, 15)
              .map((h) => (
                <li key={`${h.page} ${h.target}`} className="flex items-baseline justify-between gap-4 px-5 py-3">
                  <span className="min-w-0 break-words">
                    <code className="text-xs">{h.page}</code> <span className="text-muted">{h.target || "(no label)"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {h.times}× · {h.people.size} {h.people.size === 1 ? "person" : "people"}
                  </span>
                </li>
              ))}
          </ul>
        )}
        {frustration.length === 0 ? (
          <p className="text-sm text-muted">No rage clicks or errors in this time.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {frustration.map((e, i) => (
              <li key={i} className="space-y-0.5 px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="min-w-0 truncate">
                    <span className={e.kind === "rage_click" ? "text-danger" : "text-ink"}>
                      {e.kind === "rage_click" ? `Rage click ×${num(e.detail.clicks)}` : e.kind === "page_error" ? "Page failed to load" : "Error"}
                    </span>{" "}
                    <span className="text-muted">· {who(e.accountId)}</span>
                  </span>
                  <span className="text-xs text-muted">{when(e.at)}</span>
                </div>
                <p className="break-words text-xs text-muted">
                  <code>{e.path}</code> {e.kind === "rage_click" ? str(e.detail.target) : str(e.detail.message)}
                  {str(e.detail.digest) && ` (digest ${str(e.detail.digest)})`}
                  {str(e.detail.at) && ` (${str(e.detail.at)})`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Most opened pages</h2>
        {pages.size === 0 ? (
          <p className="text-sm text-muted">No pages opened in this time.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {[...pages.entries()]
              .sort((a, b) => b[1].views - a[1].views)
              .slice(0, 15)
              .map(([page, p]) => (
                <li key={page} className="flex items-baseline justify-between gap-4 px-5 py-2.5">
                  <code className="min-w-0 truncate text-xs">{page}</code>
                  <span className="shrink-0 text-xs text-muted">
                    {p.views} · {p.people.size} {p.people.size === 1 ? "person" : "people"}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, alert = false }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`display mt-1 text-2xl ${alert ? "text-danger" : ""}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}</dt>
      <dd className={alert ? "text-danger" : "text-ink"}>{value}</dd>
    </div>
  );
}
