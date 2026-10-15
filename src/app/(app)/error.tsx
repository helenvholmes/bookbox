"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * A page that failed to load (a database hiccup, a lookup that threw): the sidebar stays, and the
 * page can be tried again without losing your place. The error is in the server's logs by its digest.
 */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);

  return (
    <div className="space-y-4 py-16 text-center" role="alert">
      <title>Something went wrong · BookBox</title>
      <h1 className="display text-3xl">Something went wrong</h1>
      <p className="text-muted">This page didn&rsquo;t load. Trying again usually fixes it.</p>
      <div className="flex justify-center gap-3">
        <button type="button" className="btn btn-primary rounded-full px-5" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/library" className="btn rounded-full px-5">
          Library
        </Link>
      </div>
      {error.digest && <p className="text-xs text-faint">Error {error.digest}</p>}
    </div>
  );
}
