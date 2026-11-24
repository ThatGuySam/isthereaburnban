import type { CountyStatus } from "../../../shared/types";
import { countiesInState, countyByName } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const HIGH_HAZARD = CALENDAR_RULES.NC_HIGH_HAZARD;
const META = {
  id: "nc-woodland-permits", state: "NC", scope: "part", stack: "Statute / HTML + calendar",
  sourceName: "N.C. Forest Service (N.C. General Statutes, Article 78)",
  sourceUrl: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByArticle/Chapter_106/Article_78.html",
  officialUrl: HIGH_HAZARD.officialUrl,
} as const;

const COUNTIES = countiesInState(META.state);
const REVIEWED_SECTIONS = [
  ["942", "e34a1b82ef7add1e84fe16ddce3d84edc1b3ff3857c59cff4e77110325fe9941"],
  ["943", "1d5dc7b8cf214db97b52dbbbe2ff3bdd32ed14f4242f85e286cdb1e8026d2851"],
  ["950", "533d436787558cb2c935f4d5c87928f3c52c275ac1f4d8f20902949b5d6f69c6"],
] as const;

export async function parseNcPermits({ blocks }: HtmlParts, now: Date): Promise<CountyStatus[]> {
  const sections = await Promise.all(REVIEWED_SECTIONS.map(async ([section, hash]) => {
    const start = blocks.findIndex(({ text }) => text.startsWith(`§ 106-${section}.`));
    const end = blocks.findIndex(({ text }, index) => index > start && /^§ 106-\d+\./.test(text));
    const text = blocks.slice(start, end < 0 ? undefined : end).map((block) => block.text).join("\n");
    if (start < 0 || await sha256(text) !== hash) throw new Error(`N.C. General Statutes § 106-${section} changed or is missing`);
    return text;
  }));

  const names = /apply only to the counties of (.+?) which are classified/.exec(sections[0])?.[1];
  if (!names) throw new Error("N.C. General Statutes § 106-942: missing high-hazard counties");
  const highHazard = new Set(names.replace(/, and /, ", ").split(", ").map((name) => {
    const county = countyByName(META.state, name);
    if (!county) throw new Error(`Unknown N.C. high-hazard county: ${name}`);
    return county.fips;
  }));
  const eastern = COUNTIES.filter(({ fips }) => highHazard.has(fips));
  const remaining = COUNTIES.filter(({ fips }) => !highHazard.has(fips));
  const rules = [
    { rule: HIGH_HAZARD, counties: eastern },
    { rule: CALENDAR_RULES.NC_WOODLAND, counties: remaining },
    { rule: CALENDAR_RULES.NC_HIGH_HAZARD_CLEARING, counties: eastern },
  ];
  return rules.flatMap(({ rule, counties }) => calendarStatusRows(rule, counties, META, now));
}

export const ncPermits: ActiveSource = {
  ...META, recurring: true, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: HIGH_HAZARD.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected NC statute 304");
    return { rows: await parseNcPermits(await extractHtml(reply.response), now) };
  },
};
