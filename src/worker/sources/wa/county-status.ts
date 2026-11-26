import { civicPlusActiveAlerts, latestCivicPlusNewsFlashNotice } from "../lib/civicplus";
import { countyStatusBulletin, htmlStatusBulletin, namedStatusRows, scopedStatusBulletin } from "../lib/county-bulletin";
import { localClock, parseLocalDateTime, parseUsDate, US_ZONES } from "../lib/dates";
import { htmlStatusBlocks } from "../lib/html";
import type { Cadence } from "../types";

const cadence = { kind: "daily", zone: US_ZONES.Pacific, hours: [0, 8, 16] } satisfies Cadence;
const countyPoll = { cadence, staleMs: 24 * 3_600_000, pollGroup: "wa-county-fire-safety" };

const stage1 = {
  status: "restricted", label: "Stage 1 fire safety burn ban",
  note: "The fire marshal has restricted outdoor debris burning. Check the county notice for recreational fire rules and exceptions.",
} as const;
const stage2 = {
  status: "ban", label: "Stage 2 fire safety burn ban",
  note: "The fire marshal has prohibited outdoor burning, including most recreational fires. Check the county notice for exceptions.",
} as const;

const KITSAP = "https://www.kitsap.gov/dcd/Pages/Burn-Ban-Information.aspx";
export const waKitsapFire = htmlStatusBulletin({
  id: "wa-kitsap-fire-safety", state: "WA", county: "Kitsap", stack: "SharePoint / current status heading",
  sourceName: "Kitsap County Fire Marshal", sourceUrl: KITSAP, officialUrl: KITSAP,
  ...countyPoll, scopeNote: "County fire safety jurisdiction in Kitsap County",
  section: "#WebPartWPQ2", blocks: "h1.ms-rteElement-H1B",
  decisions: [
    [/^CURRENT BURN BAN STATUS: No Burn Ban(?: in Effect)?\.?$/im],
    [/^CURRENT BURN BAN STATUS: Stage 1(?: Burn Ban)?(?: in Effect)?\.?$/im, stage1],
    [/^CURRENT BURN BAN STATUS: Stage 2(?: Burn Ban)?(?: in Effect)?\.?$/im, stage2],
  ],
});

const SNOHOMISH = "https://www.snohomishcountywa.gov/1144/Outdoor-Burning-Information";
export const waSnohomishFire = htmlStatusBulletin({
  id: "wa-snohomish-fire-safety", state: "WA", county: "Snohomish", stack: "CivicPlus / current status heading",
  sourceName: "Snohomish County Fire Marshal", sourceUrl: SNOHOMISH, officialUrl: SNOHOMISH,
  ...countyPoll, scopeNote: "Unincorporated Snohomish County",
  section: "#page", blocks: ".fr-view > h1.headline",
  decisions: [
    [/^Fire Safety Burn Ban Status: No Burn Ban\.?$/im],
    [/^Fire Safety Burn Ban Status: Stage 1(?: Fire Safety)?(?: Burn Ban)?(?: in Effect)?\.?$/im, stage1],
    [/^Fire Safety Burn Ban Status: Stage 2(?: Fire Safety)?(?: Burn Ban)?(?: in Effect)?\.?$/im, stage2],
  ],
});

const OKANOGAN = "https://www.okanogancounty.gov/406/Burn-Ban-Information";
export const waOkanoganFire = htmlStatusBulletin({
  id: "wa-okanogan-fire-safety", state: "WA", county: "Okanogan", stack: "CivicPlus / current status heading",
  sourceName: "Okanogan County Emergency Management", sourceUrl: OKANOGAN, officialUrl: OKANOGAN,
  ...countyPoll, scopeNote: "Private property in unincorporated Okanogan County",
  section: "#page", blocks: ".fr-view > h1.headline",
  decisions: [
    [/^Currently No Burn Restrictions in place\.?$/im],
    [/^(?:Currently )?(?:A )?Burn Restriction(?:s)? (?:is |are )?(?:in place|in effect)\.?$/im, {
      status: "restricted", label: "County outdoor burning restriction",
      note: "Okanogan County restricts debris and other covered outdoor burning on unincorporated private lands. Check the county for recreational fire rules.",
    }],
    [/^(?:Currently )?(?:A )?(?:County-Wide )?Burn Ban (?:is )?(?:in place|in effect)\.?$/im, {
      status: "ban", label: "County outdoor burning ban",
      note: "The county's burn ban prohibits outdoor burning, including recreational fires, within its jurisdiction. Check the current notice for boundaries.",
    }],
  ],
});

