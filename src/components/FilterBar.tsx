"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Facets } from "@/lib/books";

type Props = {
  facets: Facets;
  sorts: Record<string, string>;
};

export function FilterBar({ facets, sorts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [moreOpen, setMoreOpen] = useState(() => !!(params.get("person") || params.get("rating") || params.get("owned")));
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  useEffect(() => () => clearTimeout(debounce.current), []);

  const shelf = params.get("shelf") ?? "";
  const active = ["q", "shelf", "year", "tag", "person", "rating", "owned"].some((k) => params.get(k));

  return (
    <div className={`space-y-3 transition-opacity ${pending ? "opacity-70" : ""}`}>
      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          inputMode="search"
          placeholder="Search title, author, ISBN"
          aria-label="Search books"
          className="field pl-10"
          value={q}
          onChange={(e) => {
            const value = e.target.value;
            setQ(value);
            clearTimeout(debounce.current);
            debounce.current = setTimeout(() => update({ q: value.trim() || null }), 250);
          }}
        />
      </div>

      {/* Underline tabs, like Oku's "Books | Members". */}
      <div role="tablist" aria-label="Shelves" className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto border-b border-line px-4">
        {[
          { key: "", label: "All", count: facets.total },
          ...facets.shelves.map((s) => ({ key: s.name, label: s.name === "Currently Reading" ? "Reading" : s.name, count: s.count })),
          { key: "none", label: "No shelf", count: facets.noShelf },
        ].map((t) => {
          const selected = shelf === t.key;
          return (
            <button
              key={t.key || "all"}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => update({ shelf: selected || !t.key ? null : t.key })}
              className={`-mb-px shrink-0 border-b-2 pt-1 pb-2.5 text-[0.8125rem] whitespace-nowrap transition ${
                selected ? "border-ink text-ink" : "border-transparent text-faint hover:text-muted"
              }`}
            >
              {t.label} <span className="text-faint">{t.count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select label="Year read" value={params.get("year") ?? ""} onChange={(v) => update({ year: v })}>
          <option value="">Any year</option>
          {facets.years.map((y) => (
            <option key={y.year} value={y.year}>
              {y.year} ({y.count})
            </option>
          ))}
          <option value="none">No year</option>
        </Select>
        <Select label="Tag" value={params.get("tag") ?? ""} onChange={(v) => update({ tag: v })}>
          <option value="">Any tag</option>
          {facets.tags
            .filter((t) => t.count > 0)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count})
              </option>
            ))}
        </Select>
        <Select label="Sort" value={params.get("sort") ?? ""} onChange={(v) => update({ sort: v })}>
          {Object.entries(sorts).map(([k, label]) => (
            <option key={k} value={k === "recent" ? "" : k}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-muted hover:text-ink" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
          {moreOpen ? "Fewer filters" : "More filters"}
        </button>
        {active && (
          <button
            type="button"
            className="text-faint underline hover:text-muted"
            onClick={() => {
              setQ("");
              update({ q: null, shelf: null, year: null, tag: null, person: null, rating: null, owned: null });
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {moreOpen && (
        <div className="grid grid-cols-3 gap-2">
          <Select label="Person" value={params.get("person") ?? ""} onChange={(v) => update({ person: v })}>
            <option value="">Anyone</option>
            <optgroup label="Recommended for">
              {facets.people
                .filter((p) => p.forCount > 0)
                .map((p) => (
                  <option key={`for${p.id}`} value={`for:${p.id}`}>
                    For {p.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Recommended by">
              {facets.people
                .filter((p) => p.byCount > 0)
                .map((p) => (
                  <option key={`by${p.id}`} value={`by:${p.id}`}>
                    By {p.name}
                  </option>
                ))}
            </optgroup>
          </Select>
          <Select label="Rating" value={params.get("rating") ?? ""} onChange={(v) => update({ rating: v })}>
            <option value="">Any rating</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {"★".repeat(r)}
              </option>
            ))}
            <option value="none">Unrated</option>
          </Select>
          <Select label="Format" value={params.get("owned") ?? ""} onChange={(v) => update({ owned: v })}>
            <option value="">Any</option>
            <option value="owned">Owned</option>
            <option value="kindle">On Kindle</option>
          </Select>
        </div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string | null) => void; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select className="field truncate py-2 pr-7 text-[0.8125rem] text-muted" value={value} onChange={(e) => onChange(e.target.value || null)}>
        {children}
      </select>
    </label>
  );
}
