"use client";

/* eslint-disable @next/next/no-img-element -- previews of local files and OpenLibrary covers */
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveBookAction } from "@/app/books/actions";
import type { Book } from "@/lib/books";
import type { OLDetails } from "@/lib/openlibrary";
import { Cover } from "./Cover";
import { MultiPicker, StarInput, Toggle, YearsInput, type Option } from "./inputs";
import { OpenLibraryLookup } from "./OpenLibraryLookup";

export type FormOptions = {
  shelves: string[];
  tags: string[];
  people: Option[];
};

type Fields = {
  title: string;
  author: string;
  additional_authors: string;
  isbn13: string;
  description: string;
  review: string;
  spoiler: string;
  quotes: string;
  private_notes: string;
  publisher: string;
  publish_year: string;
  pages: string;
  ol_work: string;
  ol_edition: string;
};

// The OpenLibrary fields a lookup can fill in.
const OL_FIELDS = ["title", "author", "additional_authors", "isbn13", "description", "publisher", "publish_year", "pages"] as const;
type OLField = (typeof OL_FIELDS)[number];

function initialFields(book?: Book): Fields {
  return {
    title: book?.title ?? "",
    author: book?.author ?? "",
    additional_authors: book?.additional_authors ?? "",
    isbn13: book?.isbn13 ?? "",
    description: book?.description ?? "",
    review: book?.review ?? "",
    spoiler: book?.spoiler ?? "",
    quotes: book?.quotes ?? "",
    private_notes: book?.private_notes ?? "",
    publisher: book?.publisher ?? "",
    publish_year: book?.publish_year?.toString() ?? "",
    pages: book?.pages?.toString() ?? "",
    ol_work: book?.ol_work ?? "",
    ol_edition: book?.ol_edition ?? "",
  };
}

