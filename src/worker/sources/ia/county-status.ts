import type { CountyStatus } from "../../../shared/types";
import { civicPlusActiveAlerts } from "../lib/civicplus";
import { localClock, parseLocalDateTime, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const SIX_HOURS = 6 * 3_600_000;
const ZONE = US_ZONES.Central;
type Decision = Pick<CountyStatus, "status" | "label" | "note"> &
  Partial<Pick<CountyStatus, "officialUrl" | "since" | "sourceUpdated">>;
type CountyBulletin = Pick<ActiveSource, "id" | "sourceName" | "sourceUrl" | "stack"> &
  Pick<CountyStatus, "county" | "fips"> & {
    read(input: Response | string, now: Date): Promise<Decision>;
  };

const noOrder = (note: string): Decision => ({
  status: "none", label: "No countywide burn ban reported", note,
});

const unconfirmed = (note: string): Decision => ({
  status: "unknown", label: "Countywide status unconfirmed", note,
});

const localRules = "Local ordinances and permits may apply.";

function countyBulletin({ county, fips, read, ...meta }: CountyBulletin) {
  const parse = async (input: Response | string, now: Date): Promise<CountyStatus[]> => [{
    county, fips, state: "IA", scope: "county", sourceId: meta.id, sourceName: meta.sourceName,
    sourceUrl: meta.sourceUrl, officialUrl: meta.sourceUrl, checked: now.toISOString(),
    since: null, expires: null, sourceUpdated: null,
    ...await read(input, now),
  }];
  const source: ActiveSource = {
    ...meta, state: "IA", scope: "county", mode: "full", coverage: "live",
    officialUrl: meta.sourceUrl, keepRowLinks: true, cadence: { kind: "hourly" }, staleMs: SIX_HOURS,
    async fetch({ now }) {
      const reply = await fetchSource(meta.sourceUrl, {
        headers: { accept: "text/html" }, maxResponseAgeMs: SIX_HOURS,
      });
      if (reply.notModified) throw new Error(`${meta.id}: unexpected 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}

export const cedar = countyBulletin({
  id: "ia-cedar-ema", county: "Cedar County", fips: "19031", stack: "Neapolitan Labs / HTML banner",
  sourceName: "Cedar County Emergency Management",
  sourceUrl: "https://cedarcounty.iowa.gov/emergency_management/",
  async read(input, now) {
    const banner = "#headerTop .headerBurn";
    const [cells, ...extra] = await extractHtmlGrid(input, {
      row: banner,
      cell: `${banner} > a, ${banner} #burnBanNotes > p`,
    });
    const [link, heading, detail] = cells ?? [];
    if (extra.length || !link || link.text !== heading?.text || !detail) {
      throw new Error("Cedar County: missing or inconsistent burn-ban banner");
    }
    const effective = /^Effective (.+?), (.+?)\.?$/i.exec(detail.text);
    const at = effective && parseLocalDateTime(effective[1], ZONE);
    if (!at || at > now.toISOString()) return unconfirmed("Read Cedar County's effective time in the burn-ban banner.");
    if (heading.text === "No Burn Ban in Effect" && /^there is no burn ban in place for Cedar County$/i.test(effective[2])) {
      return noOrder(`Cedar County Emergency Management shows the countywide ban lifted. ${localRules}`);
    }
    if (heading.text === "Burn Ban in Effect" && /^(?:there is a burn ban in place for|open burning is prohibited throughout) (?:all of )?Cedar County$/i.test(effective[2])) {
      return {
        status: "ban", label: "Countywide burn ban in effect", since: localClock(new Date(at), ZONE).date,
        note: "Cedar County Emergency Management reports a countywide open-burning ban. See the county banner for exceptions.",
      };
    }
    return unconfirmed("Check Cedar County Emergency Management's burn-ban banner for current scope and conditions.");
  },
});

export const pottawattamie = countyBulletin({
  id: "ia-pottawattamie-ema", county: "Pottawattamie County", fips: "19155", stack: "Neapolitan Labs / HTML status page",
  sourceName: "Pottawattamie County Emergency Management",
  sourceUrl: "https://www.pottcounty-ia.gov/emergency_management/fire_conditions/",
  async read(input) {
    const [title, panel, ...extra] = await extractHtmlGrid(input, {
      row: "#sectionHeader, #servicePage .serviceDetail",
      cell: "#sectionHeader h1, #servicePage .serviceDetail > .pageIntro",
    });
    if (extra.length || title?.length !== 1 || title[0].text !== "Burn Bans & Fire Conditions" || panel?.length !== 1) {
      throw new Error("Pottawattamie County: missing fire conditions panel");
    }
    const [current] = panel[0].text.split(/(?<=\.)\s+/);
    if (current === "There are currently no fire restrictions at this time.") {
      return noOrder(`The county fire conditions page reports no active county restrictions. ${localRules}`);
    }
    if (/^(?:An open burning ban is (?:currently )?in effect|Open burning is prohibited) (?:for all of|throughout) Pottawattamie County\.$/i.test(current)) {
      return {
        status: "ban", label: "Countywide burn ban in effect",
        note: "The county fire conditions page reports a ban throughout Pottawattamie County. Check the page for details.",
      };
    }
    return unconfirmed("Consult the county fire conditions page for the affected fire districts and effective dates.");
  },
});

