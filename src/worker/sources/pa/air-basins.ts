import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, cleanText, decodeEntities, extractHtml } from "../lib/html";
import { getText } from "../lib/http";
import { RuleChangedError } from "../statutory-fallback";
import type { ActiveSource } from "../types";

const RULE = "https://www.pacodeandbulletin.gov/secure/pacode/data/025/chapter129/s129.14.html";
const BOUNDARIES = "https://www.pacodeandbulletin.gov/secure/pacode/data/025/chapter121/s121.1.html";
const META = {
  id: "pa-dep-local-air-basins", state: "PA", scope: "county", stack: "Pennsylvania Code HTML",
  sourceName: "Pennsylvania DEP (25 Pa. Code §§ 121.1 and 129.14)", sourceUrl: RULE, officialUrl: BOUNDARIES,
} as const;

// Allegheny and Philadelphia are covered by their own local air programs.
const BASINS = [
  { name: "Allentown, Bethlehem, Easton", parts: ["Lehigh", "Northampton"] },
  { name: "Erie", parts: ["Erie"] },
  { name: "Harrisburg", parts: ["Cumberland", "Dauphin"] },
  { name: "Johnstown", parts: ["Cambria"] },
  { name: "Lancaster", parts: ["Lancaster"] },
  { name: "Lower Beaver Valley", parts: ["Beaver"] },
  { name: "Monongahela Valley", parts: ["Fayette", "Washington", "Westmoreland"] },
  { name: "Reading", parts: ["Berks"] },
  { name: "Scranton, Wilkes-Barre", parts: ["Lackawanna", "Luzerne"] },
  { name: "Southeast Pennsylvania", whole: ["Bucks", "Chester", "Delaware", "Montgomery"] },
  { name: "Upper Beaver Valley", parts: ["Lawrence"] },
  { name: "York", parts: ["York"] },
] as const;

const COUNTIES = BASINS.flatMap((basin) => {
  const scope = "parts" in basin ? "part" : "county";
  return ("parts" in basin ? basin.parts : basin.whole).map((name) => ({
    ...countyByName(META.state, name)!, scope, basin: basin.name,
  } as const));
});

const RULE_DIGEST = "895042a8d9aa583dc1e042cb78f181ab48d054993dc059f33afd55a3b31b73f0";
const BOUNDARY_DIGEST = "fe2f4e5744dd1db8a75e7e8af690d7baa4bacce8bd67b7e97e0a7a9285b1a15b";

export async function parsePaAirBasins(rule: Response | string, boundaries: string, now: Date): Promise<CountyStatus[]> {
  const sections = blockAfterHeading((await extractHtml(rule)).blocks, "§ 129.14. Open burning operations.", {
    requireUnique: true, headingTag: "h4",
  });
  const end = sections.findIndex(({ text }) => text === "Source");
  const definitions = Array.from(boundaries.matchAll(/<i>([^<]+ air basin)<\/i>&#151;([^<\n]+)/gi),
    ([, name, area]) => cleanText(decodeEntities(`${name} — ${area}`)));
  if (end <= 0 || await sha256(sections.slice(0, end).map(({ text }) => text).join("\n")) !== RULE_DIGEST ||
      !boundaries.includes('<A NAME="121.1.">') || await sha256(definitions.join("\n")) !== BOUNDARY_DIGEST) {
    throw new RuleChangedError("Pennsylvania DEP: the open-burning rule or reviewed air basin boundaries changed");
  }
  const checked = now.toISOString();
  return COUNTIES.map(({ fips, name, scope, basin }) => ({
    fips, county: name, state: META.state, sourceId: META.id, scope, standing: true, status: "restricted",
    scopeNote: scope === "part" ? `Municipalities listed in the ${basin} air basin in § 121.1` :
      `Covered open burning in the ${basin} air basin, throughout ${name}`,
    label: "Air basin open-burning restrictions",
    note: "25 Pa. Code § 129.14 generally prohibits open burning in this air basin. The rule lists exceptions for certain farm operations, domestic refuse, recreational or ceremonial fires, cooking and other activities. Clearing and grubbing waste has separate approval and equipment requirements. Local rules can be stricter.",
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    checked, since: null, expires: null, sourceUpdated: null,
  }));
}

export const paDepAirBasins: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", recurring: true,
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [5] },
  reportingFips: COUNTIES.map(({ fips }) => fips),
  async fetch({ now }) {
    const rule = await getText(RULE, { maxBytes: 50_000 });
    const boundaries = await getText(BOUNDARIES, { maxBytes: 500_000 });
    return { rows: await parsePaAirBasins(rule, boundaries, now) };
  },
};
