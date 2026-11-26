import { countyStatusBulletin, datedLocalOrder } from "../lib/county-bulletin";
import { localClock, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtmlGrid, htmlStatusBlocks, matchHtmlStatus } from "../lib/html";
import { idBonnevilleOrders } from "./bonneville-orders";

const mountain = { kind: "daily", zone: US_ZONES.Mountain, hours: [6, 12, 18] } as const;
const pacific = { kind: "daily", zone: US_ZONES.Pacific, hours: [2, 8, 14, 20] } as const;
const HOUR = 3_600_000;

export const idElmoreOrders = countyStatusBulletin({
  id: "id-elmore-county-orders", state: "ID", county: "Elmore",
  stack: "CivicPlus / tabbed status bulletin", sourceName: "Elmore County via Mountain Home Fire Department",
  sourceUrl: "https://www.mountain-home.us/174/Fire-Department",
  officialUrl: "https://www.mountain-home.us/174/Fire-Department#tab903f3159-8f38-40a4-8f08-25ebe1952cc4_1",
  cadence: mountain, staleMs: 36 * HOUR,
  scopeNote: "Unincorporated Elmore County outside fire protection districts",
  async read(input, now) {
    const { match: [, from, until] } = await matchHtmlStatus(input, {
      section: "#tab903f3159-8f38-40a4-8f08-25ebe1952cc4_1",
      blocks: ".fr-view > p",
      choices: [["ban", /^From ([^\n]+?) until ([^\n]+?), the Elmore County Board of Commissioners declare a ban on Open Fire, as defined in the Burn Ban Ordinance on all private property and public lands located in Unincorporated Areas of the County Outside Fire Protection Districts, excluding those improved campgrounds operated by Idaho Power company\.$/im]],
    });
    const window = datedLocalOrder({ kind: "times", from, until }, mountain.zone, now);
    if (!window) return;
    return {
      ...window, status: "ban", label: "County open-fire ban",
      note: "The county order covers the private property and public lands described in the notice. Improved Idaho Power campgrounds are exempt. Check the order for exact boundaries.",
    };
  },
});