export const decatur = countyBulletin({
  id: "ia-decatur-ema", county: "Decatur County", fips: "19053", stack: "Municipal One / HTML status page",
  sourceName: "Decatur County Emergency Management",
  sourceUrl: "https://decaturcountyia.municipalone.com/7313/emergency-management",
  async read(input, now) {
    const content = ".SecondContentSection";
    const [cells = [], ...extra] = await extractHtmlGrid(input, {
      row: content, cell: `${content} > .container > h2, ${content} > .container > p`,
    });
    const headings = cells.flatMap(({ text }, i) => /^\**CURRENT BURN BAN INFORMATION$/i.test(text) ? [i] : []);
    if (extra.length || headings.length !== 1) throw new Error("Decatur County: missing current burn-ban section");
    const text = cells[headings[0] + 1]?.text ?? "";
    const dates = /^CLICK HERE\s*to view proclamation\s+REQUESTED:\s*(.+?)\s+LIFTED:\s*(.+)$/i.exec(text);
    const requested = dates && parseLocalDateTime(dates[1], ZONE);
    const lifted = dates && parseLocalDateTime(dates[2], ZONE);
    if (requested && lifted && requested < lifted && lifted <= now.toISOString()) {
      return noOrder(`The county's current burn-ban panel gives a lift date after the request. ${localRules}`);
    }
    const issue = /^CLICK HERE\s*to view proclamation\s+(?:EFFECTIVE|IN EFFECT):\s*(.+?)\s+(?:FOR )?ALL OF DECATUR COUNTY\.?$/i.exec(text);
    const at = issue && parseLocalDateTime(issue[1], ZONE);
    if (at && at <= now.toISOString()) return {
      status: "ban", label: "Countywide burn ban in effect", since: localClock(new Date(at), ZONE).date,
      note: "The county lists an effective ban for all of Decatur County. Follow its proclamation link for the exact terms.",
    };
    return unconfirmed("Check the proclamation linked by Decatur County Emergency Management.");
  },
});

const millsAlertCenter = "https://www.millscountyiowa.gov/AlertCenter.aspx";

export const mills = countyBulletin({
  id: "ia-mills-ema", county: "Mills County", fips: "19129", stack: "CivicPlus / Alert Center",
  sourceName: "Mills County Emergency Management",
  sourceUrl: millsAlertCenter,
  async read(input, now) {
    const alerts = await civicPlusActiveAlerts(input, millsAlertCenter);
    const notices = alerts.filter(({ title }) => /\bburn(?:ing)?\s+ban\b/i.test(title));
    const unknown = unconfirmed("Check the Mills County Alert Center for the county's latest order or lift.");
    if (notices.length !== 1) return unknown;
    const { title, text, url, published } = notices[0];
    const posted = published && parseLocalDateTime(published, ZONE);
    if (!posted || posted > now.toISOString()) return unknown;
    const heading = title.replace(/^\*+|\*+$/g, "").trim();
    const lift = /^Mills County has lifted the Open Burning Ban effective (.+?)\.?$/i.exec(text);
    const lifted = lift && parseUsDate(lift[1]);
    if (heading === "Burn Ban Lifted" && lifted && lifted <= localClock(new Date(posted), ZONE).date) {
      return { ...noOrder(`The active county alert reports a countywide lift. ${localRules}`), officialUrl: url, sourceUpdated: posted };
    }
    const issue = /^(?:An )?open burning ban is in effect for all of Mills County effective (.+?)\.?$/i.exec(text);
    const at = issue && parseLocalDateTime(issue[1], ZONE);
    if (/^(?:Open )?Burn(?:ing)? Ban(?: In Effect)?$/i.test(heading) && at && at <= now.toISOString()) {
      return {
        status: "ban", label: "Countywide burn ban in effect", since: localClock(new Date(at), ZONE).date,
        note: "The active county alert reports a ban for all of Mills County. Check the alert for exceptions.",
        officialUrl: url, sourceUpdated: posted,
      };
    }
    return unknown;
  },
});

export const iaCountyBulletins = [cedar, decatur, mills, pottawattamie];
