import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { elementorPageBlocks } from "../lib/elementor";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Eastern;
const STALE_MS = 4 * 3_600_000;
const LIFTED = /^(?:(?:the )?(?:open )?burn ban (?:has been )?lifted|no burn ban (?:is )?in effect)[.!]?(?:\s|$)/i;

function spencerNotice(blocks: readonly string[]) {
  const [notice, ...extra] = blocks.filter((text) => /^(?:(?:the )?(?:open )?burn ban |no burn ban )/i.test(text));
  if (extra.length) throw new Error("Spencer Township: overlapping burn notices");
  return notice;
}

type Bulletin = {
  id: string;
  fips: string;
  township: string;
  url: string;
  pageId: number;
  heading: string;
  readNotice: (blocks: readonly string[]) => string | undefined;
  effectiveDate: RegExp;
  status: "ban" | "restricted";
  label: string;
  note: string;
};

const townships: readonly Bulletin[] = [
  {
    id: "mi-spencer-township-burn-bulletin", fips: "26081", township: "Spencer Township",
    url: "https://spencertwpmi.gov/fire/", pageId: 319, heading: "BURN PERMITS",
    readNotice: spencerNotice,
    effectiveDate: /^Burn ban in effect starting ([A-Za-z]+ \d{1,2}, \d{4}) until further notice\. No burn permits will be issued\./,
    status: "restricted", label: "Fire department reports a burn permit hold",
    note: "The fire department has suspended burn permits until further notice. It lists separate precautions for small recreational fires.",
  },
  {
    id: "mi-vernon-township-burn-bulletin", fips: "26155", township: "Vernon Township",
    url: "https://vernontwp-mi.gov/fire-department/", pageId: 475, heading: "Burning Permit Application",
    readNotice: (blocks) => {
      const heading = blocks.indexOf("BURN BAN");
      if (heading !== blocks.lastIndexOf("BURN BAN")) throw new Error("Vernon Township: overlapping burn notices");
      return heading < 0 ? undefined : blocks[heading + 1] ?? "";
    },
    effectiveDate: /^The Vernon Township Fire Chief has issued a burn ban effective ([A-Za-z]+ \d{1,2}, \d{4}), and it will remain in place until further notice\. All open burning—including brush, yard waste, and recreational fires—is prohibited during this period\./,
    status: "ban", label: "Fire chief reports an open burning ban",
    note: "The fire chief prohibits open burning, including brush, yard waste and recreational fires, until further notice.",
  },
];

export const miTownshipBulletins = townships.map((bulletin) => {
  const { id, fips, township, url, pageId, heading, readNotice, effectiveDate, status, label, note } = bulletin;
  const county = COUNTY_BY_FIPS.get(fips);
  if (county?.state !== "MI") throw new Error(`Unknown Michigan bulletin county: ${fips}`);
  const countyName = county.name;
  const publisher = {
    id, state: "MI", scope: "part", stack: "WordPress / Elementor HTML",
    sourceName: `${township} Fire Department`, sourceUrl: url, officialUrl: url,
  } as const;

  async function parse(input: Response | string, now: Date): Promise<CountyStatus[]> {
    const blocks = await elementorPageBlocks(input, pageId, "h2, .elementor-widget-text-editor p");
    const start = blocks.indexOf(heading);
    if (start < 0 || start !== blocks.lastIndexOf(heading)) throw new Error(`${id}: missing or duplicate permit heading`);
    const notice = readNotice(blocks.slice(start + 1));
    if (notice === undefined || LIFTED.test(notice)) return [];
    const date = effectiveDate.exec(notice)?.[1];
    const since = date && parseUsDate(date);
    if (!since || since > localClock(now, ZONE).date) throw new Error(`${id}: invalid or future burn notice`);
    return [{
      ...publisher, sourceId: id, fips, county: countyName, status, label, scopeNote: township, note,
      checked: now.toISOString(), sourceUpdated: null, since, expires: null,
    }];
  }

  const source: ActiveSource = {
    ...publisher, mode: "positive-only", coverage: "restrictions", reportingFips: [fips], staleMs: STALE_MS,
    cadence: { kind: "hourly" },
    async fetch({ now }) {
      const reply = await fetchSource(url, { headers: { accept: "text/html" }, maxResponseAgeMs: STALE_MS });
      if (reply.notModified) throw new Error(`Unexpected ${id} 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
});
