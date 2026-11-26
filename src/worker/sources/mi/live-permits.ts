import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { localClock, localDayWindow, parseIsoTimestamp, reportWindow, US_ZONES } from "../lib/dates";
import { firestoreDocument } from "../lib/firestore";
import { htmlStatusChoice } from "../lib/html";
import { fetchSource } from "../lib/http";
import { parseWpPage, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const HOUR_MS = 60 * 60 * 1000;
const ST_JOSEPH_MAX_AGE_MS = 20 * 60 * 1000;
const ST_JOSEPH = {
  id: "mi-st-joseph-charter-fire-status", state: "MI", scope: "part", stack: "Apache / public JSON",
  sourceName: "St. Joseph Charter Township Fire Department",
  sourceUrl: "https://sjctfd.com/live.json", officialUrl: "https://sjctfd.com/burning/",
} as const;

const stJosephFeed = z.object({
  generated: z.string(),
  burn: z.object({
    state: z.enum(["open", "caution", "ban", "unknown"]),
    label: z.string().trim().min(1),
  }),
  communities: z.array(z.object({ id: z.string(), name: z.string() })).length(2),
});

export function parseStJosephFireStatus(data: unknown, now: Date): CountyStatus[] {
  const { generated, burn, communities } = stJosephFeed.parse(data);
  if (!communities.some(({ id, name }) => id === "township" && name === "St. Joseph Charter Township") ||
      !communities.some(({ id, name }) => id === "shoreham" && name === "Village of Shoreham")) {
    throw new Error("St. Joseph Fire: unexpected service area");
  }
  const window = reportWindow(parseIsoTimestamp(generated), now, ST_JOSEPH_MAX_AGE_MS);
  if (!window) throw new Error("St. Joseph Fire: no current status");
  // The community cards also describe permit, wind, and hours rules. Read the district-wide decision.
  if (burn.state !== "ban") return [];
  if (burn.label !== "No burning") throw new Error("St. Joseph Fire: inconsistent closure status");
  return [{
    ...ST_JOSEPH, sourceId: ST_JOSEPH.id, fips: "26021", county: "Berrien County",
    status: "ban", label: "Fire department reports no burning",
    scopeNote: "St. Joseph Charter Township and Village of Shoreham",
    note: "The fire department suspends burning when the Fire Chief issues a ban or the National Weather Service issues a Red Flag Warning for the area.",
    checked: now.toISOString(), since: null, expires: null, ...window,
  }];
}

export const miStJosephFireStatus: ActiveSource = {
  ...ST_JOSEPH, mode: "positive-only", coverage: "restrictions", reportingFips: ["26021"],
  cadence: { kind: "hourly" }, staleMs: ST_JOSEPH_MAX_AGE_MS,
  async fetch({ now }) {
    const reply = await fetchSource(ST_JOSEPH.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 50_000 });
    if (reply.notModified) throw new Error("Unexpected St. Joseph Fire 304");
    return { rows: parseStJosephFireStatus(await reply.response.json(), now) };
  },
};

const GT_SITE = "https://gtmetrofire.org";
const GT_PAGE = { id: 2646, url: `${GT_SITE}/obtain-a-burn-permit/` };
const GT_METRO = {
  id: "mi-grand-traverse-metro-permit-status", state: "MI", scope: "part", stack: "WordPress / Avada REST page",
  sourceName: "Grand Traverse Metro Emergency Services Authority",
  sourceUrl: wpRestUrl(GT_SITE, "pages/2646", { _fields: "id,status,modified_gmt,content,link" }),
  officialUrl: GT_PAGE.url,
} as const;
const GT_MAX_AGE_MS = 2 * HOUR_MS;

export async function parseGrandTraverseMetroStatus(data: unknown, now: Date): Promise<CountyStatus[]> {
  const { html, modified } = parseWpPage(data, GT_PAGE);
  if (Date.parse(modified) > now.getTime()) throw new Error("Grand Traverse Metro: future page update");
  const state = await htmlStatusChoice(html, {
    section: ".fusion-alert", blocks: ".fusion-alert-content",
    choices: [
      ["open", /^BURN PERMITS ARE OPEN(?:, PLEASE APPLY FOR A PERMIT AT THE BOTTOM OF THE PAGE)?[.!]?$/i],
      ["closed", /^BURN PERMITS ARE CLOSED[.!]?$/i],
    ],
  });
  if (state === "open") return [];
  return [{
    ...GT_METRO, sourceId: GT_METRO.id, fips: "26055", county: "Grand Traverse County",
    status: "restricted", label: "Grand Traverse Metro burn permits closed",
    scopeNote: "Acme, East Bay and Garfield townships",
    note: "The authority reports its permits are closed. Its permit program covers certain outdoor burns and bonfires. Separate rules apply to small recreational fires and prohibited materials.",
    checked: now.toISOString(), since: null, expires: null, sourceUpdated: null,
    validUntil: new Date(now.getTime() + GT_MAX_AGE_MS).toISOString(),
  }];
}

export const miGrandTraverseMetroStatus: ActiveSource = {
  ...GT_METRO, mode: "positive-only", coverage: "restrictions", reportingFips: ["26055"],
  cadence: { kind: "hourly" }, staleMs: GT_MAX_AGE_MS,
  async fetch({ now }) {
    const reply = await fetchSource(GT_METRO.sourceUrl, {
      headers: { accept: "application/json" }, maxBytes: 80_000, maxResponseAgeMs: GT_MAX_AGE_MS,
    });
    if (reply.notModified) throw new Error("Unexpected Grand Traverse Metro 304");
    return { rows: await parseGrandTraverseMetroStatus(await reply.response.json(), now) };
  },
};

