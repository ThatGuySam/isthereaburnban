import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

export const CAHABA_BURNING_URL = "https://cahabavalleyfire.org/open-burning/";
const COUNTIES = countiesInState("AL");
const ADEM = CALENDAR_RULES.AL_ADEM;
const ADEM_SUMMER = CALENDAR_RULES.AL_ADEM_SUMMER;
const JEFFERSON = CALENDAR_RULES.AL_JEFFERSON;
const JEFFERSON_SUMMER = CALENDAR_RULES.AL_JEFFERSON_SUMMER;
const ADEM_PUBLISHER = {
  id: "al-adem-open-burning",
  sourceName: "Alabama Department of Environmental Management (rule reproduced by Cahaba Valley Fire District)",
  sourceUrl: CAHABA_BURNING_URL,
};
const JEFFERSON_PUBLISHER = {
  id: "al-jefferson-open-burning",
  sourceName: "Jefferson County Department of Health",
  sourceUrl: JEFFERSON.officialUrl,
};

type Page = Response | string;

// The district reproduces the air rule in HTML. The Legislature publishes the authoritative PDF.
const ADEM_TEXT_HASH = "02422f3f19e535152b55ddb99225b75ad02edb5b18e574fd83f01348afab5782";
const ADEM_HEADING = /^ALABAMA DEPARTMENT OF ENVIRONMENTAL MANAGEMENT$/;
const JEFFERSON_SUMMARY = "Open burning is prohibited in Jefferson County from April through October. Open burning during other months requires prior approval from the Jefferson County Department of Health.";

export async function parseAdemOpenBurning(input: Page, now: Date) {
  const { blocks } = await extractHtml(input);
  const section = blockAfterHeading(blocks, ADEM_HEADING, { requireUnique: true });
  if (await sha256(section.map(({ text }) => text).join("\n")) !== ADEM_TEXT_HASH) {
    throw new Error("Alabama ADEM: reviewed open-burning rule changed or is missing");
  }
  // County-level summer rows take precedence over the statewide baseline when both apply.
  return [
    ...calendarStatusRows(ADEM, COUNTIES, ADEM_PUBLISHER, now, { includeTomorrow: true }),
    ...calendarStatusRows(ADEM_SUMMER, COUNTIES, ADEM_PUBLISHER, now, {
      includeTomorrow: true, includeSeasonDates: true,
    }),
  ];
}

export async function parseJeffersonOpenBurning(input: Page, now: Date) {
  const { blocks } = await extractHtml(input);
  const section = blockAfterHeading(blocks, /^Open Burning$/, { requireUnique: true });
  if (section[0]?.tag !== "p" || section[0].text !== JEFFERSON_SUMMARY) {
    throw new Error("Jefferson County: reviewed open-burning seasons changed or are missing");
  }
  return [JEFFERSON, JEFFERSON_SUMMER].flatMap((rule) =>
    calendarStatusRows(rule, COUNTIES, JEFFERSON_PUBLISHER, now, {
      includeTomorrow: true, includeSeasonDates: true,
    }));
}

function airRuleSource(
  rule: typeof ADEM,
  publisher: typeof ADEM_PUBLISHER,
  stack: string,
  hour: number,
  parse: typeof parseAdemOpenBurning,
): ActiveSource {
  return {
    ...publisher, stack, state: rule.state, scope: rule.scope, officialUrl: rule.officialUrl,
    coverage: "restrictions", mode: "positive-only", recurring: true,
    cadence: { kind: "daily", zone: rule.zone, hours: [hour] },
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 150_000 });
      if (reply.notModified) throw new Error(`${publisher.sourceName}: unexpected HTTP 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
}

export const alAdemOpenBurning = airRuleSource(ADEM, ADEM_PUBLISHER, "Administrative code / ASP.NET HTML and calendar", 2, parseAdemOpenBurning);
export const alJeffersonOpenBurning = airRuleSource(JEFFERSON, JEFFERSON_PUBLISHER, "ASP.NET MVC / HTML and calendar", 0, parseJeffersonOpenBurning);
