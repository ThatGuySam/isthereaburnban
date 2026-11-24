import type { CountyStatus } from "../../../shared/types";
import { countiesInState, countyByName, type County } from "../../counties";
import { localClock, parseLocalDateTime, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, type Block, type HtmlParts } from "../lib/html";
import { pacedSourceReader } from "../lib/http";
import type { ActiveSource } from "../types";

const SITUATION = "https://fpr.vermont.gov/wildfire-situation";
const ZONE = US_ZONES.Eastern;
const HOUR = 3_600_000;
const META = {
  id: "vt-fpr-burning-restrictions", state: "VT", scope: "state", stack: "Drupal / HTML",
  sourceName: "Vermont Department of Forests, Parks and Recreation", sourceUrl: SITUATION, officialUrl: SITUATION,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
const COUNTIES = countiesInState(META.state);
const CLEAR = /^No State[- ]issued burning restrictions at this time\.(?: However, local conditions vary and Town Forest Fire Wardens may have local burning restrictions in place\.)?$/i;
const ORDER_TITLE = /^Vermont (?:Issues Statewide Ban on Debris Burning(?: \| No Burning Permits Shall Be Issued)?|Extends Ban on Debris Burning for [A-Za-z ]+ Counties)$/i;
const STATEWIDE = /\bThe Vermont Department of Forests, Parks and Recreation \(FPR\) has issued an order for all Town Forest Fire Wardens to cease issuing burning permits from (noon|\d{1,2}:\d{2} [AP]M) on ([A-Za-z]+ \d{1,2}, \d{4}), until this order is revoked\./i;
const EXTENSION = /\bThe ban on debris burning issued on [A-Za-z]+ \d{1,2}(?:, \d{4})? by the Vermont Department of Forests, Parks, and Recreation \(FPR\) has been extended in ([A-Za-z, ]+) Counties\. .*?This ban will end on ([A-Za-z]+ \d{1,2}, \d{4}, at \d{1,2}:\d{2} [AP]M)\./i;
const CONTRADICTION = /\b(?:has been|is now|was) (?:lifted|rescinded|revoked)\b|\bno longer in effect\b/i;

type Order = {
  counties: County[];
  scopeNote: string;
  validFrom?: string;
  validUntil?: string;
};

function readOrder(blocks: Block[], now: Date): Order | undefined {
  const statements = blocks.filter(({ tag }) => tag === "p");
  const statewide = statements.map(({ text }) => STATEWIDE.exec(text)).filter((match) => match !== null);
  const extensions = statements.map(({ text }) => EXTENSION.exec(text)).filter((match) => match !== null);
  const matches = statewide.length + extensions.length;
  if (!matches) return;
  if (matches !== 1 || blocks.some(({ text }) => CONTRADICTION.test(text))) {
    throw new Error("Vermont FPR: conflicting debris-burning order language");
  }

  // Both verified order notices concern permit issuance. Campfires and other exempt
  // activities require separate authority before they can be included in a ban.
  if (statewide[0]) {
    const [, time, date] = statewide[0];
    const validFrom = parseLocalDateTime(`${date} ${time.toLowerCase() === "noon" ? "12:00 PM" : time}`, ZONE);
    const age = validFrom ? now.getTime() - Date.parse(validFrom) : NaN;
    if (!validFrom || age > 60 * 24 * HOUR || age < -48 * HOUR) {
      throw new Error("Vermont FPR: unconfirmed effective date for statewide debris-burning order");
    }
    return { counties: COUNTIES, validFrom, scopeNote: "Statewide debris burning that requires a permit" };
  }

  const [, names, end] = extensions[0];
  const validUntil = parseLocalDateTime(end.replace(/, at /i, " at "), ZONE);
  const timeLeft = validUntil ? Date.parse(validUntil) - now.getTime() : NaN;
  if (!validUntil || timeLeft <= 0 || timeLeft > 14 * 24 * HOUR) {
    throw new Error("Vermont FPR: unconfirmed expiration for county debris-burning order");
  }
  const counties = names.split(/,\s*(?:and\s+)?|\s+and\s+/i).map((name) => {
    const county = countyByName(META.state, name);
    if (!county) throw new Error(`Vermont FPR: unknown county in debris-burning order: ${name}`);
    return county;
  });
  if (counties.length < 2 || new Set(counties.map(({ fips }) => fips)).size !== counties.length) {
    throw new Error("Vermont FPR: invalid county list in debris-burning order");
  }
  return { counties, validUntil, scopeNote: "Debris burning that requires a permit in the counties named by FPR" };
}

export async function parseFprSituation(
  parts: HtmlParts,
  now: Date,
  readHtml: (url: string) => Promise<HtmlParts>,
): Promise<CountyStatus[]> {
  const section = blockAfterHeading(parts.blocks, /^Burning Restrictions$/, { requireUnique: true });
  if (!section.length) throw new Error("Vermont FPR: missing or ambiguous Burning Restrictions section");
  if (CLEAR.test(section[0].text)) {
    if (section.slice(1).some(({ text }) => /\b(?:statewide|state[- ]issued|order|burn ban|ban on)\b/i.test(text))) {
      throw new Error("Vermont FPR: conflicting Burning Restrictions section");
    }
    return [];
  }

  let url = SITUATION;
  let order = readOrder(section, now);
  if (!order) {
    const links = section.flatMap(({ text, links }) => (links ?? []).filter((link) =>
      link.text === text && ORDER_TITLE.test(link.text)).map((link) => link.href));
    if (links.length !== 1 || section.some(({ text }) => CONTRADICTION.test(text))) {
      throw new Error("Vermont FPR: unrecognized Burning Restrictions section");
    }
    const candidate = new URL(links[0], SITUATION);
    if (candidate.origin !== new URL(SITUATION).origin || candidate.username || candidate.password ||
      !/^\/(?:news|press-release)\/[a-z0-9-]+$/.test(candidate.pathname) || candidate.search || candidate.hash) {
      throw new Error("Vermont FPR: unrecognized order link");
    }
    url = candidate.href;
    const article = await readHtml(url);
    const body = blockAfterHeading(article.blocks, ORDER_TITLE);
    order = readOrder(body, now);
    if (!order) throw new Error("Vermont FPR: unrecognized debris-burning order");
  }

  const { counties, scopeNote, validFrom, validUntil } = order;
  return counties.map(({ fips, name }) => ({
    fips, county: name, state: META.state, sourceId: META.id,
    status: "ban", scope: "part", scopeNote, label: "FPR debris-burning permit suspension",
    note: "Vermont has suspended permits for covered debris burning in this area. Ask your town forest fire warden about local orders and other kinds of fires.",
    checked: now.toISOString(), sourceUpdated: null, validFrom, validUntil,
    since: validFrom ? localClock(new Date(validFrom), ZONE).date : null,
    expires: validUntil ? localClock(new Date(validUntil), ZONE).date : null,
    sourceName: META.sourceName, sourceUrl: url, officialUrl: url,
  }));
}

export const vtFprRestrictions: ActiveSource = {
  ...META, keepRowLinks: true, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [2, 8, 14, 20] },
  staleMs: 10 * HOUR,
  async fetch({ now }) {
    const read = pacedSourceReader({
      headers: { accept: "text/html" }, maxBytes: 128_000, maxResponseAgeMs: 2 * HOUR, redirect: "manual",
    });
    async function readHtml(url: string) {
      const reply = await read(url);
      if (reply.notModified) throw new Error("Unexpected Vermont FPR 304");
      return extractHtml(reply.response, { blockLinks: true });
    }
    return { rows: await parseFprSituation(await readHtml(SITUATION), now, readHtml) };
  },
};