const ATLAS_URL = "https://atlastownshipfire.org/burn-permit%2Fdownloads";
const ATLAS = {
  id: "mi-atlas-township-burn-status", state: "MI", scope: "part", stack: "GoDaddy / HTML status panel",
  sourceName: "Atlas Township Fire Department", sourceUrl: ATLAS_URL, officialUrl: ATLAS_URL,
} as const;
const ATLAS_MAX_AGE_MS = 2 * HOUR_MS;

export async function parseAtlasFireStatus(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const decision = await htmlStatusChoice(input, {
    section: '[data-ux="Widget"][id="89005a6c-c789-427e-9f5e-648bf89345f2"] section',
    blocks: '[data-aid="FAQ_SECTION_TITLE_RENDERED"], [data-aid="FAQ_SECTION_DESCRIPTION_RENDERED"] p',
    choices: [
      ["open", /^BURNING CONDITIONS\nOPEN BURNING IS ALLOWED TODAY[.!]?$/i],
      ["closed", /^BURNING CONDITIONS\nOPEN BURNING IS (?:NOT ALLOWED|PROHIBITED) TODAY[.!]?$/i],
    ],
  });
  if (decision === "open") return [];
  const { date } = localClock(now, US_ZONES.Eastern);
  const localEnd = Date.parse(localDayWindow(date, US_ZONES.Eastern).validUntil);
  return [{
    ...ATLAS, sourceId: ATLAS.id, fips: "26049", county: "Genesee County",
    status: "restricted", label: "Atlas Township reports open burning closed today",
    scopeNote: "Atlas Township",
    note: "The township fire department’s burning conditions panel says open burning is closed today. Review the township permit page for activities and exceptions.",
    checked: now.toISOString(), since: null, expires: null, sourceUpdated: null,
    validUntil: new Date(Math.min(localEnd, now.getTime() + ATLAS_MAX_AGE_MS)).toISOString(),
  }];
}

export const miAtlasFireStatus: ActiveSource = {
  ...ATLAS, mode: "positive-only", coverage: "restrictions", reportingFips: ["26049"],
  cadence: { kind: "hourly" }, staleMs: ATLAS_MAX_AGE_MS,
  async fetch({ now }) {
    const reply = await fetchSource(ATLAS.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 250_000, maxResponseAgeMs: ATLAS_MAX_AGE_MS,
    });
    if (reply.notModified) throw new Error("Unexpected Atlas Fire 304");
    return { rows: await parseAtlasFireStatus(reply.response, now) };
  },
};

const PORT_SANILAC_DOCUMENT = "projects/port-sanilac-fpo/databases/(default)/documents/municipality/Port Sanilac";
const PORT_SANILAC = {
  id: "mi-port-sanilac-fire-permit-status", state: "MI", scope: "part", stack: "FirePermit.Online / Firestore",
  sourceName: "Port Sanilac Fire Department",
  officialUrl: "https://psfd.firepermit.online/home",
  sourceUrl: "https://firestore.googleapis.com/v1/projects/port-sanilac-fpo/databases/(default)/documents/municipality/Port%20Sanilac?mask.fieldPaths=fireban&mask.fieldPaths=deptName",
} as const;
const PORT_SANILAC_MAX_AGE_MS = 7 * 24 * HOUR_MS;
const portSanilacFields = z.object({
  deptName: z.object({ stringValue: z.literal("Port Sanilac Fire Department") }),
  fireban: z.union([z.strictObject({ booleanValue: z.boolean() }), z.strictObject({ nullValue: z.null() })]),
});

export function parsePortSanilacFireStatus(data: unknown, now: Date): CountyStatus[] {
  const { fields, updateTime } = firestoreDocument(data, PORT_SANILAC_DOCUMENT, portSanilacFields);
  if (Date.parse(updateTime) > now.getTime()) throw new Error("Port Sanilac: future Firestore update");
  if (!("booleanValue" in fields.fireban) || !fields.fireban.booleanValue) return [];
  const window = reportWindow(new Date(updateTime).toISOString(), now, PORT_SANILAC_MAX_AGE_MS);
  if (!window) throw new Error("Port Sanilac: active fire-ban flag is too old to verify");
  return [{
    ...PORT_SANILAC, sourceId: PORT_SANILAC.id, fips: "26151", county: "Sanilac County",
    status: "ban", label: "Port Sanilac fire permit portal reports a ban",
    scopeNote: "Village of Port Sanilac",
    note: "The fire department’s public permit portal says burning is prohibited under its active fire ban. Ask the fire authority about order boundaries and exceptions.",
    checked: now.toISOString(), since: null, expires: null, ...window,
  }];
}

export const miPortSanilacFireStatus: ActiveSource = {
  ...PORT_SANILAC, mode: "positive-only", coverage: "restrictions", reportingFips: ["26151"],
  cadence: { kind: "hourly" }, staleMs: 2 * HOUR_MS,
  async fetch({ now }) {
    const reply = await fetchSource(PORT_SANILAC.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 10_000 });
    if (reply.notModified) throw new Error("Unexpected Port Sanilac 304");
    return { rows: parsePortSanilacFireStatus(await reply.response.json(), now) };
  },
};
