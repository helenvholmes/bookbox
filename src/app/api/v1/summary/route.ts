import { apiJson, apiRoute, getSummary, preflight } from "@/lib/api";

/** What the widget shows: this year's goal, what you're reading, and links into BookBox. */
export const GET = apiRoute(async (request) => apiJson(await getSummary(request.nextUrl.origin)));
export const OPTIONS = preflight;
