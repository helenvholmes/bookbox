import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { INVITE_REQUEST_EMAIL } from "@/lib/constants";

export const metadata = { title: "Sign up" };

/**
 * Where "Sign up" leads. Accounts come from invite links (Settings → People), so this says how to
 * get one, and points to running your own copy for anyone who'd rather not wait.
 */
export default async function SignUpPage() {
  await connection();
  if (await isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/library");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto size-20 rounded-[22%]" />
        <h1 className="mt-4 display text-3xl">Join BookBox</h1>
      </div>
      <div className="card space-y-3 p-5 text-sm leading-relaxed">
        <p className="font-medium">BookBox is invite-only for now.</p>
        <p className="text-muted">
          {INVITE_REQUEST_EMAIL ? (
            <>
              To ask for an invite,{" "}
              <a href={`mailto:${INVITE_REQUEST_EMAIL}?subject=${encodeURIComponent("A BookBox invite")}`} className="text-ink underline">
                send an email
              </a>
              . You&rsquo;ll get a link to make your account.
            </>
          ) : (
            <>If someone you know uses BookBox, ask them for an invite link. It takes you straight to making your account.</>
          )}
        </p>
        <p className="text-muted">Already have a link? Open it, and you&rsquo;ll set up your library from there.</p>
      </div>
      <p className="text-center text-sm text-muted">
        Rather not wait?{" "}
        <Link href="/about#run-your-own" className="text-ink underline">
          Run your own copy
        </Link>
        . It&rsquo;s free and open source. Have an account?{" "}
        <Link href="/login" className="text-ink underline">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