const PIERCE = "https://www.piercecountywa.gov/AlertCenter.aspx?CID=54";
export const waPierceFire = countyStatusBulletin({
  id: "wa-pierce-fire-safety", state: "WA", county: "Pierce", stack: "CivicPlus / Alert Center",
  sourceName: "Pierce County Fire Marshal", sourceUrl: PIERCE, officialUrl: "https://www.piercecountywa.gov/fire",
  ...countyPoll, scopeNote: "Pierce County Fire Marshal jurisdiction",
  async read(input) {
    const alerts = await civicPlusActiveAlerts(input, PIERCE);
    if (alerts.length !== 1) throw new Error("Pierce County: expected one active burn ban bulletin");
    const [{ title, text }] = alerts;
    if (title === "There are no burn bans in Pierce County at this time.") return;
    const heading = /^Stage ([12])(?: Fire Safety)? (?:Burn Ban|Burn Restrictions)(?: in Effect)?(?: for Unincorporated Pierce County)?\.?$/i.exec(title);
    const stage = heading?.[1] ?? /\bStage ([12]) (?:Fire Safety )?(?:Burn Ban|Burn Restrictions)\b/i.exec(text)?.[1];
    if (!stage || !/\bburn (?:ban|restrictions?)\b/i.test(title) ||
        /\b(?:lifted|rescinded|expired)\b/i.test(`${title} ${text}`)) {
      throw new Error("Pierce County: unrecognized current fire safety alert");
    }
    return stage === "2" ? stage2 : stage1;
  },
});

const portals = [
  { id: "san-juan-island", name: "San Juan Island Fire & Rescue", url: "https://permits.sjifire.org/", scopeNote: "San Juan Island Fire & Rescue district" },
  { id: "shaw-island", name: "Shaw Island Fire & EMS", url: "https://permits.shawfire5.org/", scopeNote: "Shaw Island Fire & EMS district" },
  { id: "lopez-island", name: "Lopez Island Fire and EMS", url: "https://permits.stationworks.app/agency/lopezfire", scopeNote: "Lopez Island Fire and EMS district" },
  { id: "orcas-island", name: "Orcas Island Fire & Rescue", url: "https://permits.orcasfire.org/", scopeNote: "Orcas Island Fire & Rescue district" },
];
export const waIslandPermitStatuses = portals.map(({ id, name, url, scopeNote }) => countyStatusBulletin({
  id: `wa-${id}-permit-status`, state: "WA", county: "San Juan", stack: "SvelteKit / rendered permit board",
  sourceName: name, sourceUrl: url, officialUrl: url,
  cadence: { kind: "hourly" }, staleMs: 4 * 3_600_000, scopeNote, pollGroup: "wa-hourly-bulletins",
  async read(input) {
    const [heading, title, status, detail, ...extra] = await htmlStatusBlocks(input, "main",
      'main > h1, #q-permits, section[aria-labelledby="q-permits"] p.items-start > span');
    if (heading !== `${name} burn permits` || title !== "Burn permits" || !detail || extra.length) {
      throw new Error(`${name}: missing or changed permit status panel`);
    }
    if (status === "Yes" && detail === "With a permit.") return;
    if (status !== "No") throw new Error(`${name}: unrecognized permit decision`);
    return {
      status: "restricted", label: "District reports permitted burning closed",
      note: "The fire district’s permit board reports that permitted burning is closed. See the separate recreational fire and land-manager notices before burning.",
    };
  },
}));

