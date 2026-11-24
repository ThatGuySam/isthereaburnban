import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { localClock, parseUsDate } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { extractHtml, numberedRuleSection } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const COUNTIES = countiesInState("RI");
const REGULATIONS = {
  forest: {
    id: "ri-dem-forest-burning",
    code: "250-RICR-70-00-2",
    scope: "state",
    revision: "2022-01-04",
    sections: ["2.7"],
    fingerprint: "935a787853740f557355c6bad73eaee8e7d3858efffbc16b367377b104f9df1a",
    rules: [CALENDAR_RULES.RI_FOREST, CALENDAR_RULES.RI_FOREST_SPRING],
  },
  parks: {
    id: "ri-dem-park-fires",
    code: "250-RICR-100-00-7",
    scope: "part",
    revision: "2025-05-12",
    sections: ["7.1", "7.11"],
    fingerprint: "867999d7e7d3bbbadd99859cde7cde02feccb2dede3ed7a58a0026a8189b38d9",
    rules: [CALENDAR_RULES.RI_PARKS, CALENDAR_RULES.RI_PARKS_SPRING],
  },
} satisfies Record<string, {
  id: string;
  code: string;
  scope: ActiveSource["scope"];
  revision: string;
  sections: string[];
  fingerprint: string;
  rules: [CalendarRule, ...CalendarRule[]];
}>;

type Regulation = keyof typeof REGULATIONS;

function publisher(regulation: Regulation) {
  const { id, code, scope, rules: [rule] } = REGULATIONS[regulation];
  return {
    id, state: rule.state, scope, stack: "ASP.NET MVC / RICR HTML and calendar",
    sourceName: `Rhode Island DEM (${code})`,
    sourceUrl: rule.officialUrl, officialUrl: rule.officialUrl,
  };
}

export async function parseRiDemRule(input: Response | string, now: Date, regulation: Regulation) {
  const { code, revision, sections, fingerprint, rules } = REGULATIONS[regulation];
  const parts = await extractHtml(input);
  const activeHeading = `${code} ACTIVE RULE`;
  const headers = parts.blocks.filter(({ tag, text }) => tag === "h3" && text === activeHeading);
  const overview = parts.tables.filter(({ heading }) => heading === activeHeading).flatMap(({ rows }) => rows);
  const statuses = overview.filter(([key]) => key === "Regulation Status");
  const dates = overview.filter(([key]) => key === "Effective");
  const clauses = sections.map((number) => numberedRuleSection(parts, number, { compact: true }));
  if (headers.length !== 1 || statuses.length !== 1 || statuses[0][1] !== "Active" || dates.length !== 1 ||
      parseUsDate(dates[0][1] ?? "") !== revision || clauses.some((section) => !section.length) ||
      await sha256(clauses.flat().join("\n")) !== fingerprint) {
    throw new Error(`${code}: active rule text or effective date changed or missing`);
  }

  if (localClock(now, rules[0].zone).date < revision) return [];
  return rules.flatMap((rule) => calendarStatusRows(rule, COUNTIES, publisher(regulation), now, {
    includeTomorrow: true, includeSeasonDates: true,
  }));
}

function makeSource(regulation: Regulation): ActiveSource {
  const meta = publisher(regulation);
  return {
    ...meta, recurring: true, mode: "positive-only", coverage: "restrictions",
    cadence: { kind: "daily", zone: REGULATIONS[regulation].rules[0].zone, hours: [regulation === "forest" ? 9 : 10] },
    async fetch({ now }) {
      const reply = await fetchSource(meta.sourceUrl, { headers: { accept: "text/html" } });
      if (reply.notModified) throw new Error(`Unexpected ${meta.id} 304`);
      return { rows: await parseRiDemRule(reply.response, now, regulation) };
    },
  };
}

export const riDemForest = makeSource("forest");
export const riDemParks = makeSource("parks");
