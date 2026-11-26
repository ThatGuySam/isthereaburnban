import { arcgisLocalDate, arcgisRows, arcgisUrl } from "../lib/arcgis";
import { countyStatusBulletin, datedLocalOrder, requirePublishedOrderLink, scopedStatusBulletin } from "../lib/county-bulletin";
import { localClock, localDayWindow, reportWindow, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml } from "../lib/html";
import { pacedTextReader } from "../lib/http";
import { ND_DECLARATION_LAYER } from "./declarations";
import { currentNdRatings, ndActiveWarning, ND_FIRE_DANGER_URL } from "./restrictions";

const HOUR = 3_600_000;
const zone = US_ZONES.Central;
const bowmanUrl = "https://bowmannd.com/county/notices/";
const bowmanHeading = "BURN RESTRICTIONS IN PLACE:";
const bowmanBan = "TOTAL ban on open / controlled burning of anything to include garbage, campfires, aerial / ground fireworks, tree / wood piles and / or combustibles of any kind.";

export const ndBowmanBulletin = countyStatusBulletin({
  id: "nd-bowman-county-notices", state: "ND", county: "Bowman", sourceName: "Bowman County Commission",
  sourceUrl: bowmanUrl, officialUrl: bowmanUrl, stack: "WordPress / HTML current notices",
  scopeNote: "Unincorporated Bowman County",
  cadence: { kind: "hourly" }, pollGroup: "nd-hourly", staleMs: 4 * HOUR,
  async read(input, now) {
    const { blocks } = await extractHtml(input);
    if (blocks.filter(({ tag, text }) => tag === "h1" && text === "Notices").length !== 1) {
      throw new Error("Bowman County: missing county notices page");
    }
    const headings = blocks.filter(({ tag, text }) => tag === "h3" && text === bowmanHeading);
    if (!headings.length) return;
    const notice = blockAfterHeading(blocks, bowmanHeading, { requireUnique: true, headingTag: "h3" });
    const text = notice.map((block) => block.text);
    if (headings.length !== 1 || !text.some((line) => line.includes("Board of Bowman County Commissioners have instituted")) ||
        !text.some((line) => line.startsWith(bowmanBan)) ||
        !text.some((line) => line.startsWith("EXCEPTION: Responsible use of propane / gas / electric grills")) ||
        !text.includes("These restrictions are valid until further notice.")) {
      throw new Error("Bowman County: review the changed burn restrictions notice");
    }
    const since = "2026-09-15";
    if (localClock(now, US_ZONES.Mountain).date < since) return;
    return {
      status: "ban", since, label: "Total open-burning ban",
      note: "Bowman County prohibits open and controlled burning in the areas covered by its September 15 order. Propane, gas and electric grills are excepted when used safely away from combustibles. Check separately with incorporated cities.",
    };
  },
});

const roletteUrl = "https://rolettecountynd.gov/fire/";
const roletteOrderUrl = new URL("/__static/jdj5jdewjdbtsdbwrvhvwwg0mdvodzhi/2026-Rolette-County_Fire-Emergency-and-Burn-Restriction-Declaration.pdf", roletteUrl).href;

export const ndRoletteBulletin = countyStatusBulletin({
  id: "nd-rolette-burn-procedure", state: "ND", county: "Rolette", sourceName: "Rolette County Emergency Management",
  sourceUrl: roletteUrl, officialUrl: roletteUrl, stack: "County CMS / HTML and signed order",
  scopeNote: "Controlled burns under Rolette County's order",
  cadence: { kind: "daily", zone, hours: [6, 14] }, pollGroup: "nd-local-order-checks", staleMs: 24 * HOUR,
  async read(input, now) {
    const window = datedLocalOrder({ kind: "dates", from: "2026-04-14", through: "2026-12-31" }, zone, now);
    if (!window) return;
    const { blocks, links } = await extractHtml(input, { links: true });
    requirePublishedOrderLink(links, roletteUrl, "Rolette County Fire Emergency and Burn Restriction Declaration 2026- PDF", roletteOrderUrl);
    if (!blocks.some(({ tag, text }) => tag === "li" &&
        text.startsWith("Contact the Rolette County Dispatch Center at 477-5623 before a controlled burn is started") &&
        text.includes("again contact the Rolette County Dispatch Center to inform them of the completion."))) {
      throw new Error("Rolette County: review the changed controlled burn procedure");
    }
    return {
      ...window, status: "restricted", label: "Dispatch notification required for covered controlled burns",
      note: "The county's April 14 order requires its controlled-burn procedure for controlled and agricultural burns when they are otherwise allowed. Notify dispatch before starting and after the fire is out. Check the official declaration for prohibited days and exceptions.",
    };
  },
});

