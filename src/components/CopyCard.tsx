"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteLoanAction, lendAction, returnLoanAction, setOwnedAction } from "@/app/(app)/books/actions";
import type { Loan } from "@/lib/books";
import { formatDay, todayLocal } from "@/lib/dates";
import { Avatar } from "./Avatar";
import { ConfirmButton } from "./ConfirmButton";

type Props = { bookId: number; owned: boolean; loans: Loan[]; people: { id: number; name: string }[] };

/**
 * Your own copy: whether you own it, who has it now, and who's borrowed it before. Lending to
 * someone new adds them to People. Needs a connection (like editing people).
 */
export function CopyCard({ bookId, owned, loans, people }: Props) {
  const [pending, start] = useTransition();
  const [lending, setLending] = useState(false);
  const open = loans.find((l) => !l.returnedOn);
  const past = loans.filter((l) => l.returnedOn);
  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <section className="space-y-3">
      <h2 className="section-title">Your copy</h2>
      <div className={`card divide-y divide-line text-[0.8125rem] ${pending ? "opacity-60" : ""}`}>
        {!owned && !open ? (
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="text-muted">You don&rsquo;t own this one.</span>
            <button type="button" className="btn rounded-full px-3 text-xs" disabled={pending} onClick={() => run(() => setOwnedAction(bookId, true))}>
              I own it
            </button>
          </div>
        ) : open ? (
          <div className="space-y-2 p-4">
            <Link href={`/people/${open.person.slug}`} className="flex items-center gap-2.5 hover:text-ink">
              <Avatar id={open.person.id} name={open.person.name} />
              <span>
                Lent to {open.person.name}
                <span className="block text-xs text-muted">since {formatDay(open.lentOn)}</span>
              </span>
            </Link>
            <button type="button" className="btn btn-primary rounded-full px-3 text-xs" disabled={pending} onClick={() => run(() => returnLoanAction(open.id, todayLocal()))}>
              It&rsquo;s back
            </button>
          </div>
        ) : lending ? (
          <LendForm
            people={people}
            pending={pending}
            onCancel={() => setLending(false)}
            onLend={(person) =>
              run(async () => {
                await lendAction(bookId, person, todayLocal());
                setLending(false);
              })
            }
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="text-muted">On your shelf.</span>
            <span className="flex items-center gap-3">
              <button type="button" className="text-xs text-faint hover:text-muted" disabled={pending} onClick={() => run(() => setOwnedAction(bookId, false))}>
                Don&rsquo;t own it
              </button>
              <button type="button" className="btn rounded-full px-3 text-xs" onClick={() => setLending(true)}>
                Lend…
              </button>
            </span>
          </div>
        )}

        {past.length > 0 && (
          <ul className="space-y-2 p-4">
            <li className="text-xs text-faint">Borrowed before</li>
            {past.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <Link href={`/people/${l.person.slug}`} className="min-w-0 flex-1 text-muted hover:text-ink">
                  <span className="block truncate">{l.person.name}</span>
                  <span className="block text-xs text-faint">
                    {l.lentOn === l.returnedOn ? formatDay(l.lentOn, true) : `${formatDay(l.lentOn, true)} – ${formatDay(l.returnedOn!, true)}`}
                  </span>
                </Link>
                <ConfirmButton className="shrink-0 text-faint hover:text-danger" message="Remove this loan from the history?" confirmLabel="Remove" onConfirm={() => run(() => deleteLoanAction(l.id))}>
                  <span aria-label={`Remove ${l.person.name}'s loan`}>×</span>
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Pick someone from People, or type a new name. */
function LendForm({ people, pending, onLend, onCancel }: { people: Props["people"]; pending: boolean; onLend: (person: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const match = people.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <form
      className="space-y-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onLend(match ? String(match.id) : `new:${name.trim()}`);
      }}
    >
      <label className="block space-y-1 text-xs text-faint">
        Lend to
        <input
          autoFocus
          list="lend-people"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Who’s borrowing it?"
          autoComplete="off"
          className="field w-full text-sm"
        />
      </label>
      <datalist id="lend-people">
        {people.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {name.trim() && !match && <p className="text-xs text-faint">{name.trim()} will be added to People.</p>}
      <div className="flex gap-2">
        <button type="button" className="btn rounded-full px-3 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary rounded-full px-3 text-xs" disabled={pending || !name.trim()}>
          Lend
        </button>
      </div>
    </form>
  );
}
