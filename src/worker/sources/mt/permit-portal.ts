import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";
import { publicFormSession } from "../lib/form-session";
import { extractHtmlGrid, htmlStatusBlocks } from "../lib/html";
import type { ActiveSource } from "../types";

export const MT_PERMIT_PORTAL = "https://app.egovmt.com/cgi-bin/burnpermit/burnPermit.cgi";
const MENU = new URL(`${MT_PERMIT_PORTAL}?mode=main_menu`);
const FAQ = new URL(`${MT_PERMIT_PORTAL}?mode=howdoi`);
const ZONE = US_ZONES.Mountain;
const STALE_MS = 24 * 3_600_000;
const readCounty = publicFormSession({
  action: MT_PERMIT_PORTAL,
  destination: MENU,
  cookies: ["burnpermit-affinity", "mt-lcc-burn-permit"],
  maxBytes: 80_000,
  maxResponseAgeMs: 15 * 60_000,
});

type CountyPermitPage = {
  fips: string;
  code: number;
  portalName: string;
  officialUrl: string;
  offSeasonNotice?: string;
};

// County codes come from the portal's public county selector.
const roster: readonly CountyPermitPage[] = [
  { code: 1, fips: "30093", portalName: "Butte-Silver Bow", officialUrl: "https://www.bsbmt.gov/2075/Burning-Permits" },
  { code: 2, fips: "30013", portalName: "Cascade", officialUrl: "https://www.cascadecountymt.gov/201/Burn-Permits" },
  { code: 3, fips: "30111", portalName: "Yellowstone", officialUrl: "https://www.yellowstonecountymt.gov/des/BurnPermits/burn.asp" },
  { code: 4, fips: "30063", portalName: "Missoula", officialUrl: "https://www.missoulacounty.gov/9652" },
  { code: 5, fips: "30049", portalName: "Lewis and Clark", officialUrl: "https://www.lccountymt.gov/Government/Commission/Burn-Permits" },
  { code: 7, fips: "30029", portalName: "Flathead", officialUrl: "https://flatheadcounty.gov/department-directory/health/environmental-health/burn-permit" },
  { code: 8, fips: "30027", portalName: "Fergus", officialUrl: "https://fergusmt.gov/departments/fire-warden" },
  { code: 9, fips: "30075", portalName: "Powder River", officialUrl: "https://prco.mt.gov/" },
  { code: 12, fips: "30041", portalName: "Hill", officialUrl: "https://www.hillcounty.us/departments/disaster_and_emergency_services.php" },
  { code: 13, fips: "30081", portalName: "Ravalli", officialUrl: "https://ravallicounty.gov/501/Burning-Permits" },
  { code: 14, fips: "30017", portalName: "Custer", officialUrl: "https://custercountymt.gov/emergency-enforcement/fire/" },
  { code: 17, fips: "30085", portalName: "Roosevelt", officialUrl: "https://www.rooseveltcountymt.gov/burn-permit/" },
  { code: 18, fips: "30001", portalName: "Beaverhead", officialUrl: "https://beaverheadcountymt.gov/fire-warden-burn-permits/" },
  { code: 19, fips: "30015", portalName: "Chouteau", officialUrl: "https://www.chouteaucountymt.gov/" },
  { code: 23, fips: "30065", portalName: "Musselshell", officialUrl: "https://musselshellcounty.gov/des/" },
  { code: 24, fips: "30005", portalName: "Blaine", officialUrl: "https://blainecounty-mt.gov/sheriff-coroner/" },
  { code: 25, fips: "30057", portalName: "Madison", officialUrl: "https://www.madisoncountymt.gov/" },
  { code: 27, fips: "30083", portalName: "Richland", officialUrl: "https://www.richland.org/disaster--emergency-services.html" },
  { code: 28, fips: "30077", portalName: "Powell", officialUrl: "https://www.powellcountymt.gov/" },
  { code: 30, fips: "30023", portalName: "Anaconda-Deer Lodge", officialUrl: "https://www.adlc.us/" },
  { code: 31, fips: "30099", portalName: "Teton", officialUrl: "https://tetoncountymt.gov/fire-department/" },
  { code: 32, fips: "30095", portalName: "Stillwater", officialUrl: "https://www.stillwatercountymt.gov/228/Fire-Warden" },
  { code: 35, fips: "30089", portalName: "Sanders", officialUrl: "https://www.sanderscounty.gov/",
    offSeasonNotice: "Online Burn Permits are available for Outdoor Burning in Sanders County from May 1st to Sept 30th annually." },
  { code: 36, fips: "30045", portalName: "Judith Basin", officialUrl: "https://jbcountymt.gov/disaster-emergency-services/" },
  { code: 43, fips: "30007", portalName: "Broadwater", officialUrl: "https://www.broadwatercountymt.gov/departments/disaster_emergency_services/index.php" },
  { code: 45, fips: "30079", portalName: "Prairie", officialUrl: "https://prairiecountymt.gov/services/disaster-emergency-services/" },
  { code: 49, fips: "30067", portalName: "Park", officialUrl: "https://www.parkcountymt.gov/Government-Departments/Emergency-Services/Burn-Permits-and-Open-Burning-Information/" },
  { code: 50, fips: "30033", portalName: "Garfield", officialUrl: "https://garfieldcountymt.gov/" },
  { code: 51, fips: "30043", portalName: "Jefferson", officialUrl: "https://jeffersoncounty-mt.gov/sheriffs_office/" },
  { code: 54, fips: "30061", portalName: "Mineral", officialUrl: "https://co.mineral.mt.us/departments/disaster-emergency/" },
  { code: 55, fips: "30069", portalName: "Petroleum", officialUrl: "https://petroleumcountymt.org/departments/sheriffs-department/" },
  { code: 56, fips: "30053", portalName: "Lincoln", officialUrl: "https://lincolncountymt.us/health-department-home/air-quality/",
    offSeasonNotice: "Free, online Burn Permits are available for Residential Outdoor Burning in the Libby Outdoor Burning Control Area" },
];