/** Shrinks a photo in the browser so uploads from a phone stay small. */
async function downscale(file: File, maxWidth = 1200): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width <= maxWidth && file.size < 1_500_000) return file;
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], "cover.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function BookForm({ book, options, startScanning = false }: { book?: Book; options: FormOptions; startScanning?: boolean }) {
  const isNew = !book;
  const [state, formAction, saving] = useActionState(saveBookAction, undefined);
  const [fields, setFields] = useState<Fields>(() => initialFields(book));
  const [rating, setRating] = useState<number | null>(book?.rating ?? null);
  const [years, setYears] = useState<number[]>(book?.years ?? []);
  const [shelves, setShelves] = useState<string[]>(book?.shelves ?? ["To Read"]);
  const [tags, setTags] = useState<string[]>(book?.tags.map((t) => t.name) ?? []);
  const [recFor, setRecFor] = useState<string[]>(book?.recommendedFor.map((p) => String(p.id)) ?? []);
  const [recBy, setRecBy] = useState<string[]>(book?.recommendedBy.map((p) => String(p.id)) ?? []);
  const [owned, setOwned] = useState(book?.owned ?? false);
  const [kindle, setKindle] = useState(book?.on_kindle ?? false);

  // Cover: the saved one, an OpenLibrary URL to fetch on save, or a picked file.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [suggestedCover, setSuggestedCover] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [lookupOpen, setLookupOpen] = useState(isNew);
  const [suggestions, setSuggestions] = useState<Partial<Record<OLField, string>>>({});
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  useEffect(() => () => void (filePreview && URL.revokeObjectURL(filePreview)), [filePreview]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  function applyLookup(d: OLDetails) {
    const incoming: Record<OLField, string> = {
      title: d.title,
      author: d.author,
      additional_authors: d.additional_authors,
      isbn13: d.isbn13 ?? "",
      description: d.description,
      publisher: d.publisher,
      publish_year: d.publish_year?.toString() ?? "",
      pages: d.pages?.toString() ?? "",
    };
    const next = { ...fields, ol_work: d.ol_work, ol_edition: d.ol_edition ?? "" };
    const differing: Partial<Record<OLField, string>> = {};
    let filled = 0;
    for (const k of OL_FIELDS) {
      const value = incoming[k].trim();
      if (!value) continue;
      if (!next[k].trim()) {
        next[k] = value;
        filled++;
      } else if (next[k].trim() !== value) {
        differing[k] = value;
      }
    }
    setFields(next);
    setSuggestions(differing);

    const hasCover = (!!book?.cover && !removeCover) || !!filePreview || !!coverUrl;
    if (d.coverUrl && !hasCover) {
      setCoverUrl(d.coverUrl);
      setRemoveCover(false);
      setSuggestedCover(null);
    } else {
      setSuggestedCover(d.coverUrl && d.coverUrl !== coverUrl ? d.coverUrl : null);
    }
    setLookupOpen(false);
    const diffCount = Object.keys(differing).length;
    setLookupNote(
      isNew
        ? null
        : [filled && `Filled ${filled} empty field${filled > 1 ? "s" : ""}.`, diffCount && `${diffCount} field${diffCount > 1 ? "s" : ""} differ. Review below.`]
            .filter(Boolean)
            .join(" ") || "Everything already matches OpenLibrary.",
    );
  }

  function applySuggestion(k: OLField) {
    setFields((f) => ({ ...f, [k]: suggestions[k] ?? f[k] }));
    setSuggestions((cur) => {
      const rest = { ...cur };
      delete rest[k];
      return rest;
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const small = await downscale(file);
    if (small !== file && fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(small);
      fileRef.current.files = dt.files;
    }
    setFilePreview(URL.createObjectURL(small));
    setCoverUrl(null);
    setRemoveCover(false);
  }

  const lookupQuery = fields.isbn13 || [fields.title, fields.author].filter(Boolean).join(" ");
  const showForm = !isNew || !lookupOpen || fields.title;

  const coverPreview = filePreview ?? coverUrl ?? null;
  const hasSavedCover = !!book?.cover && !removeCover;

  function suggestion(k: OLField) {
    const s = suggestions[k];
    if (!s) return null;
    return (
      <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">
        <span className="min-w-0 flex-1">
          <span className="font-medium">OpenLibrary:</span> <span className="line-clamp-3">{s}</span>
        </span>
        <button type="button" className="shrink-0 font-semibold text-accent" onClick={() => applySuggestion(k)}>
          Use
        </button>
      </div>
    );
  }

  const text = (k: OLField | "review" | "spoiler" | "quotes" | "private_notes", label: string, opts: { area?: boolean; hint?: string; inputMode?: "numeric" } = {}) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {opts.area ? (
        <textarea name={k} className="field" value={fields[k]} onChange={set(k)} />
      ) : (
        <input name={k} className="field" value={fields[k]} onChange={set(k)} inputMode={opts.inputMode} />
      )}
      {opts.hint && <span className="mt-1 block text-xs text-muted">{opts.hint}</span>}
      {(OL_FIELDS as readonly string[]).includes(k) && suggestion(k as OLField)}
    </label>
  );

  return (
    <div className="space-y-6">
      {isNew && lookupOpen && !fields.title && (
        <section className="space-y-4">
          <div>
            <h1 className="display text-3xl">Add a book</h1>
            <p className="mt-1 text-muted">Search OpenLibrary or scan the barcode on the back, and the details fill themselves in.</p>
          </div>
          <OpenLibraryLookup onPick={applyLookup} startScanning={startScanning} />
          <button type="button" className="text-sm font-medium text-accent" onClick={() => setLookupOpen(false)}>
            Enter a book by hand instead
          </button>
        </section>
      )}

      {showForm && (
        <form action={formAction} className="space-y-6">
          <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur-md md:top-12">
            <Link href={book ? `/books/${book.id}` : "/"} className="text-muted">
              Cancel
            </Link>
            <span className="truncate display text-lg">{isNew ? "New book" : "Edit book"}</span>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {state?.error && <p className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{state.error}</p>}

          {book && <input type="hidden" name="id" value={book.id} />}
          <input type="hidden" name="ol_work" value={fields.ol_work} />
          <input type="hidden" name="ol_edition" value={fields.ol_edition} />
          <input type="hidden" name="cover_url" value={coverUrl ?? ""} />
          <input type="hidden" name="cover_remove" value={removeCover ? "1" : ""} />

          <section className="card p-4">
            {lookupOpen && (!isNew || fields.title) ? (
              <OpenLibraryLookup initialQuery={lookupQuery} autoSearch onPick={applyLookup} onCancel={() => setLookupOpen(false)} />
            ) : (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">{lookupNote ?? (fields.ol_work ? "Linked to OpenLibrary." : "Fill in details from OpenLibrary.")}</p>
                <button type="button" className="btn shrink-0" onClick={() => setLookupOpen(true)}>
                  {isNew ? "Search OpenLibrary" : "Refresh from OpenLibrary"}
                </button>
              </div>
            )}
          </section>

          <div className="flex gap-4">
            <div className="w-28 shrink-0 space-y-2">
              {coverPreview ? (
                <img src={coverPreview} alt="" className="aspect-[2/3] w-full rounded-md bg-line object-cover" />
              ) : hasSavedCover ? (
                <Cover cover={book!.cover} title={fields.title} />
              ) : (
                <Cover cover={null} title={fields.title || "No cover"} author={fields.author} />
              )}
              <input ref={fileRef} type="file" name="cover_file" accept="image/*" className="sr-only" id="cover_file" onChange={onFile} />
              <label htmlFor="cover_file" className="btn w-full cursor-pointer px-2 py-1.5 text-xs">
                {coverPreview || hasSavedCover ? "Change" : "Add photo"}
              </label>
              {(coverPreview || hasSavedCover) && (
                <button
                  type="button"
                  className="block w-full text-center text-xs text-muted underline"
                  onClick={() => {
                    setCoverUrl(null);
                    setFilePreview(null);
                    if (fileRef.current) fileRef.current.value = "";
                    setRemoveCover(true);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              {text("title", "Title")}
              {text("author", "Author")}
            </div>
          </div>

          {suggestedCover && (
            <div className="flex items-center gap-3 rounded-lg bg-accent-soft p-3 text-sm">
              <img src={suggestedCover.replace("-L.jpg", "-M.jpg")} alt="" className="h-20 w-14 rounded object-cover" />
              <span className="flex-1">OpenLibrary has a different cover.</span>
              <button
                type="button"
                className="font-semibold text-accent"
                onClick={() => {
                  setCoverUrl(suggestedCover);
                  setFilePreview(null);
                  if (fileRef.current) fileRef.current.value = "";
                  setRemoveCover(false);
                  setSuggestedCover(null);
                }}
              >
                Use it
              </button>
            </div>
          )}

          {text("additional_authors", "Additional authors", { hint: "Co-authors, translators, illustrators" })}

          <section className="space-y-5 card p-4">
            <div>
              <span className="mb-1.5 block text-sm font-medium">Shelves</span>
              {shelves.map((s) => (
                <input key={s} type="hidden" name="shelves" value={s} />
              ))}
              <div className="flex flex-wrap gap-1.5">
                {options.shelves.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    aria-pressed={shelves.includes(s)}
                    onClick={() => setShelves((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <YearsInput name="years" value={years} onChange={setYears} />
            <StarInput name="rating" value={rating} onChange={setRating} />
            <div className="divide-y divide-line">
              <Toggle name="owned" label="Owned" checked={owned} onChange={setOwned} />
              <Toggle name="on_kindle" label="On Kindle" checked={kindle} onChange={setKindle} />
            </div>
          </section>

          <MultiPicker
            name="tags"
            label="Tags"
            options={options.tags.map((t) => ({ value: t, label: t }))}
            value={tags}
            onChange={setTags}
            onCreate={(t) => ({ value: t, label: t })}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <MultiPicker
              name="recommended_by"
              label="Recommended by"
              options={options.people}
              value={recBy}
              onChange={setRecBy}
              onCreate={(t) => ({ value: `new:${t}`, label: t })}
              placeholder="Who told you about it?"
            />
            <MultiPicker
              name="recommended_for"
              label="Recommend to"
              options={options.people}
              value={recFor}
              onChange={setRecFor}
              onCreate={(t) => ({ value: `new:${t}`, label: t })}
              placeholder="Who would like it?"
            />
          </div>

          {text("review", "My review", { area: true })}
          {text("quotes", "Quotes", { area: true })}
          {text("spoiler", "Spoilers", { area: true, hint: "Hidden until you tap to reveal." })}
          {text("private_notes", "Private notes", { area: true })}
          {text("description", "Description", { area: true })}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="col-span-2">{text("isbn13", "ISBN", { inputMode: "numeric" })}</div>
            {text("publish_year", "Published", { inputMode: "numeric" })}
            {text("pages", "Pages", { inputMode: "numeric" })}
          </div>
          {text("publisher", "Publisher")}

          <button className="btn btn-primary w-full py-3" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add book" : "Save changes"}
          </button>
        </form>
      )}
    </div>
  );
}
