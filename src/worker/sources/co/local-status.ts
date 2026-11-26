import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { localClock, localDayWindow, parseIsoTimestamp, parseUsDate, US_ZONES } from "../lib/dates";
import { matchHtmlStatus } from "../lib/html";
import { fetchSource, getText } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Mountain;
const HOUR = 3_600_000;
type Publisher = Pick<ActiveSource, "id" | "sourceName" | "officialUrl" | "stack"> & {
  sourceUrl?: string;
  county: string;
  scopeNote?: string;
};

export function localFirePublisher(publisher: Publisher, options: Pick<ActiveSource, "cadence" | "staleMs">) {
  const county = countyByName("CO", publisher.county);
  if (!county) throw new Error(`Unknown Colorado county: ${publisher.county}`);
  const { fips, name } = county;
  const { id, officialUrl, sourceName, stack, sourceUrl = officialUrl } = publisher;
  const scopeNote = publisher.scopeNote ?? `Unincorporated ${name}`;
  const metadata = {
    id, officialUrl, sourceUrl, sourceName, stack, ...options,
    state: "CO", scope: "part", mode: "positive-only", coverage: "restrictions",
    reportingFips: [fips],
  } satisfies Omit<ActiveSource, "fetch">;

  function row(
    now: Date,
    status: "ban" | "restricted",
    label: string,
    evidence: Partial<Pick<CountyStatus, "note" | "sourceUpdated" | "since" | "validFrom" | "validUntil">> = {},
  ): CountyStatus {
    return {
      fips, state: metadata.state, county: name, scope: metadata.scope, scopeNote,
      sourceId: id, sourceName, sourceUrl, officialUrl, status, label,
      note: "Check the issuer’s current order for activity limits, geographic boundaries and exceptions.",
      checked: now.toISOString(), sourceUpdated: null, since: null, expires: null, ...evidence,
    };
  }
  return { metadata, row };
}

type Decision = "clear" | "stage1" | "stage2" | "stage3";
type Page = Publisher & Parameters<typeof matchHtmlStatus<Decision>>[1] & { datedToday?: true };
const weekdayDate = "(?:[A-Za-z]+, )?[A-Za-z]+ [0-9]{1,2}, [0-9]{4}";