type PermitRestriction = Pick<CountyStatus, "label" | "note"> & { scopeNote: string };
const BURN_SITE_NOTE = "Check the county permit service and the land manager for rules at your burn site.";
const COUNTY_OPEN = "Burning is currently open across the entire county.";
const COUNTY_CLOSED = /^Burning is currently prohibited across the entire county\.(?: Reason: (.+))?$/;
const DISTRICTS_CLOSED = "Burning is prohibited in the following fire districts";
const ZONES_RESTRICTED = "Burning is restricted in the following fire zones";

function permitRestriction(county: string, line: string, kind: "district" | "zone"): PermitRestriction {
  const match = /^(.+?) \(([A-Z\d_-]+)\)(?: - (.*))?$/.exec(line);
  if (!match) throw new Error(`${county}: malformed permit ${kind} status`);
  const [, name, , details = ""] = match;
  const scopeNote = `County permit burning in ${name} within ${county}`;
  if (kind === "district" && (!details || details.startsWith("Reason: "))) {
    return { label: "Open-burning permit activation prohibited", scopeNote, note: [details, BURN_SITE_NOTE].filter(Boolean).join(" ") };
  }
  const elevation = /^Prohibit Below: ([1-9]\d{2,4})(?: - Reason: (.+))?$/.exec(details);
  if (kind === "zone" && elevation) {
    const feet = Number(elevation[1]).toLocaleString("en-US");
    return { label: `Permit burning restricted below ${feet} feet`, scopeNote, note: [elevation[2], BURN_SITE_NOTE].filter(Boolean).join(" ") };
  }
  throw new Error(`${county}: unrecognized permit ${kind} restriction`);
}

