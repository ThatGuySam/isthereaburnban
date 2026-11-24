import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows, ruleCoversCounty, type CalendarRule } from "../lib/calendar";
import { civicPlusPageParagraphs } from "../lib/civicplus";
import { US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const COUNTIES = countiesInState("KS");
const STATE_RULE = CALENDAR_RULES.KS;
const APRIL_RULE = CALENDAR_RULES.KS_APRIL;
const APRIL_COUNTIES = COUNTIES.filter(({ name }) => ruleCoversCounty(APRIL_RULE, name));
const OTHER_COUNTIES = COUNTIES.filter(({ name }) => !ruleCoversCounty(APRIL_RULE, name));
// K.A.R. 28-19-645a replaces the general rule in the designated counties in April.
const OUTSIDE_APRIL: CalendarRule = { ...STATE_RULE, seasons: [["05-01", "03-31"]] };
const FRANKLIN_RULE = {
  state: "KS", zone: US_ZONES.Central, scope: "part", status: "restricted",
  label: "Franklin County open-burning permit required",
  scopeNote: "Most open burning in unincorporated Franklin County",
  note: "Franklin County requires permits for most open burning outside city limits. Call 785-229-3501 for today's status and check permit conditions. Contact your city for its burning rules.",
  officialUrl: "https://www.franklincoks.org/1120/Burn-Permits",
} satisfies CalendarRule;

const STATE_PUBLISHER = {
  id: "ks-state-open-burning",
  sourceName: "Kansas air-quality rules (Johnson County Department of Health and Environment)",
  sourceUrl: "https://www.jocogov.org/department/environment/air-quality/open-burning/burn-regulations",
};
const APRIL_PUBLISHER = {
  id: "ks-april-open-burning", sourceName: "Kansas Forest Service (K.A.R. 28-19-645a)",
  sourceUrl: APRIL_RULE.officialUrl,
};
const FRANKLIN_PUBLISHER = {
  id: "ks-franklin-burn-permits", sourceName: "Franklin County Emergency Management",
  sourceUrl: FRANKLIN_RULE.officialUrl,
};

type Page = Response | string;
const STATE_ARTICLE = "#block-joco-content article";
const APRIL_HEADING = "The regulations will apply to the following 16 counties:";
const APRIL_NAMES = new Set(APRIL_COUNTIES.map(({ name }) => name.replace(/ County$/, "")));
const REVIEWED_STATE_TEXT = "f45e82f30fc9417646869047c817f7b8d5e5d352df40b0830cd60776743e100a";
const REVIEWED_APRIL_TEXT = "41a672b9f9ef10ca92f71c4b8161fe130985428715a79c4a0fb7421ae0cb901f";

export async function parseKansasOpenBurning(input: Page, now: Date) {
  const [body, ...otherArticles] = await extractHtmlGrid(input, {
    row: STATE_ARTICLE,
    cell: `${STATE_ARTICLE} .image-text__body--content > p, ${STATE_ARTICLE} .image-text__body--content > ol > li`,
  });
  const text = body?.map(({ text }) => text) ?? [];
  const start = text.findIndex((line) => line.startsWith("Under the state air quality regulation K.A.R. 28-19-647(a),"));
  const end = text.findIndex((line) => line.startsWith("New regulations in 2011"));
  if (otherArticles.length || start < 0 || end <= start ||
    await sha256(text.slice(start, end).join("\n")) !== REVIEWED_STATE_TEXT) {
    throw new Error("Kansas open-burning rule: reviewed state limits changed or are missing");
  }
  const options = { includeTomorrow: true };
  return [
    ...calendarStatusRows(STATE_RULE, OTHER_COUNTIES, STATE_PUBLISHER, now, options),
    ...calendarStatusRows(OUTSIDE_APRIL, APRIL_COUNTIES, STATE_PUBLISHER, now, options),
  ];
}

export async function parseKansasApril(input: Page, now: Date) {
  const { blocks, tables } = await extractHtml(input);
  const section = blockAfterHeading(blocks, /^Regulations$/, { requireUnique: true });
  const end = section.findIndex(({ tag, text }) => tag === "h2" && text === APRIL_HEADING);
  const summary = section.slice(0, end).filter(({ tag }) => tag === "p").map(({ text }) => text);
  const [table, ...duplicates] = tables.filter(({ heading }) => heading === APRIL_HEADING);
  const names = table?.rows.flat() ?? [];
  const validNames = names.length === APRIL_NAMES.size && APRIL_NAMES.size === APRIL_RULE.counties?.size &&
    new Set(names).size === names.length && names.every((name) => APRIL_NAMES.has(name));
  if (end < 0 || duplicates.length || !validNames ||
    await sha256(summary.join("\n")) !== REVIEWED_APRIL_TEXT) {
    throw new Error("Kansas April open-burning rule: reviewed limits or county table changed or are missing");
  }
  return calendarStatusRows(APRIL_RULE, APRIL_COUNTIES, APRIL_PUBLISHER, now, {
    includeTomorrow: true, includeSeasonDates: true,
  });
}

export async function parseFranklinPermits(input: Page, now: Date) {
  const text = await civicPlusPageParagraphs(input, "Burn Permits");
  if (text[0] !== "Franklin County requires a burn permit for most open burning conducted in the unincorporated areas of Franklin County." ||
    text[1] !== "Burn permits issued by Franklin County do not apply inside incorporated city limits. If you live within a city, contact your city for its burning requirements." ||
    !text.includes("For current burning status, call 785-229-3501.")) {
    throw new Error("Franklin County: reviewed burn-permit guidance changed or is missing");
  }
  return calendarStatusRows(FRANKLIN_RULE, COUNTIES.filter(({ fips }) => fips === "20059"), FRANKLIN_PUBLISHER, now, {
    includeTomorrow: true,
  });
}

function standingSource({ rule, publisher, stack, hour, parse }: {
  rule: CalendarRule;
  publisher: typeof STATE_PUBLISHER;
  stack: string;
  hour: number;
  parse: typeof parseKansasOpenBurning;
}): ActiveSource {
  return {
    ...publisher, stack, state: rule.state, scope: rule.scope, officialUrl: rule.officialUrl,
    coverage: "restrictions", mode: "positive-only", recurring: true,
    cadence: { kind: "daily", zone: rule.zone, hours: [hour] },
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, {
        headers: { accept: "text/html" }, maxBytes: 250_000, maxResponseAgeMs: 48 * 3_600_000,
      });
      if (reply.notModified) throw new Error(`${publisher.sourceName}: unexpected 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
}

export const ksOpenBurning = standingSource({
  rule: STATE_RULE, publisher: STATE_PUBLISHER, stack: "Drupal / HTML and calendar", hour: 0, parse: parseKansasOpenBurning,
});
export const ksAprilBurning = standingSource({
  rule: APRIL_RULE, publisher: APRIL_PUBLISHER, stack: "WordPress / HTML and calendar", hour: 0, parse: parseKansasApril,
});
export const ksFranklinPermits = standingSource({
  rule: FRANKLIN_RULE, publisher: FRANKLIN_PUBLISHER, stack: "CivicPlus / HTML and calendar", hour: 1, parse: parseFranklinPermits,
});