const mortonUrl = "https://mortonnd.gov/fire";
const mortonOrderUrl = "https://mortonnd.govoffice.com/uploads/dm/92461/Morton_County_Burn_Restrictions_Declaration_1272026";
const mortonRevokeUrl = "https://mortonnd.govoffice.com/uploads/dm/93976/Declaration_Revoking_Fire_Emergency_Burn_Ban_SIGNED_11122026.pdf";
type WeatherArea = { name: string; code: string };
type FireConditions = { ratings: unknown; warnings: unknown };

function countyWeatherReader(areas: readonly WeatherArea[]) {
  const codes = areas.map(({ code }) => `'${code}'`).join(",");
  const names = areas.map(({ name }) => `'${name} County'`).join(",");
  const ratingsUrl = new URL(ND_FIRE_DANGER_URL);
  ratingsUrl.searchParams.set("where", `CNTY_FIPS IN (${codes})`);
  const warningsUrl = arcgisUrl(ND_DECLARATION_LAYER, [
    "county", "Jurisdiction_Type", "Script_Update_Date", "RFW_Status", "rfw_effective_Date", "rfw_expiration_date",
  ], { where: `county IN (${names}) AND Jurisdiction_Type='County FDR' AND remove='No'` });
  return async (): Promise<FireConditions> => {
    const read = pacedTextReader({ headers: { accept: "application/json" }, maxBytes: 16_000 });
    const ratings: unknown = JSON.parse(await read(ratingsUrl.href));
    const warnings: unknown = JSON.parse(await read(warningsUrl));
    return { ratings, warnings };
  };
}

function countyFireConditions({ ratings, warnings }: FireConditions, { name, code }: WeatherArea, now: Date) {
  const checked = now.toISOString();
  const today = localClock(now, zone).date;
  const rating = currentNdRatings(ratings, checked, today).get(`38${code}`);
  const [row, ...extra] = arcgisRows(warnings, { requireComplete: true })
    .filter((row) => row.county === `${name} County` && row.Jurisdiction_Type === "County FDR");
  if (!row || extra.length ||
      !Object.hasOwn(row, "RFW_Status") || !Object.hasOwn(row, "rfw_effective_Date") || !Object.hasOwn(row, "rfw_expiration_date")) {
    throw new Error(`${name} County: changed warning report`);
  }
  const freshness = reportWindow(arcgisLocalDate(row.Script_Update_Date, zone), now, 3 * HOUR);
  const warning = freshness && ndActiveWarning(row, checked);
  return {
    rating, dayEnd: localDayWindow(today, zone).validUntil,
    warningEnd: warning && (warning.end < freshness.validUntil ? warning.end : freshness.validUntil),
  };
}

const morton = { name: "Morton", code: "059" };

export function mortonCountyBulletin(readConditions = countyWeatherReader([morton])) {
  return countyStatusBulletin({
    id: "nd-morton-county-order", state: "ND", county: "Morton", sourceName: "Morton County Emergency Management",
    sourceUrl: mortonUrl, officialUrl: mortonUrl, stack: "GovOffice / HTML and ArcGIS weather inputs",
    scopeNote: "Unincorporated Morton County",
    cadence: { kind: "hourly" }, pollGroup: "nd-hourly", staleMs: 3 * HOUR,
    async read(input, now) {
      const order = datedLocalOrder({ kind: "dates", from: "2026-11-12", through: "2026-12-31" }, zone, now);
      if (!order) return;
      const { blocks, links } = await extractHtml(input, { links: true });
      const panel = blockAfterHeading(blocks, "Current Morton County Burn Status", { requireUnique: true, headingTag: "h2" });
      const text = panel.map((block) => block.text);
      if (!text.includes("The Morton County Fire Emergency and countywide Burn Ban have been rescinded. The Burn Restriction adopted January 27, 2026, is again in effect through December 2026.") ||
          !text.includes("The North Dakota Rangeland Fire Danger Rating is High, Very High or Extreme, or") ||
          !text.includes("A Red Flag Warning has been issued for Morton County.")) {
        throw new Error("Morton County: review the changed burn-status notice");
      }
      requirePublishedOrderLink(links, mortonUrl, "View the January 27, 2026 Burn Restriction", mortonOrderUrl);
      requirePublishedOrderLink(links, mortonUrl, "View the signed November 12 rescission declaration", mortonRevokeUrl);

      const { rating, dayEnd, warningEnd } = countyFireConditions(await readConditions(), morton, now);
      const until = rating !== undefined && rating >= 3 ? dayEnd : warningEnd;
      if (!until) return;
      return {
        ...order, since: null, validUntil: until < order.validUntil ? until : order.validUntil,
        status: "ban", label: "Open burning prohibited under fire-weather restrictions",
        note: "Morton County's January 27 order prohibits open burning at High, Very High or Extreme fire danger or during a Red Flag Warning. The county restored that order on November 12. Check the county notice for gas-device exceptions and city rules.",
      };
    },
  });
}

