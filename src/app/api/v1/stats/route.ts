import { apiJson, apiRoute, getApiStats, preflight, yearParam } from "@/lib/api";

/** The Stats page as JSON, for ?year=2025 or (without one) this year. */
export const GET = apiRoute(async (request) => {
  const year = yearParam(request);
  if (year instanceof Response) return year;
  return apiJson(await getApiStats(year, request.nextUrl.origin));
});
export const OPTIONS = preflight;
