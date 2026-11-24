import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { msToIso } from "../lib/arcgis";
import { atLocalTime, localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, htmlText, parseHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import { parseWpPage, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const DOUGLAS_URL = "https://dcsheriff.net/sheriffs-office/divisions/emergency-management/fire-restrictions/";
const EL_PASO_URL = "https://epcsheriffsoffice.com/services/fire-information/";
const BOULDER_URL = "https://bouldercounty.gov/safety/fire/fire-restrictions/";
const ARAPAHOE_PATH = "/your_county/county_departments/sheriffs_office/how_do_i/learn_about_the_burn_ban.php";
const WP_FIELDS = { _fields: "id,slug,status,link,modified_gmt,content,title" };
const DOUGLAS = { id: "co-douglas-fire", sourceName: "Douglas County Sheriff", officialUrl: DOUGLAS_URL,
  sourceUrl: wpRestUrl(new URL(DOUGLAS_URL).origin, "pages/5828", WP_FIELDS), stack: "WordPress REST / HTML" };
const EL_PASO = { id: "co-el-paso-fire", sourceName: "El Paso County Sheriff", officialUrl: EL_PASO_URL,
  sourceUrl: wpRestUrl(new URL(EL_PASO_URL).origin, "pages/108", WP_FIELDS), stack: "WordPress REST / HTML" };
const BOULDER = { id: "co-boulder-fire", sourceName: "Boulder County Sheriff", officialUrl: BOULDER_URL,
  sourceUrl: BOULDER_URL, stack: "WordPress / HTML" };
const ARAPAHOE = { id: "co-arapahoe-fire", sourceName: "Arapahoe County Sheriff",
  officialUrl: `https://arapahoeco.gov${ARAPAHOE_PATH}`, sourceUrl: `https://files.arapahoeco.gov${ARAPAHOE_PATH}`,
  stack: "Revize / HTML table" };
const ESTES_URL = "https://www.estesvalleyfire.org/fire-restrictions-bans";
const ESTES = { id: "co-estes-valley-fire", sourceName: "Estes Valley Fire Protection District", officialUrl: ESTES_URL,
  sourceUrl: ESTES_URL, stack: "Streamline / HTML" };
const LARIMER = { id: "co-larimer-aegis", sourceName: "Larimer County Emergency Management",
  officialUrl: "https://aegis.larimer.gov/pages/fire-danger", stack: "ArcGIS Experience / JSON",
  sourceUrl: "https://www.arcgis.com/sharing/rest/content/items/4cdd565d89044505b9e41042222e4e7c/data?f=pjson" };
const SCHEDULE = {
  state: "CO", scope: "part", coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Mountain, hours: [0, 8, 16] },
  staleMs: 24 * 3_600_000,
} as const;
const NO_CACHE = { "cache-control": "no-cache" };

type Publisher = Pick<ActiveSource, "id" | "sourceName" | "sourceUrl" | "officialUrl" | "stack">;
type Decision = Pick<CountyStatus, "scopeNote" | "status" | "label" | "note" | "sourceUpdated" | "since" | "validFrom">;

function countyReport(publisher: Publisher, name: string, now: Date, decision: Decision): CountyStatus[] {
  const county = countyByName("CO", name);
  if (!county) throw new Error(`Colorado county not found: ${name}`);
  return [{
    state: "CO", scope: "part", county: county.name, fips: county.fips, sourceId: publisher.id,
    sourceName: publisher.sourceName, sourceUrl: publisher.sourceUrl, officialUrl: publisher.officialUrl,
    checked: now.toISOString(), expires: null, ...decision,
  }];
}

async function wpCountyPage(data: unknown, id: number, url: string, now: Date) {
  const { html, modified } = parseWpPage(data, { id, url });
  if (Date.parse(modified) > now.getTime()) throw new Error(`Future WordPress page update: ${url}`);
  return { blocks: (await extractHtml(html)).blocks, modified };
}

export async function parseDouglasFire(data: unknown, now: Date): Promise<CountyStatus[]> {
  const { blocks, modified } = await wpCountyPage(data, 5828, DOUGLAS_URL, now);
  const scope = /^Fire Restrictions For Unincorporated Douglas County, Colorado$/i;
  const headings = blocks.filter(({ tag, text }) => tag === "h2" && scope.test(text));
  if (headings.length !== 1) throw new Error("Douglas County: expected one jurisdiction heading");
  const [date, status] = blocks.slice(blocks.indexOf(headings[0]) + 1);
  const stamp = date?.tag === "p" && /^updated on (.+)$/i.exec(date.text);
  const updated = stamp && parseUsDate(stamp[1]);
  if (!updated || updated > localClock(new Date(modified), US_ZONES.Mountain).date) {
    throw new Error("Douglas County: missing or future status date");
  }
  const decision = status?.tag === "h2" && /^Stage ([12]) Fire Restrictions (Have Been Lifted|Are in Effect) for Unincorporated Douglas County, Colorado\.? (This includes Larkspur and Castle Pines\.)$/i.exec(status.text);
  if (!decision) throw new Error("Douglas County: unrecognized restriction status or scope");
  const [, stage, change] = decision;
  const lifted = /lifted/i.test(change);
  return countyReport(DOUGLAS, "Douglas", now, {
    scopeNote: "Douglas County Sheriff orders for unincorporated Douglas County, Larkspur and Castle Pines",
    status: lifted ? "unknown" : stage === "2" ? "ban" : "restricted",
    label: lifted ? `Sheriff lifted Stage ${stage}` : `Stage ${stage} fire restrictions`,
    note: lifted
      ? "The sheriff’s status page reports that its order was lifted. Check your local fire authority and land manager for rules at the burn location."
      : "Check the sheriff’s order for the activities it covers and any exceptions.",
    sourceUpdated: updated, since: null,
  });
}

export async function parseElPasoFire(data: unknown, now: Date): Promise<CountyStatus[]> {
  const { blocks, modified } = await wpCountyPage(data, 108, EL_PASO_URL, now);
  const heading = /^Current Fire Restrictions$/i;
  if (blocks.filter(({ tag, text }) => tag === "h2" && heading.test(text)).length !== 1 ||
      !blocks.some(({ tag, text }) => tag === "p" && /^Note: Fire Restriction information .* for the unincorporated area of El Paso County, Colorado, pursuant to Ordinance No\. 22-001/i.test(text))) {
    throw new Error("El Paso County: missing status heading or jurisdiction");
  }
  const [current] = blockAfterHeading(blocks, heading);
  const clear = current?.tag === "p" && /^There are no fire restrictions at this time\.$/i.test(current.text);
  const stage = current?.tag === "p"
    ? /^Stage (I{1,2}|[12]) Fire Restrictions(?: (?:are )?in effect)?\.?$/i.exec(current.text)?.[1]
    : undefined;
  if (!clear && !stage) throw new Error("El Paso County: unrecognized current fire restrictions");
  const stageTwo = stage === "2" || stage?.toUpperCase() === "II";
  return countyReport(EL_PASO, "El Paso", now, {
    scopeNote: "Sheriff fire restrictions in unincorporated El Paso County",
    status: clear ? "unknown" : stageTwo ? "ban" : "restricted",
    label: clear ? "No current El Paso County Sheriff restrictions" : `Stage ${stageTwo ? "2" : "1"} fire restrictions`,
    note: clear ? "The sheriff lists no current restrictions for the unincorporated area. Open burn permits and local rules still apply."
      : "See the sheriff’s Fire Information page for activity limits, exceptions and open burn permits.",
    sourceUpdated: modified, since: null,
  });
}

export function parseBoulderFire({ blocks }: HtmlParts, now: Date): CountyStatus[] {
  const heading = /^Fire Restrictions$/i;
  if (blocks.filter(({ tag, text }) => tag === "h1" && heading.test(text)).length !== 1) {
    throw new Error("Boulder County: missing fire restrictions page heading");
  }
  const section = blockAfterHeading(blocks, heading);
  const [current] = section;
  if (!section.some(({ tag, text }) => tag === "h2" && /^Fire Restrictions in Boulder County$/i.test(text))) {
    throw new Error("Boulder County: missing county restrictions section");
  }
  const clear = current?.tag === "p" && /^There are currently no fire restrictions in place in unincorporated Boulder County\.$/i.test(current.text);
  const stage = current?.tag === "p" && /^Stage ([12]) fire restrictions are (?:currently )?in (?:effect|place) (?:throughout|in all of) unincorporated Boulder County\.$/i.exec(current.text)?.[1];
  if (!clear && !stage) throw new Error("Boulder County: unrecognized status or geographic split");
  return countyReport(BOULDER, "Boulder", now, {
    scopeNote: "Seasonal fire orders in unincorporated Boulder County",
    status: clear ? "unknown" : stage === "2" ? "ban" : "restricted",
    label: clear ? "No current Boulder County seasonal fire restrictions" : `Stage ${stage} seasonal fire restrictions`,
    note: clear ? "The county lists no seasonal fire order for its unincorporated areas. Weather-triggered open-fire restrictions and permit rules still apply."
      : "Check the county’s current order and burn permit page for activities covered and weather-triggered restrictions.",
    sourceUpdated: null, since: null,
  });
}

export function parseArapahoeFire({ blocks, tables }: HtmlParts, now: Date): CountyStatus[] {
  const title = "Learn about the burn ban";
  if (blocks.filter(({ tag, text }) => tag === "h1" && text === title).length !== 1 ||
      !blocks.some(({ text }) => text.includes("Arapahoe County Ordinance #2026-03"))) {
    throw new Error("Arapahoe County: missing current status section or county ordinance");
  }
  const statusTables = tables.filter(({ heading }) => heading === title);
  const statusRows = statusTables[0]?.rows;
  const status = statusRows?.length === 1 && statusRows[0].length === 1 &&
    /^(No Burn Ban|Stage ([12]) (?:Burn Ban|Fire Restrictions)) Effective (.+)$/i.exec(statusRows[0][0]);
  const effective = status && parseUsDate(status[3]);
  if (!status || !effective || effective > localClock(now, US_ZONES.Mountain).date) {
    throw new Error("Arapahoe County: unrecognized burn status or effective date");
  }
  const stage = status[2];
  return countyReport(ARAPAHOE, "Arapahoe", now, {
    scopeNote: "Sheriff fire restrictions for unincorporated Arapahoe County",
    status: stage === "2" ? "ban" : stage === "1" ? "restricted" : "unknown",
    label: stage ? `Stage ${stage} fire restrictions` : "No current Arapahoe County Sheriff burn ban",
    note: stage ? "The sheriff lists fire restrictions for the unincorporated area. Check the current order for exceptions."
      : "The sheriff lifted the county's ban. Fire districts and municipalities can have separate orders, and permits may still be required.",
    sourceUpdated: null, since: effective,
  });
}

export function parseEstesFire({ blocks, links }: HtmlParts, now: Date): CountyStatus[] {
  const heading = /^Current Fire Restrictions$/i;
  if (blocks.filter(({ tag, text }) => tag === "h3" && heading.test(text)).length !== 1) {
    throw new Error("Estes Valley: missing current restrictions heading");
  }
  const [stamp, , current] = blocks.slice(blocks.findIndex(({ tag, text }) => tag === "h3" && heading.test(text)) + 1);
  const date = stamp?.tag === "h3" && /^\(last updated (.+)\)$/i.exec(stamp.text);
  const updated = date && parseUsDate(date[1]);
  if (!updated || updated > localClock(now, US_ZONES.Mountain).date) throw new Error("Estes Valley: invalid update date");
  const status = current?.tag === "p" && /^Estes Valley Fire Protection District: (Stage ([12]) Restrictions|No (?:Current )?Restrictions)$/i.exec(current.text);
  if (!status) throw new Error("Estes Valley: unrecognized current district restrictions");
  const stage = status[2];
  // Use the effective hour only for the signed order linked from this edition.
  const signed = stage === "1" && updated === "2026-09-04" &&
    links.some(({ href }) => href === "/files/fb3961042/2026.09.03+EVFPD+Burn+Restriction.pdf");
  const validFrom = signed ? atLocalTime(updated, 8 * 60, US_ZONES.Mountain) ?? undefined : undefined;
  return countyReport(ESTES, "Larimer", now, {
    scopeNote: "Estes Valley Fire Protection District",
    status: stage === "2" ? "ban" : stage === "1" ? "restricted" : "unknown",
    label: stage ? `Stage ${stage} outdoor fire restrictions` : "No current Estes Valley district restrictions",
    note: signed ? "The district order bars unenclosed wood fires, pile burning and other prescribed fire. Check the order for exceptions and short-term rental rules."
      : "Check the district’s current restrictions and permit rules at your address.",
    sourceUpdated: updated, since: signed ? updated : null, validFrom,
  });
}

const widget = z.object({ uri: z.literal("widgets/common/text/"), config: z.object({ text: z.string().min(1) }) });
const larimerPage = z.object({
  publishTimestamp: z.number(),
  pages: z.object({ page_0: z.object({ label: z.literal("Fire Danger") }) }),
  widgets: z.object({
    widget_1190: widget, widget_1142: widget, widget_1168: widget, widget_1179: widget,
  }),
});

export function parseLarimerFire(data: unknown, now: Date): CountyStatus[] {
  const page = larimerPage.safeParse(data);
  const updated = page.success && msToIso(page.data.publishTimestamp);
  if (!page.success || !updated || updated > now.toISOString()) throw new Error("Larimer County: invalid fire danger publication");
  const { widget_1190: overview, ...elevations } = page.data.widgets;
  const [heading] = parseHtml(overview.config.text).blocks;
  if (heading?.tag !== "h3" || heading.text !== "No Restrictions Are In Effect Throughout Unincorporated Larimer County" ||
      Object.values(elevations).some(({ config }) => htmlText(config.text) !== "No restrictions are in place.")) {
    throw new Error("Larimer County: unrecognized county or elevation-zone status");
  }
  return countyReport(LARIMER, "Larimer", now, {
    scopeNote: "Larimer County orders for unincorporated areas",
    status: "unknown", label: "No current Larimer County fire restrictions",
    note: "Larimer Aegis lists no county restrictions at any elevation. Fire districts, municipalities and federal land managers can have separate orders.",
    sourceUpdated: updated, since: null,
  });
}

function jsonSource(publisher: Publisher, parse: (data: unknown, now: Date) => CountyStatus[] | Promise<CountyStatus[]>): ActiveSource {
  return {
    ...publisher, ...SCHEDULE,
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, { headers: { ...NO_CACHE, accept: "application/json" } });
      if (reply.notModified) throw new Error(`Unexpected status response for ${publisher.sourceName}: HTTP 304`);
      return { rows: await parse(await reply.response.json(), now) };
    },
  };
}

function htmlSource(publisher: Publisher, parse: (parts: HtmlParts, now: Date) => CountyStatus[], links = false): ActiveSource {
  return {
    ...publisher, ...SCHEDULE,
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, { headers: { ...NO_CACHE, accept: "text/html" } });
      if (reply.notModified) throw new Error(`Unexpected status response for ${publisher.sourceName}: HTTP 304`);
      return { rows: parse(await extractHtml(reply.response, { links }), now) };
    },
  };
}

export const coDouglasFire = jsonSource(DOUGLAS, parseDouglasFire);
export const coElPasoFire = jsonSource(EL_PASO, parseElPasoFire);
export const coBoulderFire = htmlSource(BOULDER, parseBoulderFire);
export const coArapahoeFire = htmlSource(ARAPAHOE, parseArapahoeFire);
export const coEstesFire = htmlSource(ESTES, parseEstesFire, true);
export const coLarimerFire = jsonSource(LARIMER, parseLarimerFire);