const pages: readonly Page[] = [
  {
    id: "co-fremont-current", county: "Fremont", stack: "Drupal / HTML", sourceName: "Fremont County Government",
    officialUrl: "https://fremontcountyco.gov/",
    section: "#block-danland-fremontco-firebanstatus", blocks: ".content p", datedToday: true,
    choices: [
      ["clear", /^(?<date>[A-Za-z]+ \d{1,2}, \d{4})\n(?:Fremont County is not currently under (?:any )?fire restrictions\.|There are no fire restrictions currently in place in Fremont County\.)$/im],
      ["stage1", /^(?<date>[A-Za-z]+ \d{1,2}, \d{4})\nFremont County is currently under Stage 1 fire restrictions\.$/im],
      ["stage2", /^(?<date>[A-Za-z]+ \d{1,2}, \d{4})\nFremont County is currently under Stage 2 fire restrictions\.$/im],
    ],
  },
  {
    id: "co-elbert-current", county: "Elbert", stack: "CivicPlus / HTML", sourceName: "Elbert County Government",
    officialUrl: "https://www.elbertcounty-co.gov/176/Burn-Restriction-Information",
    section: "#divEditor627e54eb-19e8-4bb4-b265-d88a9ea1e058 .fr-view", blocks: "h2, p:first-of-type",
    choices: [
      ["clear", /^Current Stage & Restrictions\n(?:There are no (?:current )?(?:burn|fire) restrictions(?: in effect)?|Elbert County is not currently under (?:any )?(?:burn|fire) restrictions)\.?$/i],
      ["stage1", new RegExp(`^Current Stage & Restrictions\\nEffective (?<since>${weekdayDate}) and until further notice, by Executive Order of the Elbert County Sheriff, Elbert County is now under STAGE (?:I|1) BURN RESTRICTIONS\\.$`, "i")],
      ["stage2", new RegExp(`^Current Stage & Restrictions\\nEffective (?<since>${weekdayDate}) and until further notice, by Executive Order of the Elbert County Sheriff, Elbert County is now under STAGE (?:II|2) BURN RESTRICTIONS\\.$`, "i")],
    ],
  },
  {
    id: "co-gunnison-current", county: "Gunnison", stack: "CivicPlus / HTML", sourceName: "Gunnison County Emergency Management",
    officialUrl: "https://gunnisoncounty.org/1121/16892/Current-Fire-Restrictions",
    section: "#divEditorbdcece41-83eb-4628-9c29-a328e847eaed .fr-view", blocks: "h2, p:first-of-type",
    choices: [
      ["clear", /^Fire Restriction Information\nNo Fire Restrictions are in effect for Gunnison County\.$/im],
      ["stage1", /^Fire Restriction Information\nStage (?:I|1) Fire Restrictions are in effect for (?:unincorporated )?Gunnison County\.$/im],
      ["stage2", /^Fire Restriction Information\nStage (?:II|2) Fire Restrictions are in effect for (?:unincorporated )?Gunnison County\.$/im],
    ],
  },
  {
    id: "co-clear-creek-current", county: "Clear Creek", stack: "CivicPlus / HTML", sourceName: "Clear Creek County Emergency Management",
    officialUrl: "https://www.clearcreekcounty.us/1607/Fire-Restriction-Information",
    section: "#divEditorab88cc4c-6f4e-4da6-93fe-d2119dbbdca5 .fr-view", blocks: "p:first-child",
    choices: [
      ["clear", /^Clear Creek County is not currently under any declared fire restrictions\.(?: However, .*)?$/i],
      ["stage1", /^Clear Creek County is currently under (?:a )?Stage (?:I|1) Fire Restrictions?\.(?: .*|$)/i],
      ["stage2", /^Clear Creek County is currently under (?:a )?Stage (?:II|2) Fire Restrictions?\.(?: .*|$)/i],
    ],
  },
  {
    id: "co-san-miguel-current", county: "San Miguel", stack: "CivicPlus / HTML", sourceName: "San Miguel County Sheriff",
    officialUrl: "https://www.sanmiguelcountyco.gov/471/Fire-Information", scopeNote: "Unincorporated private land in San Miguel County",
    section: "#divEditorda705997-4e8b-4add-8c83-e617e73cc3a3 .fr-view", blocks: ".fr-view > h3:first-child, .fr-view > p:first-of-type",
    choices: [
      ["clear", new RegExp(`^Current Fire Restrictions in San Miguel County\\nSan Miguel County lifted Stage [12] fire restrictions for all unincorporated, privately-owned land within the county, effective 12:01 a\\.m\\. (?<since>${weekdayDate})\\. This means that after [A-Za-z]+, there are no restrictions in effect for unincorporated SMC\\.$`, "i")],
      ["stage1", /^Current Fire Restrictions in San Miguel County\nStage (?:I|1) fire restrictions are in effect for all unincorporated, privately-owned land within (?:the county|San Miguel County)\.$/i],
      ["stage2", /^Current Fire Restrictions in San Miguel County\nStage (?:II|2) fire restrictions are in effect for all unincorporated, privately-owned land within (?:the county|San Miguel County)\.$/i],
    ],
  },
  {
    id: "co-routt-current", county: "Routt", stack: "CivicPlus / HTML", sourceName: "Routt County Emergency Management",
    officialUrl: "https://co.routt.co.us/158/Wildfire-and-Fire-Restrictions",
    section: "#divEditor1f7e5220-318a-4a9d-a06d-3957ebe50bd8 .fr-view", blocks: "h2, p:first-of-type",
    choices: [
      ["clear", new RegExp(`^Fire Restrictions\\nRoutt County has rescinded all fire restrictions effective at 12:01 AM on (?<since>${weekdayDate})\\. .*$`, "i")],
      ["stage1", /^Fire Restrictions\nRoutt County is currently under Stage (?:I|1) Fire Restrictions\.(?: .*)?$/i],
      ["stage2", /^Fire Restrictions\nRoutt County is currently under Stage (?:II|2) Fire Restrictions\.(?: .*)?$/i],
    ],
  },
  {
    id: "co-custer-current", county: "Custer", stack: "WordPress / Divi HTML", sourceName: "Custer County Emergency Management",
    officialUrl: "https://custercounty-co.gov/departments/emergency-management/fire-information/",
    section: ".et_pb_group_6", blocks: "h3, .et_pb_text_16 p",
    choices: [
      ["clear", /^Current Status\nNo Fire Restrictions? Currently in Effect\.?$/i],
      ["stage1", /^Current Status\nStage (?:I|1) Fire Restrictions?(?: (?:Currently )?in Effect)?\.?$/i],
      ["stage2", /^Current Status\nStage (?:II|2) Fire Restrictions?(?: (?:Currently )?in Effect)?\.?$/i],
      ["stage3", /^Current Status\nStage (?:III|3) Fire Restrictions?(?: (?:Currently )?in Effect)?\.?$/i],
    ],
  },
  {
    id: "co-rio-blanco-current", county: "Rio Blanco", stack: "Revize / HTML", sourceName: "Rio Blanco County Sheriff",
    officialUrl: "https://www.rbc.us/government/elected_officials/sheriff_(sub_site_landing_page)/fire_restrictions.php",
    scopeNote: "Unincorporated and private lands in Rio Blanco County",
    section: "#rz-content-wrap", blocks: ".rz-rte-element > h1, .rz-rte-element > p:first-of-type",
    choices: [
      ["clear", new RegExp(`^No Fire Restrictions\\nfor unincorporated and private lands in Rio Blanco County as of (?<since>${weekdayDate})$`, "im")],
      ["stage1", new RegExp(`^Stage (?:I|1) Fire Restrictions\\nfor unincorporated and private lands in Rio Blanco County as of (?<since>${weekdayDate})$`, "im")],
      ["stage2", new RegExp(`^Stage (?:II|2) Fire Restrictions\\nfor unincorporated and private lands in Rio Blanco County as of (?<since>${weekdayDate})$`, "im")],
    ],
  },
  {
    id: "co-lake-current", county: "Lake", stack: "CivicPlus / HTML", sourceName: "Lake County Emergency Management",
    officialUrl: "https://www.lakecountyco.gov/552/Fire-Danger-Restriction-Information",
    scopeNote: "City of Leadville and unincorporated Lake County",
    section: "#divEditord69c81d0-7afd-429b-a362-c3fb21810d54 .fr-view", blocks: "h2, h3, ul > li",
    choices: [
      ["clear", /^Current Fire Restrictions in Lake County\nCity of Leadville \+ Unincorporated Lake County\nNo restrictions at this time\.$/im],
      ["stage1", /^Current Fire Restrictions in Lake County\nCity of Leadville \+ Unincorporated Lake County\nStage (?:I|1) (?:fire )?restrictions (?:are )?in effect\.?$/im],
      ["stage2", /^Current Fire Restrictions in Lake County\nCity of Leadville \+ Unincorporated Lake County\nStage (?:II|2) (?:fire )?restrictions (?:are )?in effect\.?$/im],
    ],
  },
  {
    id: "co-summit-current", county: "Summit", stack: "Revize / HTML", sourceName: "Summit County Sheriff",
    officialUrl: "https://www.summitsheriffcolorado.gov/services/fire_restrictions.php",
    section: "#post", blocks: "#post > div > span > strong",
    choices: [
      ["clear", /^\*Summit County, CO is not currently subject to any Fire Restrictions\*$/i],
      ["stage1", /^\*Summit County, CO is (?:currently )?(?:under|subject to) Stage (?:I|1) Fire Restrictions\*$/i],
      ["stage2", /^\*Summit County, CO is (?:currently )?(?:under|subject to) Stage (?:II|2) Fire Restrictions\*$/i],
    ],
  },
  {
    id: "co-hinsdale-current", county: "Hinsdale", stack: "WordPress / Kadence HTML",
    sourceName: "West Slope Fire Info · Hinsdale County Emergency Management",
    officialUrl: "https://westslopefireinfo.com/hinsdale-county/", scopeNote: "Upper Piedra region of southern Hinsdale County",
    section: "#main", blocks: "h2.kt-adv-heading3459_919549-a5",
    choices: [
      ["clear", /^No (?:Current )?Fire Restrictions(?: (?:are )?in effect(?: in Hinsdale County)?)?\.?$/i],
      ["stage1", /^The Upper Piedra Region remains in Stage (?:I|1) Fire restrictions\. The remainder of the county has no Fire Restrictions\.$/i],
      ["stage2", /^The Upper Piedra Region remains in Stage (?:II|2) Fire restrictions\. The remainder of the county has no Fire Restrictions\.$/i],
    ],
  },
];

