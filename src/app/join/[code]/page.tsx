import Link from "next/link";
import { connection } from "next/server";
import { inviteIsOpen } from "@/lib/invites";
import { JoinForm } from "./JoinForm";

export const metadata = { title: "Join BookBox", robots: { index: false, follow: false } };

/** Where an invite link leads: make an account, which comes with an empty library of your own. */
export default async function JoinPage(props: PageProps<"/join/[code]">) {
  await connection();
  const { code } = await props.params;
  const open = await inviteIsOpen(code);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto size-20 rounded-[22%]" />
        <h1 className="mt-4 display text-3xl">Join BookBox</h1>
        <p className="mt-2 text-sm text-muted">
          {open ? "You’ve been invited. Make an account and you’ll get a library of your own; nobody else can see it." : "This invite has been used or has expired."}
        </p>
      </div>
      {open ? (
        <JoinForm code={code} />
      ) : (
        <p className="text-center text-sm text-muted">
          Ask whoever sent it for a new one, or{" "}
          <Link href="/login" className="text-ink underline">
            sign in
          </Link>{" "}
          if you already have an account.
        </p>
      )}
    </main>
  );
}
