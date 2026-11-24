import { countiesInState, COUNTY_BY_FIPS } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading } from "../lib/html";
import { fetchSource } from "../lib/http";
import { parseWpPageBlocks, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const OFF_SEASON = CALENDAR_RULES.MA_BRUSH_OFF_SEASON;
const MUNICIPAL = CALENDAR_RULES.MA_BRUSH_MUNICIPAL;
const STATEWIDE = [OFF_SEASON, CALENDAR_RULES.MA_BRUSH_OUTSIDE_HOURS, CALENDAR_RULES.MA_BRUSH_PERMITS];
const COUNTIES = countiesInState(OFF_SEASON.state);
const POST = {
  id: 44052,
  url: "https://woburnma.gov/news/2025/01/2025-open-burning-safety-january-15-to-may-1/",
};
const META = {
  id: "ma-residential-brush-burning", state: OFF_SEASON.state, scope: OFF_SEASON.scope,
  stack: "WordPress REST / HTML and regulatory calendar",
  sourceName: "MassDEP guidance republished by the City of Woburn",
  sourceUrl: wpRestUrl(new URL(POST.url).origin, `posts/${POST.id}`, {
    _fields: "id,status,link,modified_gmt,content",
  }),
  officialUrl: OFF_SEASON.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// Reviewed against 310 CMR 7.07(2)–(3) and MassDEP's 2026 letter to chiefs.
const REVIEWED_TERMS = "0d85dc5b25a48557c41cbc00bf78f3fc2a607b04068db1317478a49f9dcaebfc";
const MUNICIPAL_LIST = /^Communities where open burning is prohibited at all times: (.+)\.$/;
// MassGIS TOWN and FIPS_STCO from the official municipalities layer.
const MUNICIPAL_COUNTY = new Map(Object.entries({
  Arlington: "25017", Belmont: "25017", Boston: "25025", Brookline: "25021",
  Cambridge: "25017", Chelsea: "25025", Chicopee: "25013", Everett: "25017",
  "Fall River": "25005", Holyoke: "25013", Lawrence: "25009", Lowell: "25017",
  Malden: "25017", Medford: "25017", "New Bedford": "25005", Newton: "25017",
  Somerville: "25017", Springfield: "25013", Waltham: "25017", Watertown: "25017",
  "West Springfield": "25013", Worcester: "25027",
}));

export async function parseMaOpenBurning(data: unknown, now: Date) {
  const { blocks } = await parseWpPageBlocks(data, POST, now);
  const instructions = blockAfterHeading(blocks, /^Open Burning Permits & Restrictions$/, { requireUnique: true });
  const materials = blockAfterHeading(blocks, /^What Can I Burn\?$/, { requireUnique: true });
  const terms = [...instructions.filter(({ text }) => !MUNICIPAL_LIST.test(text)), ...materials]
    .filter(({ tag }) => tag === "p" || tag === "li").map(({ text }) => text);
  if (await sha256(terms.join("\n")) !== REVIEWED_TERMS) {
    throw new Error("Massachusetts: reviewed brush-burning guidance changed or is missing");
  }

  const lists = instructions.filter(({ tag }) => tag === "p")
    .flatMap(({ text }) => MUNICIPAL_LIST.exec(text)?.[1] ?? []);
  const names = lists[0]?.split(", ") ?? [];
  const towns = new Set(names);
  if (lists.length !== 1 || towns.size !== MUNICIPAL_COUNTY.size || names.length !== towns.size ||
      names.some((town) => !MUNICIPAL_COUNTY.has(town))) {
    throw new Error("Massachusetts: missing or incomplete year-round municipality list");
  }
  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  const places = [...MUNICIPAL_COUNTY].map(([town, fips]) => {
    const county = COUNTY_BY_FIPS.get(fips);
    if (!county || county.state !== OFF_SEASON.state) throw new Error(`Massachusetts: unmapped municipality: ${town}`);
    return { ...county, scopeNote: `Municipality of ${town}, ${county.name}` };
  });
  const options = { includeTomorrow: true };
  return [
    ...STATEWIDE.flatMap((rule) => calendarStatusRows(rule, COUNTIES, META, now, options)),
    ...calendarStatusRows(MUNICIPAL, places, META, now, options),
  ];
}

export const maOpenBurning: ActiveSource = {
  ...META, recurring: true, pinnedRows, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: OFF_SEASON.zone, hours: [0] },
  async fetch({ now }) {
    // Re-evaluate local dates and hours even when the standing guidance has not changed.
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "application/json" }, maxBytes: 64_000, maxResponseAgeMs: 24 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Unexpected Woburn open-burning guidance 304");
    return { rows: await parseMaOpenBurning(await reply.response.json<unknown>(), now) };
  },
};
