"use server";

import { revalidatePath } from "next/cache";
import { setGoal } from "@/lib/stats";

export async function setGoalAction(_prev: { savedAt?: number; error?: string } | null, fd: FormData) {
  const year = Number(fd.get("year"));
  const raw = String(fd.get("target") ?? "").trim();
  const target = raw === "" ? null : Number(raw);
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > 1000)) return { error: "Pick a number from 1 to 1000." };
  await setGoal(year, target);
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}