const northCentralUrl = "https://www.bottineauco.com/fire";
const northCentralOrders = [
  { name: "Bottineau", code: "009", link: "BOTTINEAU Co. BURN POLICY", file: "670219_e4df74d62e04423a8eebf463654407de.pdf",
    high: "Debris and waste burning is prohibited. The declaration also requires dispatch notification and a tilled firebreak for eligible crop-residue and slough burning." },
  { name: "Renville", code: "075", link: "RENVILLE Co. BURN POLICY", file: "670219_bbb9872f6fe048d8990f526f3cdfdf84.pdf",
    high: "Campfires, fire pits, fireworks and debris and waste burning are prohibited. The declaration also requires dispatch notification and a tilled firebreak for eligible crop-residue and slough burning." },
] as const;

export function northCentralCountyBulletin(readConditions = countyWeatherReader(northCentralOrders)) {
  return scopedStatusBulletin({
    id: "nd-bottineau-renville-orders", state: "ND", counties: northCentralOrders.map(({ name }) => name),
    sourceName: "Bottineau and Renville County Commissions",
    sourceUrl: northCentralUrl, officialUrl: northCentralUrl, stack: "Wix / signed orders and ArcGIS weather inputs",
    cadence: { kind: "daily", zone, hours: [6, 14] }, pollGroup: "nd-local-order-checks", staleMs: 18 * HOUR, maxBytes: 1_200_000,
    async read(input, now) {
      if (localClock(now, zone).date < "2026-03-03") return [];
      const { blocks, links } = await extractHtml(input, { links: true });
      if (!blocks.some(({ tag, text }) => tag === "p" && text.startsWith(
        "Bottineau County has a Burn Ban policy that automatically goes into effect whenever the ND Fire Danger Index",
      ))) throw new Error("Bottineau County: missing the current paired burn policies");
      for (const { link, file } of northCentralOrders) {
        requirePublishedOrderLink(links, northCentralUrl, link, new URL(`/_files/ugd/${file}`, northCentralUrl).href);
      }
      const reports = await readConditions();
      return northCentralOrders.flatMap((order) => {
        const { rating, dayEnd, warningEnd } = countyFireConditions(reports, order, now);
        const high = rating !== undefined && rating >= 3;
        const severe = rating !== undefined && rating >= 4;
        if (!high && !warningEnd) return [];
        const broader = severe || warningEnd !== undefined;
        const label = broader ? "Burn restrictions on campfires, debris and crop-residue burning"
          : "Burn restrictions during High fire danger";
        const note = broader
          ? "The March 3 county order restricts recreational fires, debris and waste burning, fireworks, crop-residue burning and slough burning at Very High or Extreme fire danger or during a Red Flag Warning."
          : order.high;
        return [{
          county: order.name, scopeNote: `Burning covered by ${order.name} County's March 3 declaration`,
          status: "restricted", label, note, validUntil: severe || !warningEnd ? dayEnd : warningEnd,
        }];
      });
    },
  });
}

export const ndMortonBulletin = mortonCountyBulletin();
export const ndNorthCentralBulletin = northCentralCountyBulletin();
export const ndCountyBulletins = [ndBowmanBulletin.source, ndMortonBulletin.source, ndRoletteBulletin.source, ndNorthCentralBulletin.source];
