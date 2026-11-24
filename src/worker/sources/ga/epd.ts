import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows, type CalendarRule } from "../lib/calendar";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const SUMMER = CALENDAR_RULES.GA;
const RULES_URL = "https://epd.georgia.gov/air-protection-branch/open-burning-rules-georgia";
const NON_SUMMER: CalendarRule = {
  state: SUMMER.state, zone: SUMMER.zone, status: "restricted", scope: "county",
  scopeNote: "Georgia EPD's 27 counties with October–April limits",
  officialUrl: `${RULES_URL}/non-summer-legal-burn-types`,
  label: "October–April open burning restrictions", seasons: [["10-01", "04-30"]],
  note: "October 1 through April 30, Georgia EPD restricts burning storm debris, burning for weed, disease or pest control, and open burning for land clearing, construction or right-of-way maintenance. Check EPD for exceptions and local rules.",
};

const SEASONS = {
  summer: {
    id: "ga-epd-summer", rule: SUMMER, url: `${SUMMER.officialUrl}/summer-legal-burn-map`,
    heading: /^Summer Legal Burn Map$/,
    intro: "During summer (May 1 - September 30)",
    groups: [
      { codes: "2, 3, 5, 6, 10, and 12", count: 19, extra: " The summer rule also restricts prescribed burning here." },
      { codes: "2, 3, 4, 5, 6, 10, and 12", count: 35, extra: "" },
    ],
  },
  nonSummer: {
    id: "ga-epd-non-summer", rule: NON_SUMMER, url: NON_SUMMER.officialUrl,
    heading: /^Non-Summer Legal Burn Types$/,
    intro: "During non-summer time (October 1 - April 30)",
    groups: [{ codes: "1, 2, 3, 4, 5, 6, 7, 10, 12, and 13", count: 27, extra: "" }],
  },
};
type Season = keyof typeof SEASONS;
const OTHER_COUNTIES = "All other counties allow burn types 1-13.";

export function parseEpdSeasonal(parts: HtmlParts, now: Date, season: Season): CountyStatus[] {
  const { rule, id, url, heading, intro, groups } = SEASONS[season];
  const blocks = blockAfterHeading(parts.blocks, heading);
  const markers = blocks.flatMap(({ tag, text }, index) =>
    tag === "p" && (/^During .*following counties/i.test(text) || text === OTHER_COUNTIES) ? [index] : []);
  if (markers.length !== groups.length + 1 || blocks[markers[groups.length]]?.text !== OTHER_COUNTIES) {
    throw new Error(`GA EPD ${season}: expected burn type sections changed or missing`);
  }
  const counties = new Map<string, { name: string; extra: string }>();
  for (const [i, { codes, count, extra }] of groups.entries()) {
    const start = markers[i];
    if (blocks[start]?.text !== `${intro}, the following counties allow only allow burn types ${codes}:`) {
      throw new Error(`GA EPD ${season}: expected dates or burn type codes changed`);
    }
    const names = blocks.slice(start + 1, markers[i + 1]).filter(({ tag }) => tag === "li");
    if (names.length !== count) throw new Error(`GA EPD ${season}: expected ${count} counties in burn type group`);
    for (const { text } of names) {
      const county = countyByName("GA", text);
      if (!county || !SUMMER.counties?.has(text.toLowerCase()) || counties.has(county.fips)) {
        throw new Error(`GA EPD ${season}: unexpected or duplicate county ${text}`);
      }
      counties.set(county.fips, { name: county.name, extra });
    }
  }

  const checked = now.toISOString();
  return calendarDayWindows(rule, now).flatMap((window) => Array.from(counties, ([fips, { name, extra }]) => ({
    ...window, fips, county: name, state: rule.state, status: rule.status, label: rule.label,
    scope: rule.scope, scopeNote: rule.scopeNote, note: rule.note + extra, sourceId: id,
    sourceName: "Georgia Environmental Protection Division", sourceUrl: url, officialUrl: rule.officialUrl,
    checked, sourceUpdated: null, since: null, expires: null,
  })));
}

function epdSource(season: Season): ActiveSource {
  const { rule, id, url } = SEASONS[season];
  return {
    id, state: rule.state, scope: rule.scope, stack: "Drupal / HTML lists and calendar",
    sourceName: "Georgia Environmental Protection Division", sourceUrl: url, officialUrl: rule.officialUrl,
    coverage: "restrictions", mode: "positive-only", recurring: true,
    cadence: { kind: "daily", zone: rule.zone, hours: [0] },
    async fetch({ now }) {
      if (!calendarDayWindows(rule, now).length) return { rows: [] };
      const reply = await fetchSource(url, { headers: { accept: "text/html" } });
      if (reply.notModified) throw new Error("Unexpected GA EPD 304");
      return { rows: parseEpdSeasonal(await extractHtml(reply.response), now, season) };
    },
  };
}

export const gaEpdSummer = epdSource("summer");
export const gaEpdNonSummer = epdSource("nonSummer");
