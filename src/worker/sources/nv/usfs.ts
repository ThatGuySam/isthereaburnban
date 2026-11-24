import type { CountyStatus } from "../../../shared/types";
import { atLocalTime, localClock, parseEndDate, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const FOREST = "https://www.fs.usda.gov/r04/humboldt-toiyabe";
const META = {
  id: "nv-usfs-spring-mountains", state: "NV", scope: "part",
  sourceName: "U.S. Forest Service, Humboldt-Toiyabe National Forest", stack: "Drupal / HTML table",
  sourceUrl: `${FOREST}/fire/fire-restrictions`,
  officialUrl: `${FOREST}/alerts/year-round-fire-restrictions-spring-mountains-national-recreation-area`,
} as const;
const ZONE = US_ZONES.Pacific;
const ORDER = "04-17-24-01";
const SINCE = "2024-01-08"; // Effective date in the Forest Service's current order table.
const EXPIRES = "2027-09-30"; // Midnight at the start of this date in the signed order.

export function parseSpringMountainsOrder(parts: HtmlParts, now: Date): CountyStatus[] {
  const [table, ...others] = parts.tables.filter(({ heading }) => heading === "Current Fire Restrictions");
  const [columns, ...rows] = table?.rows ?? [];
  if (others.length || columns?.join("|") !== "Forest Order No.|Title|Effective Date|Active Until") {
    throw new Error("Humboldt-Toiyabe: unexpected current order table");
  }
  const [row, ...duplicates] = rows.filter(([id]) => id.split(" ")[0] === ORDER);
  if (!row) return [];
  if (duplicates.length || row.length !== 4 || row[1] !== "Spring Mountains NRA: Year-Round" ||
      parseUsDate(row[2]) !== SINCE || parseEndDate(row[3]).kind !== "open-ended" ||
      !parts.links.some(({ href, text }) => href === "/media/115923" && text === ORDER) ||
      !parts.links.some(({ href, text }) => href === "/media/115807" && text === "Map")) {
    throw new Error("Humboldt-Toiyabe: reviewed order or link changed");
  }

  const today = localClock(now, ZONE).date;
  if (today < SINCE || today >= EXPIRES) return [];
  const stamps = parts.blocks.filter(({ tag, text }) => tag === "p" && text.startsWith("Last updated "));
  const [stamp] = stamps;
  const updated = stamp && parseUsDate(stamp.text.slice("Last updated ".length));
  const freshnessEnd = updated && shiftDay(updated, 120);
  if (stamps.length !== 1 || !updated || updated < SINCE || updated > today || !freshnessEnd || today >= freshnessEnd) {
    throw new Error("Humboldt-Toiyabe: missing, stale, or future last update");
  }
  const validUntil = atLocalTime(freshnessEnd < EXPIRES ? freshnessEnd : EXPIRES, 0, ZONE);
  if (!validUntil) throw new Error("Humboldt-Toiyabe: invalid end of order validity");

  return [{
    fips: "32003", county: "Clark County", state: META.state, sourceId: META.id,
    status: "restricted", scope: META.scope,
    scopeNote: "Mapped National Forest lands near homes in the Spring Mountains National Recreation Area",
    label: "Spring Mountains campfire restriction",
    note: "The Forest Service limits campfires within the areas mapped in Order 04-17-24-01. Check the order and map for exceptions, including approved fire pits or grills at developed recreation sites and gas stoves.",
    since: SINCE, expires: EXPIRES, sourceUpdated: null, checked: now.toISOString(), validUntil,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
  }];
}

export const nvUsfsSpringMountains: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [2] },
  staleMs: 30 * 60 * 60 * 1_000,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 400_000,
    });
    if (reply.notModified) throw new Error("Unexpected Humboldt-Toiyabe order table 304");
    return { rows: parseSpringMountainsOrder(await extractHtml(reply.response, { links: true }), now) };
  },
};
