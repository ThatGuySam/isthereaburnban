// Every county name grouped by state, for the type-ahead on /us/. Slugs are countySlug(name).
import type { APIRoute } from "astro";
import { counties } from "../../components/site-data";

export const GET: APIRoute = () => {
  const byState: Record<string, string[]> = {};
  for (const c of counties) (byState[c.state] ??= []).push(c.name);
  for (const list of Object.values(byState)) list.sort((a, b) => a.localeCompare(b));
  return new Response(JSON.stringify(byState), { headers: { "content-type": "application/json" } });
};
