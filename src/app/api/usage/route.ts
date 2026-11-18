import { currentAccount } from "@/lib/session";
import { recordEvents, tracked, type UsageEvent } from "@/lib/usage";
import { CLIENT_KINDS, type ClientKind } from "@/lib/usage-events";

const KINDS = new Set<string>(CLIENT_KINDS);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : typeof v === "number" || typeof v === "boolean" ? v : undefined);

/**
 * Usage events from the browser (UsageTracker): page views, rage clicks and errors. Signed-in only
 * (the proxy answers 401 without a session), and only kept for people other than the owner.
 * Sent with sendBeacon, so the answer isn't read.
 */
export async function POST(req: Request) {
  const account = await currentAccount();
  if (!tracked(account)) return new Response(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { events?: unknown } | null;
  if (!body || !Array.isArray(body.events)) return Response.json({ error: "Expected { events: [...] }" }, { status: 400 });

  const now = Date.now();
  const events: UsageEvent[] = [];
  for (const raw of body.events.slice(0, 100)) {
    const e = raw as { kind?: unknown; path?: unknown; detail?: unknown; at?: unknown };
    if (typeof e?.kind !== "string" || !KINDS.has(e.kind)) continue;
    const detail: Record<string, unknown> = {};
    if (e.detail && typeof e.detail === "object") {
      for (const [k, v] of Object.entries(e.detail).slice(0, 10)) {
        const value = clip(v, 200);
        if (value !== undefined) detail[k.slice(0, 30)] = value;
      }
    }
    // The device's clock, unless it's far off (queued while offline is fine: up to a day back).
    const at = typeof e.at === "number" && e.at <= now + 60_000 && e.at > now - 86_400_000 ? e.at : now;
    events.push({ kind: e.kind as ClientKind, path: typeof e.path === "string" ? e.path : "", detail, at });
  }
  await recordEvents(account.id, events);
  return new Response(null, { status: 204 });
}
