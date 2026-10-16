import { apiJson, apiRoute, getReading, preflight } from "@/lib/api";

/** The books on Currently Reading, most recently updated first. */
export const GET = apiRoute(async (request) => apiJson({ reading: await getReading(request.nextUrl.origin) }));
export const OPTIONS = preflight;
