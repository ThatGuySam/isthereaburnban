import { countyStatusBulletin } from "../lib/county-bulletin";
import { atLocalTime, localClock, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { htmlStatusBlocks, htmlText } from "../lib/html";
import { parseWpPageBlocks, wpRestUrl } from "../lib/wordpress";

const STATE = "SD";
const CENTRAL = US_ZONES.Central;
const POLL = { cadence: { kind: "daily", zone: CENTRAL, hours: [6, 10, 14, 18, 22] }, staleMs: 10 * 3_600_000 } as const;
const noBan = (note: string) => ({ status: "none", label: "No countywide burn ban reported", note } as const);
const ban = (note: string) => ({ status: "ban", label: "Countywide burn ban in effect", note } as const);

const davisonUrl = "https://www.davisoncounty.org/departments/emergency-management/";
export const davisonBurnStatus = countyStatusBulletin({
  ...POLL,
  id: "sd-davison-ema", state: STATE, county: "Davison", stack: "WordPress / REST status bulletin",
  sourceName: "Davison County Emergency Management", officialUrl: davisonUrl, accept: "application/json",
  sourceUrl: wpRestUrl("https://www.davisoncounty.org", "pages/114", { _fields: "id,status,link,modified_gmt,content" }),
  async read(input, now) {
    const { blocks, modified } = await parseWpPageBlocks(await input.json(), { id: 114, url: davisonUrl }, now);
    const heading = ({ text }: { text: string }) => text === "BURN BAN INFORMATION:";
    const index = blocks.findIndex(heading);
    if (index < 0 || index !== blocks.findLastIndex(heading)) return;
    const text = blocks[index + 1]?.text ?? "";
    if (/^Davison County is not currently in a burn ban\.(?:\s|$)/.test(text)) {
      return { ...noBan("The county's burn-ban bulletin reports no current ban. Notify dispatch before a controlled burn."), sourceUpdated: modified };
    }
    if (/^(?:Davison County is currently (?:in|under) a burn ban|A burn ban is (?:currently )?in effect (?:for all of|throughout) Davison County)\.$/i.test(text)) {
      return { ...ban("The county's burn-ban bulletin reports an active ban. See the county bulletin for exceptions."), sourceUpdated: modified };
    }
  },
});

const yanktonUrl = "https://yanktonoem.com/";
export const yanktonBurnStatus = countyStatusBulletin({
  ...POLL,
  id: "sd-yankton-ema", state: STATE, county: "Yankton", stack: "GoDaddy Website Builder / HTML status banner",
  sourceName: "Yankton County Emergency Management", officialUrl: yanktonUrl, sourceUrl: yanktonUrl,
  async read(input, now) {
    const blocks = await htmlStatusBlocks(input, '[data-aid="HEADER_WIDGET"]', '[data-aid="HEADER_PHONE_RENDERED"]');
    const [text] = blocks;
    if (blocks.length !== 1) return;
    const match = /^Yankton County Open Burning is (allowed|not allowed|prohibited|banned)\s*[-–:]?\s*(\d{1,2}-\d{1,2}-\d{4})$/i.exec(text);
    const date = match && parseUsDate(match[2]);
    const today = localClock(now, CENTRAL).date;
    if (!date || date > today || date <= shiftDay(today, -7)) return;
    const validUntil = atLocalTime(shiftDay(date, 7), 0, CENTRAL);
    if (!validUntil) return;
    const status = match[1].toLowerCase() === "allowed"
      ? noBan("The county's dated open-burning notice says burning is allowed. Local rules and permit requirements may apply.")
      : ban("The county's dated open-burning notice says burning is prohibited. See the county notice for conditions.");
    return { ...status, validUntil, note: `${status.note} Bulletin date ${date}.` };
  },
});

const spinkUrl = "https://spinkcounty-sd.org/emergency.html";
export const spinkBurnStatus = countyStatusBulletin({
  ...POLL,
  id: "sd-spink-ema", state: STATE, county: "Spink", stack: "Legacy HTML / literal marquee",
  sourceName: "Spink County Emergency Management", officialUrl: spinkUrl, sourceUrl: spinkUrl,
  async read(input, now) {
    const html = await input.text();
    // The publisher repeats the same notice for continuous scrolling. Read its literal string without executing code.
    const [marquee, extra] = html.matchAll(/^[ \t]*var marqueecontent='(<nobr>[^\r\n]*<\/nobr>)'[ \t]*;?[ \t]*\r?$/gm);
    if (!marquee || extra) return;
    const messages = [...new Set(marquee[1].split(/(?:&nbsp;\s*){3,}|\.{3,}|…/).map(htmlText).filter(Boolean))];
    const notices = messages.filter((part) => /\bburn(?:ing)?\s+ban\b/i.test(part));
    if (notices.length !== 1) return;
    const match = /^Burn Ban (cancelled|canceled|lifted|in effect|effective)(?: on)?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/i.exec(notices[0]);
    const date = match && parseUsDate(match[2]);
    if (!date || date > localClock(now, CENTRAL).date) return;
    if (/^in effect$|^effective$/i.test(match[1])) {
      return { ...ban("The active county banner lists a burn ban. Contact the county for exceptions."), since: date };
    }
    return noBan(`The active county banner says the countywide burn ban was lifted on ${date}. Local rules may apply.`);
  },
});

const sullyUrl = "https://sully.sdcounty.gov/";
export const sullyBurnStatus = countyStatusBulletin({
  ...POLL,
  id: "sd-sully-commission", state: STATE, county: "Sully", stack: "ASP.NET WebForms / HTML status banner",
  sourceName: "Sully County", officialUrl: sullyUrl, sourceUrl: sullyUrl,
  scopeNote: "Sully County outside municipalities and planned unit developments",
  async read(input) {
    const blocks = await htmlStatusBlocks(input, ".content > .colRight", ".content > .colRight > p");
    const banners = blocks.filter((text) => /BURN BAN/i.test(text));
    if (banners.length !== 1) return;
    if (/^EMERGENCY BURN BAN IN EFFECT[.,]? NO OPEN BURNING ALLOWED\.?$/i.test(banners[0])) {
      return {
        status: "ban", label: "Emergency open-burning ban in effect",
        note: "The current Sully County banner reports an emergency ban. See the county ordinance for scope and exceptions.",
      };
    }
    if (/^REGULAR BURN BAN ORDINANCE IN EFFECT[.,] USE CAUTION\.$/i.test(banners[0])) {
      return {
        status: "restricted", label: "Regular open-burning ordinance in effect",
        note: "Sully County reports the regular ordinance is in effect. It requires advance notice and restricts open burning during qualifying National Weather Service fire danger. Check the current index and county guidance.",
      };
    }
  },
});

export const sdCountyBulletins = [davisonBurnStatus, spinkBurnStatus, sullyBurnStatus, yanktonBurnStatus];
