import { countiesInState } from "../../counties";
import { calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { decodeFeed } from "../lib/feeds";
import { sha256 } from "../lib/hash";
import { extractHtml, numberedRuleSection } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const COUNTIES = countiesInState("NM");
const BASE_RULE = {
  state: "NM", zone: US_ZONES.Mountain, status: "restricted", scope: "part",
} as const;

const STATE_RULE = {
  ...BASE_RULE,
  officialUrl: "https://www.env.nm.gov/air-quality/burn-smoke-summaries/",
  scopeNote: "Vegetation burning under state air-quality rules outside Bernalillo County and tribal lands",
  label: "State limits on burning vegetation",
  note: "Notify the local fire authority before burning vegetation. State limits cover burn size, setbacks, daylight hours and attendance. Larger burns and some exceptions fall under the smoke management rule. Household trash burning is prohibited. Check local and land-manager fire orders separately.",
} satisfies CalendarRule;

const BERNALILLO_RULE = {
  ...BASE_RULE,
  officialUrl: "https://www.cabq.gov/airquality/air-quality-permits/open-burn-program",
  scopeNote: "Open burning within Albuquerque–Bernalillo County Air Quality Control Board jurisdiction",
  label: "Albuquerque–Bernalillo open-burning limits",
  note: "Open burning requires authorization or a listed exception. Conditional activities have their own limits and may still need fire department approval. Check the daily air-quality update and applicable fire restrictions. Tribal lands outside the local board’s jurisdiction have separate rules.",
} satisfies CalendarRule;

const RULES = {
  state: {
    id: "nm-nmed-open-burning",
    sourceUrl: "https://www.srca.nm.gov/parts/title20/20.002.0060.html",
    sourceName: "New Mexico Environment Department (20.2.60 NMAC)",
    sections: ["20.2.60.2", "20.2.60.109", "20.2.60.110", "20.2.60.111"],
    reviewed: "4f75edec5fdfde92749ca7e612a16e6a67509486b0293bad01862deb8c6e2d2d",
    rule: STATE_RULE,
    counties: COUNTIES.filter(({ fips }) => fips !== "35001"),
    hour: 0,
  },
  bernalillo: {
    id: "nm-bernalillo-open-burning",
    sourceUrl: "https://www.srca.nm.gov/parts/title20/20.011.0021.html",
    sourceName: "Albuquerque–Bernalillo County Air Quality Control Board (20.11.21 NMAC)",
    sections: ["20.11.21.2", "20.11.21.12", "20.11.21.13", "20.11.21.14"],
    reviewed: "af728e939065404115d814520ce06eadeebaf5d1f8c36431ba2c9e4e97ca4d3c",
    rule: BERNALILLO_RULE,
    counties: COUNTIES.filter(({ fips }) => fips === "35001"),
    hour: 1,
  },
};

export async function parseNmOpenBurning(bytes: ArrayBuffer, jurisdiction: keyof typeof RULES, now: Date) {
  const publisher = RULES[jurisdiction];
  const parts = await extractHtml(decodeFeed(bytes, "windows-1252"));
  const sections = publisher.sections.map((section) => numberedRuleSection(parts, section));
  if (sections.some((section) => !section.length) || await sha256(sections.flat().join("\n")) !== publisher.reviewed) {
    throw new Error(`${publisher.sourceName}: reviewed open-burning rule changed or is missing`);
  }
  return pinnedRows(now, jurisdiction);
}

function pinnedRows(now: Date, jurisdiction: keyof typeof RULES) {
  const publisher = RULES[jurisdiction];
  return calendarStatusRows(publisher.rule, publisher.counties, publisher, now, { includeTomorrow: true });
}

function ruleSource(jurisdiction: keyof typeof RULES): ActiveSource {
  const { id, rule, hour, sourceUrl, sourceName } = RULES[jurisdiction];
  return {
    id, sourceUrl, sourceName, state: rule.state, scope: rule.scope, officialUrl: rule.officialUrl,
    stack: "Administrative code / legacy HTML and calendar", mode: "positive-only", coverage: "restrictions",
    recurring: true, pinnedRows: (now) => pinnedRows(now, jurisdiction),
    cadence: { kind: "daily", zone: rule.zone, hours: [hour] },
    async fetch({ now }) {
      const reply = await fetchSource(sourceUrl, {
        headers: { accept: "text/html" }, maxBytes: 200_000, maxResponseAgeMs: 48 * 3_600_000,
      });
      if (reply.notModified) throw new Error(`${sourceName}: unexpected 304`);
      return { rows: await parseNmOpenBurning(await reply.response.arrayBuffer(), jurisdiction, now) };
    },
  };
}

export const nmOpenBurning = ruleSource("state");
export const nmBernalilloOpenBurning = ruleSource("bernalillo");