const ISLAND_ORIGIN = "https://www.islandcountywa.gov";
export const waIslandFire = countyStatusBulletin({
  id: "wa-island-county-fire-safety", state: "WA", county: "Island",
  stack: "CivicPlus / News Flash RSS", sourceName: "Island County Fire Marshal",
  sourceUrl: `${ISLAND_ORIGIN}/RSSFeed.aspx?CID=Burn-Ban-Updates-10&ModID=1`,
  officialUrl: `${ISLAND_ORIGIN}/625/Outdoor-Burning`,
  ...countyPoll, accept: "application/rss+xml, application/xml, text/xml", scopeNote: "Island County Fire Marshal jurisdiction",
  async read(input, now) {
    const notice = latestCivicPlusNewsFlashNotice(await input.text(), {
      origin: ISLAND_ORIGIN, channelTitle: "Island County, WA - News Flash - Burn Bans", now,
      matches: (title) => /\bburn ban\b/i.test(title),
    });
    if (!notice || /^Burn Ban Lift(?:ed)? - .+$/i.test(notice.title)) return;
    const stage = /\b(?:Level|Type|Stage) ([12])\b/i.exec(notice.title)?.[1];
    const details = [notice.title, notice.text].join(" ");
    const effective = /\beffective (?:on )?((?:[a-z]+, )?[a-z]+ \d{1,2}, \d{4})(?: at (\d{1,2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?))?/i.exec(details);
    const day = effective && parseUsDate(effective[1]);
    const time = effective?.[2]?.trim();
    const validFrom = time && parseLocalDateTime(`${day} at ${time}`, US_ZONES.Pacific);
    if (!stage || !day || (time && !validFrom)) throw new Error("Island County: unrecognized burn ban notice");
    if (day > localClock(now, US_ZONES.Pacific).date || (validFrom && validFrom > now.toISOString())) return;
    return { ...(stage === "2" ? stage2 : stage1), since: day, validFrom: validFrom || undefined, sourceUpdated: notice.published };
  },
});

const KLICKITAT = "https://www.klickitatcounty.gov/1242";
const zones = ["One", "Two", "Three"];
export const waKlickitatZones = scopedStatusBulletin({
  id: "wa-klickitat-county-zones", state: "WA", counties: ["Klickitat"], stack: "CivicPlus / county zone orders",
  sourceName: "Klickitat County Emergency Management", sourceUrl: KLICKITAT, officialUrl: KLICKITAT, ...countyPoll,
  async read(input, now) {
    const blocks = await htmlStatusBlocks(input, "#page", "#versionHeadLine, .fr-view > h1, .fr-view > h2");
    const title = /^(\d{4}) Burn Ban Zone Maps and Resolutions$/.exec(blocks[0])?.[1];
    const today = localClock(now, US_ZONES.Pacific).date;
    const heading = "Current Burn Bans Effective Dates";
    const start = blocks.indexOf(heading);
    if (!title || start < 0 || start !== blocks.lastIndexOf(heading) ||
        (title !== today.slice(0, 4) && !(today.slice(5) <= "03-31" && Number(title) === Number(today.slice(0, 4)) - 1))) {
      throw new Error("Klickitat County: missing current-year zone orders");
    }
    const entries = blocks.slice(start + 1).filter((block) => /^Burn Ban Zone\b/.test(block));
    const areas = namedStatusRows(entries.map((block) => {
      const match = /^Burn Ban Zone (One|Two|Three)\s*[-–—]\s*(.+)$/i.exec(block);
      return match ? [match[1], match[2]] : [];
    }), zones, 2);
    return [...areas].flatMap(([zone, [statement]]) => {
      const change = /^(Rescinded|Effective)(?: on)? (.+)$/i.exec(statement);
      const since = change && parseUsDate(change[2]);
      const validFrom = !since && change && parseLocalDateTime(change[2], US_ZONES.Pacific);
      const day = since || (validFrom && localClock(new Date(validFrom), US_ZONES.Pacific).date);
      if (!change || !day || !day.startsWith(title)) throw new Error(`Klickitat County: unrecognized Zone ${zone} decision`);
      if (change[1].toLowerCase() === "rescinded" || day > today || (validFrom && validFrom > now.toISOString())) return [];
      return [{
        county: "Klickitat", scopeNote: `Klickitat County burn ban zone ${zone}`, status: "restricted",
        label: `Zone ${zone} outdoor burning restrictions`,
        note: "The county lists this zone under its current burn ban dates. Check the zone map and signed resolution for its boundaries and exceptions.",
        since: day, validFrom: validFrom || undefined,
      }];
    });
  },
});

export const waCountyStatus = [
  waKitsapFire, waSnohomishFire, waOkanoganFire, waPierceFire, waIslandFire, waKlickitatZones, ...waIslandPermitStatuses,
];