async function portalRestrictions(input: Response | string, county: CountyPermitPage): Promise<PermitRestriction[]> {
  const body = typeof input === "string" ? input : await input.text();
  const [identity, panel, ...extra] = await extractHtmlGrid(body, {
    row: ".county-identity, section.burn-status",
    cell: ".county-identity-name, #burn-status-title, #burn-status-body > p, #burn-status-body > h3, #burn-status-body > ul > li",
    spaceLineBreaks: true,
  });
  if (extra.length || identity?.length !== 1 || identity[0].text !== `${county.portalName} County`) {
    throw new Error(`Montana permit service: invalid county or status panel for ${county.portalName}`);
  }
  if (!panel && county.offSeasonNotice) {
    const [notice] = await htmlStatusBlocks(body, "main .card-body", ".alert-warning[role='status']");
    if (notice?.startsWith(county.offSeasonNotice)) return [];
  }
  const [title, ...blocks] = panel ?? [];
  if (title?.text !== "Current Burning Status" || !blocks.length) {
    throw new Error(`Montana permit service: missing current status for ${county.portalName}`);
  }
  if (blocks.length === 1 && blocks[0].tag === "p") {
    const { text } = blocks[0];
    if (text === COUNTY_OPEN) return [];
    const closure = COUNTY_CLOSED.exec(text);
    if (closure) return [{
      label: "County open-burning permit activation prohibited",
      scopeNote: `County-regulated open burning in ${county.portalName} County`,
      note: [closure[1], BURN_SITE_NOTE].filter(Boolean).join(" "),
    }];
  }

  const decisions: PermitRestriction[] = [];
  const seen = new Set<string>();
  let kind: "district" | "zone" | undefined;
  let needsArea = false;
  for (const { tag, text } of blocks) {
    if (tag === "h3" && !needsArea) {
      kind = text === DISTRICTS_CLOSED ? "district" : text === ZONES_RESTRICTED ? "zone" : undefined;
      if (kind) {
        needsArea = true;
        continue;
      }
    }
    if (tag !== "li" || !kind) throw new Error(`Montana permit service: unrecognized status for ${county.portalName}`);
    const decision = permitRestriction(`${county.portalName} County`, text, kind);
    if (seen.has(decision.scopeNote)) throw new Error(`Montana permit service: repeated area for ${county.portalName}`);
    seen.add(decision.scopeNote);
    decisions.push(decision);
    needsArea = false;
  }
  if (needsArea) throw new Error(`Montana permit service: missing areas for ${county.portalName}`);
  return decisions;
}

export const mtPermitPortals = roster.map((entry, index) => {
  const county = COUNTY_BY_FIPS.get(entry.fips);
  if (!county || county.state !== "MT") throw new Error(`Montana permit service: invalid FIPS ${entry.fips}`);
  const { fips, name } = county;
  const group = Math.floor(index / 16);
  const meta = {
    id: `mt-permit-${county.slug.replace(/-county$/, "")}`,
    state: "MT", scope: "part", stack: "Tyler Montana CGI / HTML",
    sourceName: `${entry.portalName} County Burn Permit and Notification Service`,
    sourceUrl: MT_PERMIT_PORTAL, officialUrl: entry.officialUrl,
  } as const;
  async function parse(input: Response | string, now: Date): Promise<CountyStatus[]> {
    const restrictions = await portalRestrictions(input, entry);
    if (!restrictions.length) return [];
    const validUntil = localDayWindow(localClock(now, ZONE).date, ZONE).validUntil;
    return restrictions.map((decision) => ({
      ...decision, fips, county: name, state: meta.state, status: "restricted", scope: meta.scope,
      checked: now.toISOString(), sourceUpdated: null, since: null, expires: null, validUntil,
      sourceId: meta.id, sourceName: meta.sourceName, sourceUrl: meta.sourceUrl, officialUrl: meta.officialUrl,
    }));
  }
  const source: ActiveSource = {
    ...meta, mode: "positive-only", coverage: "restrictions", reportingFips: [fips],
    pollGroup: `mt-permit-status-${group + 1}`,
    cadence: { kind: "daily", zone: ZONE, hours: [7 + group] },
    staleMs: STALE_MS,
    async fetch({ now }) {
      const page = await countyPermitPage(entry.code, MENU);
      return { rows: await parse(page, now) };
    },
  };
  return { source, parse };
});

function countyPermitPage(code: number, page: URL) {
  return readCounty(new URLSearchParams({
    mode: "select_county", type: "", next_mode: "", submitted: "true", county_code: String(code),
  }), page);
}

export function mtPermitFaqPage(county: string) {
  const entry = roster.find(({ portalName }) => portalName === county);
  if (!entry) throw new Error(`Montana permit service: unknown FAQ county ${county}`);
  return {
    officialUrl: entry.officialUrl,
    read: () => countyPermitPage(entry.code, FAQ),
  };
}
