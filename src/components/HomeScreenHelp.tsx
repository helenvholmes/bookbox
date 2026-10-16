"use client";

import { useSyncExternalStore } from "react";

const STANDALONE = "(display-mode: standalone)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(STANDALONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Opened from the home screen (or as an installed app), rather than in a browser tab. */
const isInstalled = () => window.matchMedia(STANDALONE).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Settings → Home screen: how to add BookBox as an app, or a note that you already have. */
export function HomeScreenHelp() {
  // The server can't tell, so it renders the steps; an installed app swaps them for the note.
  const installed = useSyncExternalStore(subscribe, isInstalled, () => false);
  return (
    <section id="home-screen" className="max-w-xl scroll-mt-8 space-y-3">
      <h2 className="section-title">Home screen</h2>
      <p className="text-sm text-muted">
        Add BookBox to your home screen and it opens like an app: full screen, straight away, and even with no signal. Changes you make offline sync when
        you&rsquo;re back.
      </p>
      <div className="card p-5 text-sm">
        {installed ? (
          <p className="text-muted">You&rsquo;re using BookBox from your home screen.</p>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-3">
              <li>
                <p className="font-medium">iPhone or iPad</p>
                <p className="text-muted">
                  Open BookBox in Safari, tap <span className="text-ink">Share</span> (the square with an arrow), then{" "}
                  <span className="text-ink">Add to Home Screen</span>.
                </p>
              </li>
              <li>
                <p className="font-medium">Android</p>
                <p className="text-muted">
                  Open it in Chrome, tap the <span className="text-ink">⋮</span> menu, then <span className="text-ink">Add to home screen</span> (or{" "}
                  <span className="text-ink">Install app</span>).
                </p>
              </li>
              <li>
                <p className="font-medium">Computer</p>
                <p className="text-muted">
                  In Chrome or Edge, click the install icon at the right of the address bar. In Safari on a Mac, choose{" "}
                  <span className="text-ink">File → Add to Dock</span>.
                </p>
              </li>
            </ul>
            <p className="text-xs text-faint">The app keeps its own sign-in, so you&rsquo;ll sign in once more inside it.</p>
          </div>
        )}
      </div>
    </section>
  );
}
