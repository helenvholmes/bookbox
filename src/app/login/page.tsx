import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center gap-8">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto size-20 rounded-[22%]" />
        <h1 className="mt-4 display text-3xl">BookBox</h1>
      </div>
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </div>
  );
}
