import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { atLocalTime, localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml } from "../lib/html";
import { pacedSourceReader } from "../lib/http";
import { forestServiceAlertCards } from "../lib/usfs";
import type { ActiveSource } from "../types";

const ORIGIN = "https://www.fs.usda.gov";
const ALERTS = "/r09/whitemountain/alerts";
const PATH = `${ALERTS}/town-hall-road-camping-and-fire-restrictions`;
const META = {
  id: "nh-usfs-town-hall-road", state: "NH", scope: "part",
  stack: "Forest Service Drupal / HTML alerts", sourceName: "U.S. Forest Service, White Mountain National Forest",
  sourceUrl: ORIGIN + ALERTS, officialUrl: ORIGIN + PATH,
} as const;
const TITLE = "Town Hall Road Camping and Fire Restrictions";
const ORDER = "R9‑22‑05‑26‑04";
const POSTED = "2026-06-08";
// The signed order and its HTML transcription use June 1, unlike the alert's June 8 posting date.
const SINCE = "2026-06-01";
const EXPIRES = "2031-06-01";
const ZONE = US_ZONES.Eastern;
const STALE_MS = 30 * 60 * 60 * 1_000;
const REVIEWED_TERMS = "6aee4eafc15e2a9bd027e8dea6423bd16169aa2cf0cfa3835486014a178e7f7f";

function hasAlertDate(lines: string[], label: string, date: string) {
  const prefix = `${label}: `;
  const [value, ...duplicates] = lines.filter((line) => line.startsWith(prefix));
  return value !== undefined && !duplicates.length && parseUsDate(value.slice(prefix.length)) === date;
}

export async function parseTownHallRoad(
  listing: Response | string,
  readDetail: () => Promise<Response | string>,
  now: Date,
): Promise<CountyStatus[]> {
  const { date: today } = localClock(now, ZONE);
  if (today < POSTED || today >= EXPIRES) return [];
  const cards = await forestServiceAlertCards(listing);
  const [card, ...duplicates] = cards.filter(({ href, fields }) => href === PATH || fields.includes(`Forest Order: #${ORDER}`));
  if (!card) return [];
  if (duplicates.length || card.href !== PATH || card.title !== TITLE ||
      !card.fields.includes(`Forest Order: #${ORDER}`) ||
      !hasAlertDate(card.fields, "Alert Start Date", POSTED)) {
    throw new Error("White Mountain National Forest: Town Hall Road listing changed");
  }

  const { blocks, links } = await extractHtml(await readDetail(), { links: true });
  const headers = blocks.filter(({ tag }) => tag === "h1");
  const terms = [/^PROHIBITIONS$/, /^EXEMPTIONS$/, /^RESTRICTED AREA$/, /^IMPLEMENTATION$/].map((heading) =>
    blockAfterHeading(blocks, heading, { requireUnique: true }).map(({ text }) => text));
  const documents = links.filter(({ href }) =>
    href.startsWith("/sites/nfs/files/r09/whitemountain/publication/alerts/Town%20Hall%20Road%20"));
  const metadata = blocks.filter(({ tag }) => tag === "p").map(({ text }) => text);
  if (headers.length !== 1 || headers[0].text !== TITLE ||
      !metadata.includes(`Order Number: ${ORDER}`) ||
      !hasAlertDate(metadata, "Alert Start Date", POSTED) || !hasAlertDate(metadata, "Alert End Date", EXPIRES) ||
      !documents.some(({ href }) => href.endsWith("Camping%20and%20Fire%20Restrictions%20%E2%80%93%20Order.pdf")) ||
      !documents.some(({ href }) => href.endsWith("Restricted%20Area%20Map.pdf")) ||
      await sha256(JSON.stringify(terms)) !== REVIEWED_TERMS) {
    throw new Error("White Mountain National Forest: reviewed Town Hall Road order changed or is missing");
  }

  const county = countyByName(META.state, "Carroll");
  const validUntil = atLocalTime(EXPIRES, 0, ZONE);
  if (!county || !validUntil) throw new Error("Invalid Town Hall Road mapping or date");
  return [{
    sourceId: META.id, state: META.state, scope: META.scope, fips: county.fips, county: county.name, status: "restricted",
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    scopeNote: "National Forest lands within a quarter mile of the signed road segments in Jackson and Chatham",
    label: "Town Hall Road campfire restriction",
    note: "Wood and charcoal fires are limited to designated sites near the mapped sections of Slippery Brook and East Branch roads. The order allows portable camp stoves that use manufactured fuels. See the Forest Service order and map.",
    checked: now.toISOString(), sourceUpdated: null, since: SINCE, expires: EXPIRES, validUntil,
  }];
}

export const nhTownHallRoad: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", staleMs: STALE_MS,
  cadence: { kind: "daily", zone: ZONE, hours: [0] }, pollGroup: "nh-daily-rules",
  async fetch({ now }) {
    const read = pacedSourceReader({
      headers: { accept: "text/html" }, maxBytes: 350_000, maxResponseAgeMs: 6 * 60 * 60 * 1_000,
    });
    const response = async (url: string) => {
      const reply = await read(url);
      if (reply.notModified) throw new Error("Unexpected White Mountain National Forest 304");
      return reply.response;
    };
    const listing = await response(META.sourceUrl);
    return { rows: await parseTownHallRoad(listing, () => response(META.officialUrl), now) };
  },
};
