import { countyStatusBulletin, datedLocalOrder } from "../lib/county-bulletin";
import { localClock, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { htmlStatusBlocks } from "../lib/html";
import { getText } from "../lib/http";

const ZONE = US_ZONES.Mountain;
const INDEX = "https://www.bonnevillecountyidaho.gov/page/resolutions";
const ANNOUNCEMENT = "https://www.bonnevillecountyidaho.gov/county-news/burn-ban-in-effect";
const BAN = /\b(?:burn|burning) ban\b|\bban on (?:open )?burning\b/i;
const LIFT = /^(?:Rescinding|Repeal) of (?:the )?(?:Burn|Burning) Ban$/i;
const ISSUE = /^(?:Declaration of Emergency (?:&|and) )?Implementation of (?:a )?(?:Burn|Burning) Ban$/i;

export async function readBonnevilleOrders(input: Response, now: Date, readAnnouncement: () => Promise<string>) {
  const year = localClock(now, ZONE).date.slice(0, 4);
  const rows = await htmlStatusBlocks(input, ".content-flex-child-body > .page-rich-text",
    "h2, h3, h4, li");
  if (rows[0] !== "Name or Date of Resolution Name and/or Description of Resolution") {
    throw new Error("Bonneville County: missing resolution register heading");
  }
  const yearCode = year.slice(2);
  const documents: { number: number; title: string }[] = [];
  for (const text of rows.filter((row) => row.startsWith(`${yearCode}-`))) {
    const item = /^\d{2}-(\d{2,3}) (.+)$/.exec(text);
    if (!item) throw new Error("Bonneville County: invalid resolution entry");
    documents.push({ number: Number(item[1]), title: item[2] });
  }
  documents.sort((left, right) => right.number - left.number);
  if (documents.some(({ number }, index) => number !== documents.length - index)) {
    throw new Error("Bonneville County: incomplete resolution register");
  }
  const latest = documents.find(({ title }) => BAN.test(title));
  if (!latest || LIFT.test(latest.title)) return;
  if (!ISSUE.test(latest.title)) throw new Error("Bonneville County: burning resolution needs review");

  const [heading, summary, , scope] = await htmlStatusBlocks(await readAnnouncement(), "article._1440-container",
    "h2, .rich-text-block-2 > p");
  const issue = /^On (.+?), Bonneville County Commissioners issued a burn ban in Bonneville County per Resolution #([\d-]+)\./.exec(summary);
  const end = /\bThis burn ban will last until ([^\n]+?, \d{4}) unless amended by resolution\.$/.exec(summary);
  const id = `${yearCode}-${String(latest.number).padStart(2, "0")}`;
  if (heading !== "Burn Ban in Effect" || issue?.[2] !== id || !end ||
      !scope?.includes("This ban will impact private property in the unincorporated sections of the County.") ||
      !scope.includes("This ban does not include State or Federal public lands in Bonneville County.")) {
    throw new Error("Bonneville County: announcement does not match the latest resolution and scope");
  }
  const from = parseUsDate(issue[1], Number(year));
  const until = parseUsDate(end[1]);
  if (!from || !until) throw new Error("Bonneville County: invalid order dates");
  const window = datedLocalOrder({ kind: "dates", from, through: shiftDay(until, -1) }, ZONE, now);
  if (!window) return;
  return {
    ...window, status: "ban" as const, label: "County open-burning ban",
    note: `Commissioners' resolution ${id} limits open burning on private land in unincorporated Bonneville County. The county lists exceptions for certain campfires and smoking.`,
  };
}

export const idBonnevilleOrders = countyStatusBulletin({
  id: "id-bonneville-county-orders", state: "ID", county: "Bonneville",
  stack: "Webflow / resolution register and county announcement", sourceName: "Bonneville County Commissioners",
  sourceUrl: INDEX, officialUrl: INDEX,
  cadence: { kind: "daily", zone: ZONE, hours: [5, 11, 17] }, staleMs: 36 * 3_600_000,
  scopeNote: "Private property in unincorporated Bonneville County",
  read: (input, now) => readBonnevilleOrders(input, now, async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    return getText(ANNOUNCEMENT, { headers: { accept: "text/html" }, maxBytes: 200_000 });
  }),
});
