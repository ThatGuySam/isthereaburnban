import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { atLocalTime, localClock, localDayWindow, parseIsoTimestamp, parseLocalDateTime, parseUsDate, reportWindow, US_ZONES } from "../lib/dates";
import { extractHtmlGrid, htmlStatusBlocks, htmlText } from "../lib/html";
import { fetchSource, getText } from "../lib/http";
import { monitorPdf } from "../lib/pdf";
import { parseWpPageBlocks, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Central;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CADENCE = { kind: "daily", zone: ZONE, hours: [4, 10, 16, 22] } as const;
const ARKANSAS = "AR";
const MAX_RESPONSE_AGE = 2 * HOUR;

type Publisher = Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl"> & {
  fips: string;
  county: string;
};

function publisher(county: string, stack: string, sourceName: string, officialUrl: string, options: {
  scope?: "county" | "part"; sourceUrl?: string; suffix?: string;
} = {}): Publisher {
  const area = countyByName(ARKANSAS, county);
  if (!area) throw new Error(`Unknown Arkansas county: ${county}`);
  return {
    id: `ar-${area.slug}${options.suffix ?? "-burn-status"}`, state: ARKANSAS,
    scope: options.scope ?? "county", stack, sourceName, sourceUrl: options.sourceUrl ?? officialUrl, officialUrl,
    fips: area.fips, county: area.name,
  };
}

type Decision = Pick<CountyStatus, "status" | "label" | "note"> &
  Partial<Pick<CountyStatus, "scope" | "scopeNote" | "since" | "sourceUpdated" | "validUntil" | "officialUrl">>;

function rows(meta: Publisher, now: Date, decision: Decision): CountyStatus[] {
  const { fips, county, state, scope, id, sourceName, sourceUrl, officialUrl } = meta;
  return [{
    fips, county, state, scope, sourceId: id, sourceName, sourceUrl, officialUrl,
    since: null, expires: null, sourceUpdated: null, checked: now.toISOString(), ...decision,
  }];
}

type ReadStatus = (now: Date) => Promise<CountyStatus[]>;
function statusSource(meta: Publisher, read: ReadStatus, {
  full = false, keepRowLinks = false, cadence = CADENCE, staleMs = 18 * HOUR,
}: { full?: boolean; keepRowLinks?: boolean; cadence?: ActiveSource["cadence"]; staleMs?: number } = {}): ActiveSource {
  const { county: _county, fips, ...source } = meta;
  return {
    ...source, mode: full ? "full" : "positive-only", coverage: meta.scope === "county" ? "live" : "restrictions",
    ...(full ? { expectedFips: [fips] } : { reportingFips: [fips] }),
    cadence, staleMs, keepRowLinks,
    async fetch({ now }) { return { rows: await read(now) }; },
  };
}

async function statusPage(url: string) {
  const reply = await fetchSource(url, {
    headers: { accept: "text/html" }, attempts: 1, maxBytes: 750_000, maxResponseAgeMs: MAX_RESPONSE_AGE,
  });
  if (reply.notModified) throw new Error(`Unexpected status page 304: ${url}`);
  return reply.response;
}

const BAXTER = publisher("Baxter", "Baxter County IT / HTML", "Baxter County Government", "https://baxtercountyar.gov/");

export async function parseBaxterStatus(input: Response | string, now: Date) {
  const [flag, ...extra] = await htmlStatusBlocks(input, "#bb_block", "#bb_block > span");
  if (extra.length) throw new Error("Baxter: ambiguous county burn-ban flag");
  switch (flag) {
    case "County Burn Ban Is On":
      return rows(BAXTER, now, {
        status: "ban", label: "County burn ban in effect", scope: "part", scopeNote: "Unincorporated Baxter County",
        note: "Baxter County reports an active county burn ban. Check the county judge's order and your city fire department for the rules at your address.",
      });
    case "County Burn Ban Is Off":
      return rows(BAXTER, now, {
        status: "none", label: "No active Baxter County burn ban",
        note: "The county reports its burn ban is off. City rules and standing burning restrictions can still apply.",
      });
    default:
      throw new Error("Baxter: unrecognized county burn-ban flag");
  }
}

export const arBaxterStatus = statusSource(BAXTER, async (now) => parseBaxterStatus(await statusPage(BAXTER.sourceUrl), now), { full: true });

