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
      {
        codes: "2, 3, 5, 6, 10, and 12", counties: new Set([
          "Bartow", "Carroll", "Cherokee", "Clayton", "Cobb", "Coweta", "DeKalb", "Douglas",
          "Fayette", "Forsyth", "Fulton", "Gwinnett", "Hall", "Henry", "Newton", "Paulding",
          "Rockdale", "Spalding", "Walton",
        ]),
        extra: " The summer rule also restricts prescribed burning here.",
      },
      {
        codes: "2, 3, 4, 5, 6, 10, and 12", counties: new Set([
          "Banks", "Barrow", "Bibb", "Butts", "Catoosa", "Chattooga", "Clarke", "Crawford",
          "Columbia", "Dawson", "Floyd", "Gordon", "Haralson", "Heard", "Houston", "Jackson",
          "Jasper", "Jones", "Lamar", "Lumpkin", "Madison", "Meriwether", "Monroe", "Morgan",
          "Oconee", "Peach", "Pickens", "Pike", "Polk", "Putnam", "Richmond", "Troup",
          "Twiggs", "Upson", "Walker",
        ]),
        extra: "",
      },
    ],
  },
  nonSummer: {
    id: "ga-epd-non-summer", rule: NON_SUMMER, url: NON_SUMMER.officialUrl,
    heading: /^Non-Summer Legal Burn Types$/,
    intro: "During non-summer time (October 1 - April 30)",
    groups: [{
        codes: "1, 2, 3, 4, 5, 6, 7, 10, 12, and 13", counties: new Set([
          "Barrow", "Bartow", "Bibb", "Carroll", "Cherokee", "Clarke", "Clayton", "Cobb",
          "Columbia", "Coweta", "DeKalb", "Douglas", "Fayette", "Floyd", "Forsyth", "Fulton",
          "Gwinnett", "Hall", "Henry", "Houston", "Newton", "Paulding", "Richmond", "Rockdale",
          "Troup", "Walker", "Walton",
        ]),
        extra: "",
      }],
  },
};
type Season = keyof typeof SEASONS;
const OTHER_COUNTIES = "All other counties allow burn types 1-13.";

export function parseEpdSeasonal(parts: HtmlParts, now: Date, season: Season): CountyStatus[] {
  const { heading, intro, groups } = SEASONS[season];
  const blocks = blockAfterHeading(parts.blocks, heading);
  const markers = blocks.flatMap(({ tag, text }, index) =>
    tag === "p" && (/^During .*following counties/i.test(text) || text === OTHER_COUNTIES) ? [index] : []);
  if (markers.length !== groups.length + 1 || blocks[markers[groups.length]]?.text !== OTHER_COUNTIES) {
    throw new Error(`GA EPD ${season}: expected burn type sections changed or missing`);
  }
  for (const [i, { codes, counties }] of groups.entries()) {
    const start = markers[i];
    if (blocks[start]?.text !== `${intro}, the following counties allow only allow burn types ${codes}:`) {
      throw new Error(`GA EPD ${season}: expected dates or burn type codes changed`);
    }
    const names = blocks.slice(start + 1, markers[i + 1]).filter(({ tag }) => tag === "li").map(({ text }) => text);
    const unique = new Set(names);
    if (names.length !== counties.size || unique.size !== counties.size || names.some((name) => !counties.has(name))) {
      throw new Error(`GA EPD ${season}: reviewed county group changed`);
    }
  }
  return pinnedRows(now, season);
}

function pinnedRows(now: Date, season: Season) {
  const { rule, id, url, groups } = SEASONS[season];
  const counties = groups.flatMap(({ counties, extra }) => [...counties].map((name) => {
    const county = countyByName("GA", name);
    if (!county) throw new Error(`GA EPD ${season}: unmapped county ${name}`);
    return { ...county, extra };
  }));
  const checked = now.toISOString();
  return calendarDayWindows(rule, now).flatMap((window) => counties.map(({ fips, name, extra }) => ({
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
    coverage: "restrictions", mode: "positive-only", recurring: true, pinnedRows: (now) => pinnedRows(now, season),
    cadence: { kind: "daily", zone: rule.zone, hours: [0] },
    async fetch({ now }) {
      const reply = await fetchSource(url, { headers: { accept: "text/html" } });
      if (reply.notModified) throw new Error("Unexpected GA EPD 304");
      return { rows: parseEpdSeasonal(await extractHtml(reply.response), now, season) };
    },
  };
}

export const gaEpdSummer = epdSource("summer");
export const gaEpdNonSummer = epdSource("nonSummer");