function htmlFireStatus(page: Page) {
  const { metadata, row } = localFirePublisher(page, {
    cadence: { kind: "daily", zone: ZONE, hours: [0, 8, 16] }, staleMs: 24 * HOUR,
  });
  async function parse(input: Response | string, now: Date) {
    const { status, match } = await matchHtmlStatus(input, page);
    const today = localClock(now, ZONE).date;
    const published = match.groups?.date;
    const effective = match.groups?.since;
    const sourceUpdated = published ? parseUsDate(published) : null;
    const since = effective ? parseUsDate(effective) : null;
    if ((page.datedToday && sourceUpdated !== today) || (effective && (!since || since > today))) {
      throw new Error(`${page.id}: status edition is not current`);
    }
    if (status === "clear") return [];
    const stage = status.slice(-1);
    const window = page.datedToday ? localDayWindow(today, ZONE) : {};
    return [row(now, stage === "1" ? "restricted" : "ban", `Stage ${stage} fire restrictions`, {
      ...window, sourceUpdated, since,
    })];
  }
  const source: ActiveSource = {
    ...metadata,
    async fetch({ now }) {
      const reply = await fetchSource(metadata.sourceUrl, {
        attempts: 1, maxBytes: 600_000, maxResponseAgeMs: 12 * HOUR,
        headers: { accept: "text/html", "cache-control": "no-cache" },
      });
      if (reply.notModified) throw new Error(`Unexpected 304 from ${metadata.id}`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}

export const coHtmlFireStatus = pages.map(htmlFireStatus);

const JEFFERSON_URL = "https://www.jeffcosheriffco.gov/safety/wildland-fire/fire-restrictions";
const jefferson = localFirePublisher({
  id: "co-jefferson-sheriff", county: "Jefferson", sourceName: "Jefferson County Sheriff’s Office",
  officialUrl: JEFFERSON_URL, sourceUrl: "https://www.jeffcosheriffco.gov/api/v1/fire-restrictions/status",
  stack: "Sheriff public API / JSON",
}, { cadence: { kind: "hourly" }, staleMs: 3 * HOUR });

const sheriffOrder = "Jefferson County Sheriff's order";
const jeffersonStatus = z.object({
  official: z.literal(true), authority: z.literal("Jefferson County Sheriff's Office"),
  jurisdiction: z.literal("Unincorporated Jefferson County, Colorado"), url: z.literal(JEFFERSON_URL),
  asOf: z.string(), summary: z.string().min(1).max(700),
  restriction: z.object({
    stage: z.enum(["none", "active", "stage1", "stage2"]), label: z.string().min(1).max(100),
    source: z.enum([sheriffOrder, "Automatic during NWS Red Flag Warning"]).nullable(),
    stage1FromRedFlag: z.boolean(), until: z.string().nullable(),
  }),
  redFlagWarning: z.object({ resolved: z.boolean() }),
  updated: z.string().nullable(),
});

export function parseJeffersonFire(input: unknown, now: Date): CountyStatus[] {
  const { asOf, restriction, redFlagWarning, updated, summary } = jeffersonStatus.parse(input);
  const today = localClock(now, ZONE).date;
  const { stage, source, stage1FromRedFlag, until, label } = restriction;
  const validUntil = until === null ? null : parseIsoTimestamp(until);
  const sourceUpdated = updated === null ? null : parseIsoTimestamp(updated);
  if (parseUsDate(asOf) !== today || !summary.startsWith(`As of ${asOf},`) ||
      (until !== null && (!validUntil || validUntil <= now.toISOString())) ||
      (updated !== null && (!sourceUpdated || sourceUpdated > now.toISOString()))) {
    throw new Error("Jefferson County: invalid or stale restriction edition");
  }
  if (stage === "none") {
    if (source || until || stage1FromRedFlag || !redFlagWarning.resolved) {
      throw new Error("Jefferson County: ambiguous clear status");
    }
    return [];
  }
  // The national fire-weather source already applies this same automatic county order.
  if (stage === "stage1" && stage1FromRedFlag && source === "Automatic during NWS Red Flag Warning" && validUntil) return [];
  if (source !== sheriffOrder || stage1FromRedFlag) throw new Error("Jefferson County: inconsistent issuing authority");
  return [jefferson.row(now, stage === "stage2" ? "ban" : "restricted", label, {
    note: summary, sourceUpdated: sourceUpdated ?? today, validUntil: validUntil ?? undefined,
  })];
}

export const coJeffersonFire: ActiveSource = {
  ...jefferson.metadata,
  async fetch({ now }) {
    const text = await getText(jefferson.metadata.sourceUrl, {
      maxBytes: 10_000, maxResponseAgeMs: HOUR, headers: { accept: "application/json" },
    });
    return { rows: parseJeffersonFire(JSON.parse(text), now) };
  },
};

export const coLocalFireSources = [coJeffersonFire, ...coHtmlFireStatus.map(({ source }) => source)];