const PULASKI = publisher("Pulaski", "SiteWrench / HTML table", "Pulaski County Office of Emergency Management",
  "https://www.pulaskicounty.net/emergency-management", { scope: "part" });

export async function parsePulaskiStatus(input: Response | string, now: Date, modified: string | null) {
  const table = ".templatecontent > table";
  const decisions = await extractHtmlGrid(input, { row: `${table} tbody > tr`, cell: `${table} td` });
  const [burn, danger, eoc] = decisions;
  if (decisions.length !== 3 || decisions.some((row) => row.length !== 2) ||
      burn[0].text !== "Burn Ban" || danger[0].text !== "Fire Danger" || eoc[0].text !== "EOC") {
    throw new Error("Pulaski: missing or changed emergency management status table");
  }
  if (burn[1].text === "OFF") return [];
  if (burn[1].text !== "ON") throw new Error("Pulaski: unrecognized burn-ban flag");
  const instant = Date.parse(modified ?? "");
  const window = reportWindow(Number.isFinite(instant) ? new Date(instant).toISOString() : null, now, 14 * DAY);
  if (!window) throw new Error("Pulaski: future, undated or stale status page");
  return rows(PULASKI, now, {
    ...window, status: "ban", label: "County burn ban in effect", scopeNote: "Unincorporated Pulaski County",
    note: "Emergency Management reports the county burn ban is on. Ask your city fire department about incorporated areas.",
  });
}

export const arPulaskiStatus = statusSource(PULASKI, async (now) => {
  const page = await statusPage(PULASKI.sourceUrl);
  return parsePulaskiStatus(page, now, page.headers.get("last-modified"));
});

const LONOKE_SITE = "https://www.lonokear.gov/";
const LONOKE = publisher("Lonoke", "County site / JSON", "Lonoke County Government", new URL("fire.html", LONOKE_SITE).href,
  { sourceUrl: new URL("data/burnban.json", LONOKE_SITE).href });
const lonokeDecision = z.object({
  county: z.literal("Lonoke"),
  status: z.enum(["active", "none", "unknown"]),
  checked: z.string(),
  confirmed: z.string().nullable(),
  sourceAsOf: z.string().nullable(),
  unknownSince: z.string().nullable(),
  manual: z.unknown(),
});

export function parseLonokeStatus(input: unknown, now: Date) {
  const decision = lonokeDecision.parse(input);
  // The county's automated mirror derives "none" from absence on Forestry's positive-only list.
  if (decision.status !== "active" || decision.unknownSince !== null) return [];
  const checked = parseIsoTimestamp(decision.checked);
  const confirmed = parseIsoTimestamp(decision.confirmed);
  const updated = decision.sourceAsOf && parseLocalDateTime(decision.sourceAsOf, ZONE);
  const window = reportWindow(updated, now, 36 * HOUR);
  if (decision.manual !== null || !checked || !confirmed || !window ||
      window.sourceUpdated > confirmed || confirmed !== checked || !reportWindow(checked, now, 36 * HOUR)) {
    throw new Error("Lonoke: future, stale or unverified Forestry decision");
  }
  return rows(LONOKE, now, {
    ...window, status: "ban", label: "County burn ban listed",
    note: "Lonoke County reports its county burn ban is active using the Arkansas Forestry Division's list. Ask the county judge for the order and exceptions.",
  });
}

export const arLonokeStatus = statusSource(LONOKE, async (now) => {
  const text = await getText(LONOKE.sourceUrl, { attempts: 1, maxBytes: 5_000, maxResponseAgeMs: MAX_RESPONSE_AGE });
  return parseLonokeStatus(JSON.parse(text), now);
});

const MILLER_SITE = "https://millercountyar.gov/";
const MILLER = publisher("Miller", "WordPress / Divi REST", "Miller County Government", MILLER_SITE, {
  sourceUrl: wpRestUrl(MILLER_SITE, "pages/820", { _fields: "id,status,link,modified_gmt,content" }),
});

export async function parseMillerStatus(input: unknown, now: Date) {
  const { blocks, modified } = await parseWpPageBlocks(input, { id: 820, url: MILLER_SITE }, now);
  const notices = blocks.filter(({ tag, text }) => tag === "p" && /^Miller County\b.*\bburn ban\b/i.test(text));
  if (!notices.length) return [];
  if (notices.length !== 1 || !/^Miller County is under a Burn Ban Until Further Notice[.!]?$/i.test(notices[0].text)) {
    throw new Error("Miller: unrecognized or ambiguous burn-ban notice");
  }
  const window = reportWindow(modified, now, 14 * DAY);
  if (!window) throw new Error("Miller: stale county Page update");
  return rows(MILLER, now, {
    ...window, status: "ban", label: "County burn ban in effect",
    note: "Miller County reports its burn ban remains in effect until further notice. Contact the county judge for order details and exceptions.",
  });
}

