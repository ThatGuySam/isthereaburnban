import { countyByName } from "../../counties";
import { calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { extractHtml, matchesReviewedHtmlSection } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.lincoln.ne.gov/City/Departments/Health-Department/Environmental/Air";
const META = {
  id: "ne-lincoln-lancaster-air", state: "NE", scope: "part",
  stack: "Granicus OpenCities / HTML and calendar", sourceName: "Lincoln-Lancaster County Health Department",
  sourceUrl: URL, officialUrl: URL + "#section-4",
} as const;
const RULE_BASE = {
  state: META.state, zone: US_ZONES.Central, status: "restricted", scope: META.scope, officialUrl: META.officialUrl,
} satisfies Omit<CalendarRule, "label" | "note" | "scopeNote">;

const SECTIONS = [
  {
    heading: /^Open Burning Rules Within the City Limits of Lincoln$/,
    fingerprint: "d585905f54ab65cc5d42434774187e93bdbe6a521f04521a686b334c45e02c07",
    rule: {
      ...RULE_BASE, scopeNote: "City of Lincoln, under Lincoln Municipal Code § 8.06.140",
      label: "Lincoln open-burning limits",
      note: "Lincoln prohibits most open burning. The Health Department requires a permit for covered larger cooking or ceremonial fires and certain controlled vegetation burns. Qualifying smaller cooking or ceremonial fires have exceptions under city rules. Check with the Health Department and local fire department about your burn.",
    },
  },
  {
    heading: /^Open Burning Rules Outside the City Of Lincoln$/,
    fingerprint: "cc379cdebb0c13751bd3f382b63be71e4d1032f3634c94753d5c5f16d4d75ca4",
    rule: {
      ...RULE_BASE, scopeNote: "Lancaster County outside the City of Lincoln, under the county air pollution rules",
      label: "Lancaster County air-quality permit limits",
      note: "The Health Department requires a permit for covered home and agricultural burns within 100 yards of specified neighboring properties. It also requires permits for certain commercial, industrial, government and structure burns. Local ordinances and fire department approvals can apply at the same site.",
    },
  },
];

export async function parseNeLincolnAir(input: Response | string, now: Date) {
  const { blocks } = await extractHtml(input);
  const county = countyByName(META.state, "Lancaster");
  if (!county) throw new Error("Missing Lancaster County mapping");
  const reviewed = await Promise.all(SECTIONS.map(({ heading, fingerprint }) =>
    matchesReviewedHtmlSection(blocks, heading, fingerprint)));
  if (!reviewed.every(Boolean)) throw new Error("Lincoln-Lancaster air quality: reviewed permit rules changed or are missing");
  return SECTIONS.flatMap(({ rule }) => calendarStatusRows(rule, [county], META, now, { includeTomorrow: true }));
}

export const neLincolnLancasterAir: ActiveSource = {
  ...META, recurring: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE_BASE.zone, hours: [9] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 350_000 });
    if (reply.notModified) throw new Error("Unexpected Lincoln-Lancaster air quality 304");
    return { rows: await parseNeLincolnAir(reply.response, now) };
  },
};
