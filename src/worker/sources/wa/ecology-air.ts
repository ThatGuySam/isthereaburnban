import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { localClock, parseLocalDateTime, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://ecology.wa.gov/air-climate/air-quality/smoke-fire/burn-bans";
const META = {
  id: "wa-ecology-air", state: "WA", scope: "part", stack: "Kentico / ASP.NET HTML tables",
  sourceName: "Washington Department of Ecology", sourceUrl: URL, officialUrl: URL,
} as const;
const STAGE = /^Stage ([12]) Burn Ban\b/i;
const SECTION = /^Current air quality burn bans$/i;
const HEADERS = ["County (clean air agency)", "Start date/time", "End date/time"];
const ZONE = US_ZONES.Pacific;

// These names describe order boundaries. The DNR fire danger areas use different boundaries.
const SUBAREAS = new Map([
  ["Methow Valley", "Okanogan"],
  ["Columbia Valley urban growth area, including the Peaceful Valley and Paradise Lakes developments", "Whatcom"],
  ["Columbia Valley urban growth area", "Whatcom"],
]);

export async function parseEcologyAir(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const { blocks, tables } = await extractHtml(input, {
    tableHeading: ({ tag, text }) => tag === "p" && STAGE.test(text),
  });
  const stageHeadings = blockAfterHeading(blocks, SECTION).filter(({ tag, text }) => tag === "p" && STAGE.test(text));
  const stageTables = tables.filter(({ heading }) => STAGE.test(heading));
  if (stageHeadings.length !== 2 || stageTables.length !== 2 ||
      new Set(stageTables.map(({ heading }) => STAGE.exec(heading)?.[1])).size !== 2 ||
      stageTables.some(({ heading }) => !stageHeadings.some(({ text }) => text === heading))) {
    throw new Error("Washington Ecology: expected both current stage tables");
  }

  const rows: CountyStatus[] = [];
  const checked = now.toISOString();
  for (const { heading, rows: [header, ...orders] } of stageTables) {
    const stage = STAGE.exec(heading)?.[1];
    if (header?.length !== HEADERS.length || !HEADERS.every((cell, index) => header[index] === cell)) {
      throw new Error("Washington Ecology: unexpected stage table headers");
    }
    for (const [areaAndIssuer, start, end, ...extra] of orders) {
      if (!extra.length && !start && !end && /^(?:none|no (?:current )?burn bans)\.?$/i.test(areaAndIssuer)) continue;
      const namedArea = /^(.+) \(([^()]+)\)$/.exec(areaAndIssuer);
      const validFrom = start && parseLocalDateTime(start, ZONE);
      const openEnded = /^until further notice\.?$/i.test(end ?? "");
      const validUntil = !openEnded && end ? parseLocalDateTime(end, ZONE) : null;
      if (!namedArea || !validFrom || (!openEnded && !validUntil) || extra.length ||
          (validUntil && validUntil <= validFrom)) {
        throw new Error("Washington Ecology: unrecognized order or effective window");
      }
      if (validUntil && validUntil <= checked) continue;

      const [, area, issuer] = namedArea;
      const county = countyByName("WA", SUBAREAS.get(area) ?? area);
      // Unknown local areas remain unconfirmed until their jurisdiction is verified.
      if (!county) continue;
      rows.push({
        state: META.state, sourceId: META.id, scope: META.scope, county: county.name, fips: county.fips,
        sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL, scopeNote: `${area}, air quality`,
        status: "ban", label: `Stage ${stage} air quality burn ban`,
        note: `${issuer} prohibits outdoor burning in this area. Check the issuer for wood heating rules and exceptions.`,
        checked, sourceUpdated: null, since: localClock(new Date(validFrom), ZONE).date,
        expires: validUntil ? localClock(new Date(validUntil), ZONE).date : null,
        validFrom, validUntil: validUntil ?? undefined,
      });
    }
  }
  return rows;
}

export const waEcologyAir: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [0, 4, 8, 12, 16, 20] },
  staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html", "cache-control": "no-cache" } });
    if (reply.notModified) throw new Error("Unexpected Washington Ecology status 304");
    return { rows: await parseEcologyAir(reply.response, now) };
  },
};
