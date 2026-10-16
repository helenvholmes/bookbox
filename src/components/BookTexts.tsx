"use client";

import { useState } from "react";
import { withText } from "@/lib/book-state";
import { submit, usePendingOps } from "@/lib/outbox";
import type { TextField } from "@/lib/sync-ops";
import { ExpandableText } from "./ExpandableText";

const LABELS: Record<TextField, { title: string; add: string; placeholder: string }> = {
  review: { title: "My review", add: "Review", placeholder: "What did you think?" },
  quotes: { title: "Quotes", add: "Quotes", placeholder: "Lines worth keeping" },
  private_notes: { title: "Private notes", add: "Private note", placeholder: "Only you see these; never shared" },
};

type Props = { bookId: number; review: string; quotes: string; spoiler: string; privateNotes: string };

/**
 * Review, quotes, spoilers and private notes. The review, quotes and notes edit in place (and
 * work offline); empty ones are offered as "+ Review" and so on underneath.
 */
export function BookTexts({ bookId, review, quotes, spoiler, privateNotes }: Props) {
  const ops = usePendingOps(bookId);
  const [editing, setEditing] = useState<TextField | null>(null);
  const values: Record<TextField, string> = {
    review: withText("review", review, ops),
    quotes: withText("quotes", quotes, ops),
    private_notes: withText("private_notes", privateNotes, ops),
  };
  const empty = (Object.keys(LABELS) as TextField[]).filter((f) => !values[f].trim() && editing !== f);

  const section = (field: TextField) =>
    editing === field ? (
      <Editor
        key={field}
        field={field}
        value={values[field]}
        onCancel={() => setEditing(null)}
        onSave={(value) => {
          if (value !== values[field]) submit({ kind: "text", bookId, field, value });
          setEditing(null);
        }}
      />
    ) : (
      values[field].trim() && (
        <section key={field} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">{LABELS[field].title}</h2>
            <button type="button" className="text-xs text-faint hover:text-ink" onClick={() => setEditing(field)}>
              Edit
            </button>
          </div>
          <ExpandableText text={values[field]} />
        </section>
      )
    );

  return (
    <>
      {section("review")}
      {section("quotes")}
      {spoiler && (
        <details className="group space-y-3">
          <summary className="section-title cursor-pointer list-none">
            Spoilers <span className="count group-open:hidden">tap to reveal</span>
          </summary>
          <p className="prose-text pt-3">{spoiler}</p>
        </details>
      )}
      {section("private_notes")}
      {empty.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {empty.map((f) => (
            <button key={f} type="button" className="chip hover:text-ink" onClick={() => setEditing(f)}>
              + {LABELS[f].add}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Editor({ field, value, onSave, onCancel }: { field: TextField; value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft.trim());
      }}
    >
      <label className="block space-y-3">
        <span className="section-title block">{LABELS[field].title}</span>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(draft.trim());
          }}
          placeholder={LABELS[field].placeholder}
          rows={Math.min(14, Math.max(5, draft.split("\n").length + 1))}
          className="field prose-text"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn rounded-full px-4" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary rounded-full px-4">Save</button>
      </div>
    </form>
  );
}
