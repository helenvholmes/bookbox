"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { Facets } from "@/lib/books";
import { SearchBox } from "./SearchBox";

type Props = {
  facets: Facets;
  sorts: Record<string, string>;
};

export function FilterBar({ facets, sorts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [moreOpen, setMoreOpen] = useState(() => !!(params.get("person") || params.get("rating") || params.get("owned")));

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const shelf = params.get("shelf") ?? "";
  const active = ["q", "shelf", "year", "tag", "person", "rating", "owned"].some((k) => params.get(k));

  return (
    <div className={`space-y-3 transition-opacity ${pending ? "opacity-70" : ""}`}>
      <SearchBox value={params.get("q") ?? ""} onSubmit={(q) => update({ q })} />

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
              {t.label} <span className={t.count === 0 && !selected ? "text-faint/50" : "text-faint"}>{t.count}</span>
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
            .filter((t) => t.count > 0 || params.get("tag") === String(t.id))
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
            <option value="borrowed">Borrowed</option>
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