export const arMillerStatus = statusSource(MILLER, async (now) => {
  const text = await getText(MILLER.sourceUrl, { headers: { accept: "application/json" }, attempts: 1, maxBytes: 150_000 });
  return parseMillerStatus(JSON.parse(text), now);
});

const UNION = publisher("Union", "County site / HTML", "Union County Government", "https://www.unioncountyar.gov/");

export async function parseUnionStatus(input: Response | string, now: Date) {
  const notices = await htmlStatusBlocks(input, "#noticezone", "#noticezone > p");
  const relevant = notices.filter((notice) => /\bburn ban\b/i.test(notice));
  if (!relevant.length) return [];
  const issue = /^Due to the extended dry conditions, Union County continues to be under a burn ban as of (.+)\.$/i.exec(relevant[0]);
  if (relevant.length !== 1 || !issue) throw new Error("Union: unrecognized or ambiguous burn-ban notice");
  const day = parseUsDate(issue[1]);
  const window = reportWindow(day && atLocalTime(day, 0, ZONE), now, 30 * DAY);
  if (!window) throw new Error("Union: future, undated or stale notice");
  return rows(UNION, now, {
    ...window, status: "ban", label: "County burn ban in effect",
    note: "Union County reports the county burn ban remains in effect. Ask the county judge for the order and exceptions.",
  });
}

export const arUnionStatus = statusSource(UNION, async (now) => parseUnionStatus(await statusPage(UNION.sourceUrl), now));

const VAN_BUREN_SITE = "https://www.vanburencountyar.gov/";
const VAN_BUREN = publisher("Van Buren", "Squarespace / JSON", "Van Buren County Government", VAN_BUREN_SITE, {
  sourceUrl: new URL("?format=json", VAN_BUREN_SITE).href,
});
const vanBurenPage = z.object({
  website: z.object({ siteTitle: z.literal("Van Buren County Arkansas") }),
  collection: z.object({ title: z.literal("Home") }),
  websiteSettings: z.object({
    announcementBarSettings: z.object({ style: z.number(), text: z.string() }).nullish(),
  }),
});

export function parseVanBurenStatus(input: unknown, now: Date) {
  const { websiteSettings: { announcementBarSettings: announcement } } = vanBurenPage.parse(input);
  if (!announcement || announcement.style !== 1) return [];
  const text = htmlText(announcement.text);
  if (!/\bburn ban\b/i.test(text)) return [];
  if (!/^(?:Important News: )?Van Buren County is currently under a burn ban\.(?: Please follow local guidelines and help keep our community safe\.)?$/i.test(text)) {
    throw new Error("Van Buren: unrecognized burn-ban banner");
  }
  return rows(VAN_BUREN, now, {
    status: "ban", label: "County burn ban in effect",
    note: "Van Buren County reports it is under a burn ban. Ask the county judge for the order and exceptions.",
  });
}

export const arVanBurenStatus = statusSource(VAN_BUREN, async (now) => {
  const text = await getText(VAN_BUREN.sourceUrl, {
    attempts: 1, headers: { accept: "application/json" }, maxBytes: 300_000, maxResponseAgeMs: MAX_RESPONSE_AGE,
  });
  return parseVanBurenStatus(JSON.parse(text), now);
});

const LITTLE_RIVER = publisher("Little River", "WordPress / HTML and signed PDF", "Little River County Judge", "https://lrcounty.org/");
const LITTLE_RIVER_ORDER = {
  date: "2026-11-16", id: "CO-2026-60R",
  url: "https://lrcounty.org/wp-content/uploads/2026/11/20261116-Court-Order-CO-2026-60R-Little-River-County-Burn-Ban.pdf",
  sha256: "281201736fc9e9415e0e8f079fa1dcda3cb809b89852c68d9e416d7f4ec28482",
};

