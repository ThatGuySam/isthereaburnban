import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { localClock, localDayWindow, parseIsoTimestamp, parseLocalDateTime, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtmlGrid, matchHtmlStatus } from "../lib/html";
import { fetchSource, getText, pacedSourceReader } from "../lib/http";
import { kmlOutlineColors } from "../lib/kml";
import { matchesPdfEtag } from "../lib/pdf";
import { latestWpNotice, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Mountain;
const HOUR = 3_600_000;
type Publisher = Pick<ActiveSource, "id" | "sourceName" | "officialUrl" | "stack"> & {
  sourceUrl?: string;
  county: string;
  scopeNote?: string;
};

function localFirePublisher(publisher: Publisher, options: Pick<ActiveSource, "cadence" | "staleMs">) {
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
    id: "co-adams-current", county: "Adams", stack: "WordPress / HTML", sourceName: "Adams County Emergency Management",
    officialUrl: "https://adamscountyco.gov/our-county/office-of-emergency-management/fire-restrictions/",
    section: '#main-content > section[data-module="flexible_content"]:nth-of-type(2) .wysiwyg',
    blocks: "h3:first-child, p:first-of-type, p:nth-of-type(2)",
    choices: [
      ["clear", /^(?<date>[A-Za-z]+\.? \d{1,2}, \d{4}) at \d{1,2}:\d{2} [ap]\.m\.\nPer order of Adams County Sheriff [A-Za-z ]+, unincorporated Adams County is moving from Stage [12] fire restrictions to no fire restrictions effective immediately and until further notice\.$/i],
      ["stage1", /^(?<date>[A-Za-z]+\.? \d{1,2}, \d{4}) at \d{1,2}:\d{2} [ap]\.m\.\nStage 1 Fire Restrictions\nBy Order of Adams County Sheriff [A-Za-z ]+, unincorporated Adams County will move to Stage 1 Fire Restrictions effective immediately until further notice\.$/i],
      ["stage2", /^(?<date>[A-Za-z]+\.? \d{1,2}, \d{4}) at \d{1,2}:\d{2} [ap]\.m\.\nStage 2 Fire Restrictions\nBy Order of Adams County Sheriff [A-Za-z ]+, unincorporated Adams County will move to Stage 2 Fire Restrictions effective immediately until further notice\.$/i],
    ],
  },
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
  {
    id: "co-chaffee-current", county: "Chaffee", stack: "Streamline / HTML", sourceName: "South Arkansas Fire Protection District",
    officialUrl: "https://southarkfire.specialdistrict.org/fire-restrictions-community-wildfire-information",
    scopeNote: "South Arkansas Fire Protection District in Chaffee County",
    section: "#poc", blocks: "#poc .body > div > h3:first-child, #poc .body > div > p:nth-child(2)",
    choices: [
      ["clear", /^Current Fire Restrictions:\nFire Restrictions are LIFTED - (?<since>[A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?, \d{4})$/i],
      ["stage1", /^Current Fire Restrictions:\nStage (?:I|1) Fire Restrictions are in effect\.?$/i],
      ["stage2", /^Current Fire Restrictions:\nStage (?:II|2) Fire Restrictions are in effect\.?$/i],
    ],
  },
  {
    id: "co-delta-current", county: "Delta", stack: "WordPress / Kadence HTML",
    sourceName: "West Slope Fire Info · Delta County Emergency Management",
    officialUrl: "https://westslopefireinfo.com/delta-county/",
    section: ".kb-row-layout-id3437_7a1043-97", blocks: "p.kt-adv-heading3437_f1d70c-22",
    choices: [
      ["clear", /^No Current Fire Restrictions\.?$/i],
      ["stage1", /^Stage (?:I|1) Fire Restrictions(?: (?:are )?in effect)?\.?$/i],
      ["stage2", /^Stage (?:II|2) Fire Restrictions(?: (?:are )?in effect)?\.?$/i],
    ],
  },
  {
    id: "co-montrose-current", county: "Montrose", stack: "WordPress / Kadence HTML",
    sourceName: "West Slope Fire Info · Montrose County Emergency Management",
    officialUrl: "https://westslopefireinfo.com/montrose-county/",
    section: "#main", blocks: "h2.kt-adv-heading3687_d9b2ac-61",
    choices: [
      ["clear", /^No Current Fire Restrictions are in effect in unincorporated Montrose County\.?$/i],
      ["stage1", /^Stage (?:I|1) Fire Restrictions are in effect in unincorporated Montrose County\.?$/i],
      ["stage2", /^Stage (?:II|2) Fire Restrictions are in effect in unincorporated Montrose County\.?$/i],
    ],
  },
  {
    id: "co-ouray-current", county: "Ouray", stack: "WordPress / Kadence HTML",
    sourceName: "West Slope Fire Info · Ouray County Emergency Management",
    officialUrl: "https://westslopefireinfo.com/ouray-county/",
    section: "#main", blocks: "h2.kt-adv-heading3487_15d20e-c8",
    choices: [
      ["clear", /^Ouray County fire restrictions are rescinded effective (?<since>\d{1,2}\/\d{1,2}\/\d{2,4}) for all unincorporated areas\.?$/i],
      ["stage1", /^Stage (?:I|1) Fire Restrictions are in effect for (?:all )?unincorporated (?:Ouray County|areas)\.?$/i],
      ["stage2", /^Stage (?:II|2) Fire Restrictions are in effect for (?:all )?unincorporated (?:Ouray County|areas)\.?$/i],
    ],
  },
  {
    id: "co-pitkin-current", county: "Pitkin", stack: "Streamline / HTML", sourceName: "Aspen Fire Protection District",
    officialUrl: "https://www.aspenfire.com/pitkin-county-wildfire-restrictions",
    scopeNote: "Aspen Fire Protection District in Pitkin County",
    section: "#poc", blocks: "#poc > header > h2, #poc .body > div > p:first-child",
    choices: [
      ["clear", /^Pitkin County Wildfire Restrictions\nThere are currently no wildfire restrictions in Pitkin County; however, restrictions could be enacted at any time\.$/i],
      ["stage1", /^Pitkin County Wildfire Restrictions\nStage (?:I|1) wildfire restrictions are in effect in Pitkin County\.$/i],
      ["stage2", /^Pitkin County Wildfire Restrictions\nStage (?:II|2) wildfire restrictions are in effect in Pitkin County\.$/i],
    ],
  },
  {
    id: "co-grand-current", county: "Grand", stack: "Streamline / HTML", sourceName: "Grand Fire Protection District No. 1",
    officialUrl: "https://www.grandfire.org/fire-danger-level-and-restriction-information",
    scopeNote: "Grand Fire Protection District No. 1 in Grand County",
    section: "#poc", blocks: "#poc .body > div > h2:first-child",
    choices: [
      ["clear", /^There are (?:currently )?no fire restrictions (?:in effect )?in Grand County\.?$/i],
      ["stage1", new RegExp(`^Grand County enacts Stage (?:I|1) Fire Restrictions effective (?<time>\\d{1,2}:\\d{2} [ap]\\.?m\\.?) (?<since>${weekdayDate})\\. Please see below for more information\\.$`, "i")],
      ["stage2", new RegExp(`^Grand County enacts Stage (?:II|2) Fire Restrictions effective (?<time>\\d{1,2}:\\d{2} [ap]\\.?m\\.?) (?<since>${weekdayDate})\\. Please see below for more information\\.$`, "i")],
    ],
  },
  {
    id: "co-garfield-current", county: "Garfield", stack: "WordPress / HTML", sourceName: "Garfield County Emergency Management",
    officialUrl: "https://www.garfieldcountyco.gov/emergency-management/fire-restrictions/",
    section: "#post-54 .entry-content", blocks: ".entry-content > h2:first-of-type, .entry-content > p:first-of-type",
    choices: [
      ["clear", new RegExp(`^Stage (?:II?|[12]) Fire Restrictions lifted in Garfield County\\nGarfield County, CO, The Garfield County Sheriff’s Office, Bureau of Land Management – Upper Colorado River District, and the seven fire districts in Garfield County lift Stage [12] Fire Restrictions throughout Garfield County effective (?<time>\\d{1,2}:\\d{2} [ap]\\.?m\\.?) (?<since>${weekdayDate})\\.$`, "i")],
      ["stage1", new RegExp(`^Stage (?:I|1) Fire Restrictions in effect in Garfield County\\nStage (?:I|1) Fire Restrictions are in effect in unincorporated Garfield County effective (?<time>\\d{1,2}:\\d{2} [ap]\\.?m\\.?) (?<since>${weekdayDate})\\.$`, "i")],
      ["stage2", new RegExp(`^Stage (?:II|2) Fire Restrictions in effect in Garfield County\\nStage (?:II|2) Fire Restrictions are in effect in unincorporated Garfield County effective (?<time>\\d{1,2}:\\d{2} [ap]\\.?m\\.?) (?<since>${weekdayDate})\\.$`, "i")],
    ],
  },
  {
    id: "co-la-plata-current", county: "La Plata", stack: "Revize / HTML", sourceName: "La Plata County Emergency Management",
    officialUrl: "https://www.lpcgov.org/departments/emergency_management/fire_restrictions.php",
    scopeNote: "La Plata County Sheriff’s jurisdiction outside municipal, federal and tribal lands",
    section: "#freeform-main #post", blocks: "#post > h3:first-of-type",
    choices: [
      ["clear", /^La Plata County currently has no fire restrictions\.$/i],
      ["stage1", /^(?:Unincorporated )?La Plata County (?:currently has|is currently under) Stage (?:I|1) Fire Restrictions\.$/i],
      ["stage2", /^(?:Unincorporated )?La Plata County (?:currently has|is currently under) Stage (?:II|2) Fire Restrictions\.$/i],
    ],
  },
  {
    id: "co-montezuma-current", county: "Montezuma", stack: "WordPress / Elementor HTML", sourceName: "Montezuma County Emergency Management",
    officialUrl: "https://montezumacounty.gov/fire-restrictions-by-jurisdiction/",
    section: ".elementor-element-fc807c9", blocks: "ul > li",
    choices: [
      ["clear", /^Unincorporated Montezuma County: All restrictions lifted as of [A-Za-z]+ \d{1,2}\.$/im],
      ["stage1", /^Unincorporated Montezuma County: Stage (?:I|1) Fire Restrictions (?:are )?in effect\.?$/im],
      ["stage2", /^Unincorporated Montezuma County: Stage (?:II|2) Fire Restrictions (?:are )?in effect\.?$/im],
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
    const time = match.groups?.time;
    const sourceUpdated = published ? parseUsDate(published) : null;
    const since = effective ? parseUsDate(effective) : null;
    const validFrom = time && effective ? parseLocalDateTime(`${effective} at ${time}`, ZONE) : null;
    if ((page.datedToday && sourceUpdated !== today) || (published && (!sourceUpdated || sourceUpdated > today)) ||
        (effective && (!since || since > today))) {
      throw new Error(`${page.id}: status edition is not current`);
    }
    if (time && !validFrom) throw new Error(`${page.id}: invalid effective time`);
    if (status === "clear") {
      if (validFrom && validFrom > now.toISOString()) throw new Error(`${page.id}: rescission is not effective yet`);
      return [];
    }
    const stage = status.slice(-1);
    const window = page.datedToday ? localDayWindow(today, ZONE) : {};
    return [row(now, stage === "1" ? "restricted" : "ban", `Stage ${stage} fire restrictions`, {
      ...(validFrom ? { validFrom } : window), sourceUpdated, since,
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
  pollGroup: "co-front-range-hourly",
  async fetch({ now }) {
    const text = await getText(jefferson.metadata.sourceUrl, {
      maxBytes: 10_000, maxResponseAgeMs: HOUR, headers: { accept: "application/json" },
    });
    return { rows: parseJeffersonFire(JSON.parse(text), now) };
  },
};

const eagle = localFirePublisher({
  id: "co-eagle-fire-map", county: "Eagle", sourceName: "Eagle County Emergency Management",
  officialUrl: "https://sites.google.com/eaglecounty.us/ecemergency/fire-restrictions",
  sourceUrl: "https://www.google.com/maps/d/kml?mid=1mrgWHyDoAjWnJ8LyHcFXp47GqgD6JB1L&forcekml=1",
  stack: "Google My Maps / KML",
}, { cadence: { kind: "daily", zone: ZONE, hours: [1, 9, 17] }, staleMs: 24 * HOUR });
const eagleColors = new Map([
  ["0F9D58", 0], ["F4B400", 1], ["FFFF00", 1], ["DB4437", 2], ["FF0000", 2], ["000000", 3],
]);

export function parseEagleFireMap(input: string, now: Date): CountyStatus[] {
  const [main, remainder] = kmlOutlineColors(input, "Eagle County - Current Fire Restrictions", [
    "Unincorporated Eagle County", "Unincorporated (2) Eagle County",
  ]);
  const stage = eagleColors.get(main);
  if (stage === undefined || stage !== eagleColors.get(remainder)) throw new Error("Eagle County: unknown or split map status");
  return stage === 0 ? [] : [eagle.row(now, stage === 1 ? "restricted" : "ban", `Stage ${stage} fire restrictions`)];
}

export const coEagleFireMap: ActiveSource = {
  ...eagle.metadata,
  async fetch({ now }) {
    const kml = await getText(eagle.metadata.sourceUrl, { maxBytes: 3_500_000, maxResponseAgeMs: 12 * HOUR, attempts: 1 });
    return { rows: parseEagleFireMap(kml, now) };
  },
};

const cheyenne = localFirePublisher({
  id: "co-cheyenne-notice", county: "Cheyenne", sourceName: "Cheyenne County Board of County Commissioners",
  officialUrl: "https://www.co.cheyenne.co.us/",
  stack: "County notices HTML / published notice PDF",
}, { cadence: { kind: "daily", zone: ZONE, hours: [0, 12] }, staleMs: 30 * HOUR });
const cheyenneNotice = "/assets/pdfs/Burn_Ban_Notice(3.31.26).pdf";

export async function parseCheyenneFire(input: Response | string, now: Date, readOrder: () => Promise<Response>): Promise<CountyStatus[]> {
  const sections = await extractHtmlGrid(input, {
    row: "div.content", cell: "div.content > header > h2, div.content li a", linkAttribute: "href",
  });
  const notices = sections.filter(([heading]) => heading?.text === "Notices");
  if (notices.length !== 1) throw new Error("Cheyenne County: missing current notices");
  const editions = notices[0].slice(1).filter(({ text }) => /\b(?:burn|fire) (?:ban|restrictions?)\b/i.test(text));
  if (!editions.length) return [];
  const [edition] = editions;
  if (editions.length === 1 && /\b(?:lift(?:ed|ing|s)?|revoked|rescinded|cancelled|canceled)\b/i.test(edition.text)) return [];
  if (editions.length !== 1 || !/^Open Burn Ban$/i.test(edition.text) || edition.href !== cheyenneNotice ||
      !matchesPdfEtag(await readOrder(), '"165056-64e7fdcd1c986"')) {
    throw new Error("Cheyenne County: review the newly published open burn ban");
  }
  const since = "2026-03-31";
  if (since > localClock(now, ZONE).date) throw new Error("Cheyenne County: future open burn ban");
  return [cheyenne.row(now, "ban", "Open burn ban", {
    since, note: "Cheyenne County Resolution 2026-06 restricts open fires in unincorporated areas until revoked by public notice. See the order for exceptions.",
  })];
}

export const coCheyenneFire: ActiveSource = {
  ...cheyenne.metadata,
  async fetch({ now }) {
    const read = pacedSourceReader({ maxResponseAgeMs: 12 * HOUR });
    const page = await read(cheyenne.metadata.sourceUrl);
    if (page.notModified) throw new Error("Unexpected Cheyenne County page 304");
    return { rows: await parseCheyenneFire(page.response, now, async () => {
      const order = await read(new URL(cheyenneNotice, cheyenne.metadata.sourceUrl).href, { method: "HEAD" });
      if (order.notModified) throw new Error("Unexpected Cheyenne County order 304");
      return order.response;
    }) };
  },
};

const HUERFANO_SITE = "https://huerfano.us";
const NOTICE_LIMIT = 20;
const huerfano = localFirePublisher({
  id: "co-huerfano-notices", county: "Huerfano", sourceName: "Huerfano County Board of County Commissioners",
  officialUrl: `${HUERFANO_SITE}/news/`,
  sourceUrl: wpRestUrl(HUERFANO_SITE, "posts", {
    search: "fire restrictions", per_page: String(NOTICE_LIMIT), _fields: "id,link,date_gmt,title,content",
  }),
  stack: "WordPress REST / dated notices",
}, { cadence: { kind: "daily", zone: ZONE, hours: [0, 8, 16] }, staleMs: 24 * HOUR });

export function parseHuerfanoFire(data: unknown, now: Date): CountyStatus[] {
  const latest = latestWpNotice(data, {
    site: HUERFANO_SITE, now, limit: NOTICE_LIMIT,
    matches: (title) => /^(?:Huerfano County\b.*\b(?:fire restrictions|fire ban)\b|Stage\b.*\b(?:fire restrictions|fire ban)\b|Fire Restrictions Lifted$)/i.test(title),
  });
  if (!latest) return [];

  const { title, body, published, url } = latest;
  const publishedDay = localClock(new Date(published), ZONE).date;
  const lift = new RegExp(`^On (?<date>${weekdayDate}); the Huerfano County Board of County Commissioners \\(BOCC\\) voted to lift Stage (?:One|Two|[12]) Fire Restrictions\\.`, "i").exec(body);
  if (/^Huerfano County Lifts Stage (?:One|Two|[12]) Fire Restrictions$/i.test(title) && lift) {
    const day = parseUsDate(lift.groups?.date ?? "");
    if (day && day <= publishedDay && /Huerfano County is no longer in Fire Restrictions\./i.test(body)) return [];
  }
  const issued = new RegExp(`^Stage (?<stage>[12]) Fire Restrictions Effective (?<date>${weekdayDate})$`, "i").exec(title);
  const since = parseUsDate(issued?.groups?.date ?? "");
  const stage = issued?.groups?.stage;
  if (!since || since > publishedDay || !stage ||
      !body.startsWith(`By order of the Huerfano County Board of Commissioners, Huerfano County has been placed under Stage ${stage} Fire Restrictions effective ${issued?.groups?.date}.`)) {
    throw new Error("Huerfano County: review the latest fire restriction notice");
  }
  return [{
    ...huerfano.row(now, stage === "2" ? "ban" : "restricted", `Stage ${stage} fire restrictions`, { since, sourceUpdated: published }),
    officialUrl: url,
  }];
}

export const coHuerfanoFire: ActiveSource = {
  ...huerfano.metadata, keepRowLinks: true,
  async fetch({ now }) {
    const text = await getText(huerfano.metadata.sourceUrl, { maxBytes: 250_000, headers: { accept: "application/json" } });
    return { rows: parseHuerfanoFire(JSON.parse(text), now) };
  },
};

export const coLocalFireSources = [
  coJeffersonFire, coEagleFireMap, coCheyenneFire, coHuerfanoFire, ...coHtmlFireStatus.map(({ source }) => source),
];
