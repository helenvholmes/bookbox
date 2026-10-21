"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, demoMode, isDemoId } from "@/lib/demo";

/** "Start over" in the demo: deletes this visitor's library, so the next page is the snapshot again. */
export async function resetDemoAction() {
  if (!demoMode()) return;
  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  if (isDemoId(id)) (await import("@/lib/demo-library")).removeDemoLibrary(id);
  revalidatePath("/", "layout");
  redirect("/library");
}