export async function parseLittleRiverStatus(input: Response | string, now: Date,
  readOrder: (url: string) => Promise<{ sha256: string }>) {
  const section = "#OurMission .ourmission-text > .container";
  const notices = await htmlStatusBlocks(input, section, `${section} > p`);
  const relevant = notices.filter((notice) => /\bburn ban\b/i.test(notice));
  if (!relevant.length) return [];
  const issue = /\bPlease note that Little River County has issued a burn ban as of ([^.]+)\./i.exec(relevant[0]);
  if (relevant.length !== 1 || !issue || parseUsDate(issue[1]) !== LITTLE_RIVER_ORDER.date) {
    throw new Error("Little River: unverified burn-ban order");
  }
  const window = reportWindow(atLocalTime(LITTLE_RIVER_ORDER.date, 0, ZONE), now, 30 * DAY);
  if (!window) throw new Error("Little River: future or stale order");
  if ((await readOrder(LITTLE_RIVER_ORDER.url)).sha256 !== LITTLE_RIVER_ORDER.sha256) {
    throw new Error("Little River: order PDF changed");
  }
  return rows(LITTLE_RIVER, now, {
    validUntil: window.validUntil, status: "ban", label: "County outdoor burn ban",
    since: LITTLE_RIVER_ORDER.date, officialUrl: "https://lrcounty.org/news/",
    note: `County Court Order ${LITTLE_RIVER_ORDER.id} prohibits all outdoor open burning in Little River County until weather conditions change.`,
  });
}

export const arLittleRiverStatus = statusSource(LITTLE_RIVER, async (now) => {
  const page = await statusPage(LITTLE_RIVER.sourceUrl);
  return parseLittleRiverStatus(page, now, async (url) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const pdf = await monitorPdf(url);
    if (pdf.notModified) throw new Error("Unexpected Little River order 304");
    return pdf.document;
  });
}, { keepRowLinks: true });

const SALEM = publisher("Saline", "Google Sites / HTML", "Salem Fire Department", "https://www.salem-fire.org/", {
  scope: "part", suffix: "-salem-fire-status",
});

export async function parseSalemStatus(input: Response | string, now: Date) {
  const texts = await htmlStatusBlocks(input, "body", '[role="main"] h1, [role="region"][aria-labelledby="i1"] > #i1');
  if (!texts.includes("Salem Fire Department")) throw new Error("Salem: missing fire department home page");
  const notices = texts.filter((text) => text !== "Salem Fire Department");
  if (!notices.some((text) => /\bburn ban\b/i.test(text))) return [];
  if (notices.length !== 1 || !/^County wide BURN BAN in effect, NO BURNING ALLOWED!$/i.test(notices[0])) {
    throw new Error("Salem: unrecognized burn-ban banner");
  }
  return rows(SALEM, now, {
    status: "ban", label: "Outdoor burn ban in effect", scopeNote: "Salem Fire Department district",
    note: "Salem Fire reports an active county burn ban for residents in its district. Check the county judge for the order and its geographic limits.",
  });
}

export const arSalemStatus = statusSource(SALEM, async (now) => parseSalemStatus(await statusPage(SALEM.sourceUrl), now));

const CONWAY = publisher("Faulkner", "PermitWeb / HTML", "Conway Fire Department", "https://bp.conwayarkansas.gov/logon.html", {
  scope: "part", suffix: "-conway-daily-permits",
});

export async function parseConwayStatus(input: Response | string, now: Date) {
  const [title, ...notes] = await htmlStatusBlocks(input, "#main", "#main > h2, #main > font");
  if (title !== "Welcome to the Conway Fire Department Online Burn Permit Login") {
    throw new Error("Conway: missing burn permit portal title");
  }
  const matching = notes.filter((note) => /burn permit|burning/i.test(note));
  if (!matching.length) return [];
  if (matching.length !== 1 || matching[0] !== "Note: Burning is not allowed today. You may log in but you will not be able to create a Burn Permit") {
    throw new Error("Conway: unrecognized permit closure");
  }
  return rows(CONWAY, now, {
    ...localDayWindow(localClock(now, ZONE).date, ZONE),
    status: "restricted", label: "City burn permits closed today", scopeNote: "City of Conway",
    note: "Conway's permit portal reports burning is closed today. Check with the city fire department for exceptions and the next decision.",
  });
}

export const arConwayStatus = statusSource(CONWAY, async (now) => parseConwayStatus(await statusPage(CONWAY.sourceUrl), now), {
  cadence: { kind: "daily", zone: ZONE, hours: [8, 12, 16, 20] }, staleMs: 8 * HOUR,
});
