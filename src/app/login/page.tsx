import { connection } from "next/server";
import { hasAccounts } from "@/lib/accounts";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  await connection();
  const { next } = await props.searchParams;
  const firstSignIn = !(await hasAccounts());
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto size-20 rounded-[22%]" />
        <h1 className="mt-4 display text-3xl">BookBox</h1>
      </div>
      <LoginForm next={typeof next === "string" ? next : "/"} />
      {firstSignIn && (
        <p className="-mt-4 text-center text-sm text-muted">
          First time signing in with an email? Use your email and the BookBox password you&rsquo;ve been using. You can change the password in Settings
          afterwards.
        </p>
      )}
    </main>
  );
}
