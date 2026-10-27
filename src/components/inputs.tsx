"use client";

import { useId, useState, type MouseEvent, type PointerEvent } from "react";
import { ratingAt, Stars } from "./Stars";

export type Option = { value: string; label: string };

/**
 * Chips for the chosen values plus a filtered suggestion list. `onCreate`
 * turns typed text into a new value (e.g. a new tag or person).
 */
export function MultiPicker({
  name,
  label,
  options,
  value,
  onChange,
  onCreate,
  placeholder,
}: {
  name: string;
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  onCreate?: (text: string) => Option;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Option[]>([]);
  const listId = useId();

  const all = [...options, ...created];
  const labelFor = (v: string) => all.find((o) => o.value === v)?.label ?? v;
  const needle = text.trim().toLowerCase();
  const matches = all.filter((o) => !value.includes(o.value) && (!needle || o.label.toLowerCase().includes(needle))).slice(0, 8);
  const exact = all.some((o) => o.label.toLowerCase() === needle);

  function add(v: string) {
    onChange([...value, v]);
    setText("");
    setOpen(false);
  }
  function create() {
    if (!onCreate || !needle) return;
    const opt = onCreate(text.trim());
    setCreated((c) => [...c, opt]);
    add(opt.value);
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {value.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <button key={v} type="button" className="chip" aria-pressed="true" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${labelFor(v)}`}>
            {labelFor(v)} <span aria-hidden>×</span>
          </button>
        ))}
      </div>
      <div className="relative mt-2">
        <input
          className="field py-2 text-sm"
          placeholder={placeholder ?? `Add ${label.toLowerCase()}…`}
          value={text}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`Add ${label.toLowerCase()}`}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Prefer an existing match; creating needs no match (or the explicit "Add" row).
            if (matches[0]) add(matches[0].value);
            else if (onCreate && needle && !exact) create();
          }}
        />
        {/* Only while typing, so the list never sits over the next field waiting to catch a tap. */}
        {open && needle && (matches.length > 0 || (onCreate && !exact)) && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto card py-1">
            {matches.map((o) => (
              <li key={o.value} role="option" aria-selected={false}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm active:bg-accent-soft" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.value)}>
                  {o.label}
                </button>
              </li>
            ))}
            {onCreate && !exact && (
              <li role="option" aria-selected={false}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm font-medium text-accent active:bg-accent-soft" onMouseDown={(e) => e.preventDefault()} onClick={create}>
                  Add “{text.trim()}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export function StarInput({ name, value, onChange }: { name: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">My rating</span>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="flex items-center gap-3">
        <RatingSlider label="My rating" value={value} onChange={onChange} starsClass="h-7" filledClass="text-ink" />
        {value && (
          <button type="button" className="text-sm text-muted underline" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Five stars to rate with, in half stars: the left half of a star is a half star, the right half
 * a whole one, and tapping the rating you already have clears it. Pointing (or dragging a finger)
 * previews. It's one slider to a screen reader or keyboard: arrows step by half a star, Home and End
 * go to the ends, Delete clears.
 */
export function RatingSlider({
  label,
  value,
  onChange,
  starsClass = "h-5",
  filledClass = "text-muted",
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  starsClass?: string;
  filledClass?: string;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const at = (e: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
    const stars = e.currentTarget.querySelector("svg");
    return stars ? ratingAt(e.clientX, stars.getBoundingClientRect()) : null;
  };
  const pick = (r: number | null) => {
    setPreview(null);
    if (r !== value) onChange(r);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? 0}
      aria-valuetext={value ? `${value} out of 5 stars` : "Not rated"}
      className="-mx-1 w-fit cursor-pointer touch-pan-y rounded-md px-1 py-1 focus-visible:outline-2 focus-visible:outline-muted"
      onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && setPreview(at(e))}
      onPointerLeave={() => setPreview(null)}
      onPointerCancel={() => setPreview(null)}
      onClick={(e) => {
        const r = at(e);
        pick(r === value ? null : r);
      }}
      onKeyDown={(e) => {
        const now = value ?? 0;
        const next: Record<string, number> = { ArrowRight: now + 0.5, ArrowUp: now + 0.5, ArrowLeft: now - 0.5, ArrowDown: now - 0.5, Home: 0.5, End: 5, Delete: 0, Backspace: 0 };
        if (!(e.key in next)) return;
        e.preventDefault();
        const r = Math.min(5, next[e.key]);
        pick(r >= 0.5 ? r : null);
      }}
    >
      <Stars rating={preview ?? value} className={starsClass} label={false} filledClass={preview !== null ? "text-ink" : filledClass} />
    </div>
  );
}

export function YearsInput({ name, value, onChange }: { name: string; value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState("");
  const thisYear = new Date().getFullYear();
  const add = (y: number) => {
    if (y > 1900 && y < 2200 && !value.includes(y)) onChange([...value, y].sort());
    setText("");
  };
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Year read</span>
      {value.map((y) => (
        <input key={y} type="hidden" name={name} value={y} />
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((y) => (
          <button key={y} type="button" className="chip" aria-pressed="true" onClick={() => onChange(value.filter((x) => x !== y))} aria-label={`Remove ${y}`}>
            {y} <span aria-hidden>×</span>
          </button>
        ))}
        {!value.includes(thisYear) && (
          <button type="button" className="chip" onClick={() => add(thisYear)}>
            + {thisYear}
          </button>
        )}
        <input
          className="field w-24 py-1.5 text-sm"
          inputMode="numeric"
          placeholder="Other"
          aria-label="Add another year"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(Number(text));
            }
          }}
          onBlur={() => text.length === 4 && add(Number(text))}
        />
      </div>
    </div>
  );
}

export function Toggle({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm font-medium">{label}</span>
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-paper"
      />
    </label>
  );
}