export const idGemFire2Orders = countyStatusBulletin({
  id: "id-gem-fire-2-orders", state: "ID", county: "Gem",
  stack: "Wix / district HTML bulletin", sourceName: "Gem County Fire Protection District #2",
  sourceUrl: "https://www.gemfire2.org/burnban", officialUrl: "https://www.gemfire2.org/burnban",
  cadence: mountain, staleMs: 36 * HOUR, maxBytes: 850_000,
  scopeNote: "Gem County Fire Protection District #2 service area",
  async read(input, now) {
    const { match: [, from, through] } = await matchHtmlStatus(input, {
      section: "#SITE_PAGES", blocks: "p",
      choices: [["ban", /^(?:Upcoming )?burn ban starting (.+?) through (.+?)\. This ban applies to all residents inside the service area of Gem County Fire Protection District #2\. All outside burning is prohibited as of \1 except for recreational fires in appropriate burn pits\/rings\. Burning in burn barrels is prohibited\.?$/im]],
    });
    const window = datedLocalOrder({ kind: "dates", from, through }, mountain.zone, now);
    if (!window) return;
    return {
      ...window, status: "ban", label: "District outdoor burning ban",
      note: "The district prohibits outdoor burning, including burn barrels, during the dated order. The district lists an exception for recreational fires in appropriate burn pits or rings.",
    };
  },
});

export const idNorthernLakesStatus = countyStatusBulletin({
  id: "id-northern-lakes-fire-status", state: "ID", county: "Kootenai",
  stack: "WordPress / mirrored Elementor status panels", sourceName: "Northern Lakes Fire District",
  sourceUrl: "https://northernlakesfire.com/", officialUrl: "https://northernlakesfire.com/#firedanger",
  cadence: pacific, staleMs: 12 * HOUR, scopeNote: "Northern Lakes Fire District",
  async read(input) {
    const panels = await extractHtmlGrid(input, {
      row: ".elementor-element-883a1a3, .elementor-element-19e904b",
      cell: ".elementor-element-883a1a3 h2.elementor-heading-title, .elementor-element-19e904b h2.elementor-heading-title",
    });
    const statuses = panels.map((panel) => panel.length === 1 && panel[0].text.toUpperCase());
    const [status, mobile] = statuses;
    if (statuses.length !== 2 || !status || status !== mobile) {
      throw new Error("Northern Lakes Fire District: missing or conflicting desktop/mobile decisions");
    }
    if (status === "BURNING IS OPEN") return;
    if (status !== "BURNING IS CLOSED") throw new Error("Northern Lakes Fire District: unknown burning status");
    return {
      status: "restricted", label: "District reports burning closed",
      note: "The district’s current burn-status panels show burning closed. Check its published burning rules or contact the district for the activities affected.",
    };
  },
});

export const idBannockStatus = countyStatusBulletin({
  id: "id-bannock-emergency-burn-status", state: "ID", county: "Bannock",
  stack: "WordPress / Divi emergency status panel", sourceName: "Bannock County Emergency Management",
  sourceUrl: "https://www.bannockcounty.gov/oem/", officialUrl: "https://www.bannockcounty.gov/oem/",
  cadence: mountain, staleMs: 36 * HOUR,
  scopeNote: "Wildland–urban interface areas in Bannock County",
  async read(input, now) {
    const [title, report] = await htmlStatusBlocks(input, ".et_pb_blurb_5 .et_pb_blurb_container",
      "h3.et_pb_module_header, .et_pb_blurb_description > p:first-child");
    if (!title || !report) throw new Error("Bannock County: missing burn status");
    const today = localClock(now, mountain.zone).date;
    if (title.toLowerCase() === "burn ban no longer in effect") {
      const expiry = /^Bannock County[’']s annual burn ban expired on ([^,]+, \d{4}),/.exec(report)?.[1];
      const date = expiry && parseUsDate(expiry);
      if (!date || date > today || date < shiftDay(today, -240)) {
        throw new Error("Bannock County: invalid or stale lift notice");
      }
      return;
    }
    const statement = /^From (.+?) through (.+?), (?:no open burning|open burning is prohibited)\b/i.exec(report);
    if (title.toLowerCase() !== "burn ban in effect" || !statement ||
        !/wildland.urban interface (?:\(WUI\) )?areas of (?:Pocatello and )?Bannock County/i.test(report)) {
      throw new Error("Bannock County: expected a dated burn decision with WUI boundaries");
    }
    const window = datedLocalOrder({ kind: "dates", from: statement[1], through: statement[2] }, mountain.zone, now);
    if (!window) return;
    return {
      ...window, status: "ban", label: "Wildland–urban interface open-burning ban",
      note: "County Emergency Management reports an open-burning ban in the listed wildland–urban interface areas. Check the county notice for boundaries and exemptions.",
    };
  },
});

export const idCoeurDAleneStatus = countyStatusBulletin({
  id: "id-coeur-dalene-fire-status", state: "ID", county: "Kootenai",
  stack: "Umbraco uSkinned / fire status callout", sourceName: "City of Coeur d’Alene Fire Department",
  sourceUrl: "https://www.cdaid.org/government/departments/fire/",
  officialUrl: "https://www.cdaid.org/government/departments/fire/",
  cadence: { kind: "daily", zone: US_ZONES.Pacific, hours: [3, 9, 15, 21] },
  staleMs: 12 * HOUR, scopeNote: "City of Coeur d’Alene",
  async read(input) {
    const { status } = await matchHtmlStatus(input, {
      section: ".content-col > .usn_cmp_alertbox", blocks: ".alert .info > p",
      choices: [
        ["limited", /^Fire Danger: (?:Low|Moderate) — No Restrictions\. Burn Permits being issued for fires 5' x 5' and smaller\. Larger piles need to be broken into 5' x 5' piles\.$/im],
        ["suspended", /^Fire Danger: (?:High|Very High|Extreme) — (?:No Burn Permits (?:are )?being issued|Burn Permits (?:are )?not being issued)\.$/im],
      ],
    });
    return status === "limited" ? {
      status: "restricted", label: "City burn permits limited to smaller piles",
      note: "The city reports no fire-stage restrictions in this notice and issues burn permits for piles up to five feet by five feet. Check the city’s in-person slash-pile inspection rules.",
    } : {
      status: "restricted", label: "City burn permit issuance suspended",
      note: "The city fire department reports a hold on burn permit issuance. Check the city notice for the affected activities.",
    };
  },
});

export const idCountyBulletins = [
  { ...idBannockStatus, fixture: "id-bannock-emergency-burn-status-2026-11-26.html.gz" },
  { ...idBonnevilleOrders, fixture: "id-bonneville-county-orders-2026-11-26.html.gz" },
  { ...idCoeurDAleneStatus, fixture: "id-coeur-dalene-fire-status-2026-11-26.html.gz" },
  { ...idElmoreOrders, fixture: "id-mountain-home-permits-2026-11-26.html.gz" },
  { ...idGemFire2Orders, fixture: "id-gem-fire-2-orders-2026-11-26.html.gz" },
  { ...idNorthernLakesStatus, fixture: "id-northern-lakes-fire-status-2026-11-26.html.gz" },
];
