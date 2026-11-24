// City pages per state for the Worker's sitemaps: [[slug, [county FIPS...]], ...]. lastmod comes from the counties.
import type { APIRoute } from "astro";
import { placesInState, states } from "../../../components/site-data";

export function getStaticPaths() {
  return states.filter((s) => placesInState(s.abbr).length).map((s) => ({ params: { st: s.abbr.toLowerCase() } }));
}

export const GET: APIRoute = ({ params }) => {
  const rows = placesInState(String(params.st).toUpperCase()).map((p) => [p.slug, p.counties]);
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
};
