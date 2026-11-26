import { countyStatusBulletin, namedStatusRows, scopedStatusBulletin } from "../lib/county-bulletin";
import { localClock, parseLocalDateTime, parseUsDate, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, extractHtmlGrid, htmlStatusBlocks } from "../lib/html";
import type { Cadence } from "../types";

const DAY = 24 * 3_600_000;
const pacific = { kind: "daily", zone: US_ZONES.Pacific, hours: [1, 7, 13, 19] } satisfies Cadence;
const aggregators = { cadence: pacific, staleMs: DAY, pollGroup: "wa-regional-bulletins" };
const ORCAA = "https://www.orcaa.org/burning/county-burning-restrictions/";
const SWCAA = "https://www.swcleanair.gov/burning/bycounty.asp?county=";
const YAKIMA = "https://www.yakimacleanair.org/";
const NWCAA = "https://nwcleanairwa.gov/resources/outdoor-ag-burns/burn-ban-information/";
const SPOKANE = "https://spokanecleanair.org/burning/burn-restrictions/";
const KITTITAS = "https://www.co.kittitas.wa.us/cds/firemarshal/burn-ban.aspx";

export const orcaaCounties = ["Clallam", "Grays Harbor", "Jefferson", "Mason", "Pacific", "Thurston"];
const orcaaActivities = ["Recreational fires", "Residential yard waste burns", "Land clearing burns"];
export const waOrcaaStatus = scopedStatusBulletin({
  id: "wa-orcaa-status", state: "WA", counties: orcaaCounties, stack: "WordPress / county status table",
  sourceName: "Olympic Region Clean Air Agency", sourceUrl: ORCAA, officialUrl: ORCAA,
  ...aggregators,
  async read(input, now) {
    const heading = "Current Burn Ban Status";
    const { blocks, tables } = await extractHtml(input);
    const current = blockAfterHeading(blocks, heading, { requireUnique: true });
    const updated = current.find(({ text }) => text.startsWith("Updated "))?.text.slice("Updated ".length);
    const stamp = updated && parseLocalDateTime(updated.replace(" at ", ", "), US_ZONES.Pacific);
    const matching = tables.filter((table) => table.heading === heading);
    const [header, ...rows] = matching[0]?.rows ?? [];
    const columns = ["County", ...orcaaActivities];
    if (matching.length !== 1 || !stamp || stamp > now.toISOString() ||
        header?.length !== columns.length || columns.some((column, i) => column.toLowerCase() !== header[i].toLowerCase())) {
      throw new Error("ORCAA: missing, future-dated or changed county status table");
    }
    const areas = namedStatusRows(rows, orcaaCounties, columns.length);
    return [...areas].flatMap(([county, codes]) => {
      const closed = orcaaActivities.filter((_, i) => /^(?:not allowed|prohibited|banned)$/i.test(codes[i]));
      if (codes.some((code) => !/^(?:allowed|not allowed|prohibited|banned)$/i.test(code))) {
        throw new Error(`ORCAA: unrecognized status for ${county}`);
      }
      if (!closed.length) return [];
      return [{
        county, scopeNote: `ORCAA outdoor-burning report for ${county} County`,
        status: closed.length === codes.length ? "ban" : "restricted",
        label: "Outdoor burning limits reported by ORCAA",
        note: `ORCAA lists ${closed.map((activity) => activity.toLowerCase()).join(", ")} as prohibited. Check county and land-manager exceptions.`,
        sourceUpdated: stamp,
      }];
    });
  },
});

export const swcaaCounties = ["Clark", "Cowlitz", "Lewis", "Skamania", "Wahkiakum"];
const swcaaClear = /^No Burn Ban is in Effect$/i;
const swcaaActive = /^(?:Stage [12] )?(?:Air Quality |Fire Safety )?Burn Ban (?:is )?in Effect\.?$/i;
export const waSwcaaStatuses = swcaaCounties.map((county) => countyStatusBulletin({
  id: `wa-swcaa-${county.toLowerCase()}`, state: "WA", county, stack: "Classic ASP / county status bulletin",
  sourceName: "Southwest Clean Air Agency", sourceUrl: SWCAA + county, officialUrl: SWCAA + county,
  cadence: pacific, staleMs: DAY, pollGroup: "wa-swcaa-bulletins",
  scopeNote: `Agency-reported outdoor burning in ${county} County`,
  async read(input, now) {
    const blocks = await htmlStatusBlocks(input, ".printable-content", ".printable-content > h1, .printable-content > h5, .printable-content > p.indent");
    const start = blocks.indexOf("Burn Ban Status");
    if (blocks.filter((value) => value === `${county} County Outdoor Burning Information`).length !== 1 ||
        start < 0 || start !== blocks.lastIndexOf("Burn Ban Status") || blocks[start + 3] !== "DNR Fire Danger Level") {
      throw new Error(`SWCAA: missing or changed ${county} status section`);
    }
    const decision = blocks[start + 1];
    const effective = /^Effective: (.+?)\s*[-–—]\s/.exec(blocks[start + 2])?.[1];
    const since = effective && parseUsDate(effective);
    if (!since || since > localClock(now, US_ZONES.Pacific).date) throw new Error(`SWCAA: unrecognized ${county} effective date`);
    if (swcaaClear.test(decision)) return;
    if (!swcaaActive.test(decision)) throw new Error(`SWCAA: unrecognized ${county} burn status`);
    return {
      status: "restricted", label: decision,
      note: "Southwest Clean Air Agency reports a current outdoor burning ban. Use the county bulletin and address map for the covered areas, activities and exceptions.",
      since,
    };
  },
}));

export const waYakimaAir = scopedStatusBulletin({
  id: "wa-yakima-air", state: "WA", counties: ["Yakima"], stack: "HTML / regional status panels",
  sourceName: "Yakima Regional Clean Air Agency", sourceUrl: YAKIMA, officialUrl: YAKIMA,
  ...aggregators,
  async read(input) {
    const panels = await extractHtmlGrid(input, { row: ".burnban .bxslider > li", cell: ".burnban h4, .burnban h5" });
    const areas = namedStatusRows(panels.map((panel) => panel.map(({ text }) => text)),
      ["Upper Yakima County", "Lower Yakima County"], 2);
    return [...areas].flatMap(([scopeNote, [report]]) => {
      if (/^No air pollution burn ban in effect\.?$/i.test(report)) return [];
      const stage = /^(?:Air Pollution )?(?:Stage|Level) ([12]) (?:Air Pollution )?Burn Ban(?: in effect)?\.?$/i.exec(report)?.[1];
      if (!stage) throw new Error(`Yakima Clean Air: unknown status for ${scopeNote}`);
      return [{
        county: "Yakima", scopeNote: `${scopeNote} air-quality area`, status: "ban",
        label: `Stage ${stage} air pollution burn ban`,
        note: "The air agency prohibits outdoor burning during this stage and limits wood heating. See its burn ban information for heating exemptions.",
      }];
    });
  },
});

export const waNorthwestAir = scopedStatusBulletin({
  id: "wa-northwest-air", state: "WA", counties: ["Island", "Skagit", "Whatcom"],
  stack: "WordPress / Spectra status panels", sourceName: "Northwest Clean Air Agency", sourceUrl: NWCAA, officialUrl: NWCAA,
  ...aggregators, maxBytes: 700_000,
  async read(input) {
    const panels = await extractHtmlGrid(input, {
      row: ".uagb-block-0d0e38ac .uagb-ifb-content", cell: ".uagb-ifb-title, .uagb-ifb-desc",
    });
    const areas = namedStatusRows(panels.map((panel) => panel.map(({ text }, index) => index === 0 ? text.replace(/ County$/, "") : text)),
      ["Island", "San Juan", "Skagit", "Whatcom"], 2);
    return [...areas].flatMap(([county, [report]]) => {
      if (county === "San Juan" && report === "Check with County and Fire District Officials for Permit Status.") return [];
      if (county !== "San Juan" && report === "No Burn Ban in Rural Areas") return [];
      const decision = /^Stage ([12]) (?:Air Quality )?Burn Ban(?: (?:in|for) (?:the )?(Columbia Valley)(?: Urban Growth Area)?)?\.?$/i.exec(report);
      if (!decision || county === "San Juan" || (decision[2] && county !== "Whatcom")) {
        throw new Error(`NWCAA: unknown status for ${county}`);
      }
      const [, stage, columbia] = decision;
      return [{
        county, scopeNote: columbia ? "Columbia Valley urban growth area" : `NWCAA air-quality jurisdiction in ${county} County`,
        status: "ban", label: `Stage ${stage} air quality burn ban`,
        note: "Northwest Clean Air Agency prohibits outdoor burning during this stage and limits wood heating. Check the agency bulletin for boundaries and exemptions.",
      }];
    });
  },
});

export const waSpokaneStatus = countyStatusBulletin({
  id: "wa-spokane-current-burn-restrictions", state: "WA", county: "Spokane", stack: "WordPress / current status panel",
  sourceName: "Spokane Regional Clean Air Agency", sourceUrl: SPOKANE, officialUrl: SPOKANE,
  ...aggregators, scopeNote: "Outdoor burning in the Spokane Regional Clean Air Agency jurisdiction",
  async read(input) {
    const section = ".wp-block-column.has-theme-primary-extra-light-background-color";
    const [heading, current] = await htmlStatusBlocks(input, section, `${section} > h2, ${section} > p`);
    if (heading !== "Current restrictions:") throw new Error("Spokane Clean Air: missing current restrictions heading");
    if (current === "There are currently no restrictions in place on outdoor burning or wood heating in Spokane County (incorporated and unincorporated).") return;
    if (!/^(?:Due to .{1,140}, )?(?:(?:Effective .{1,100}, )?(?:all )?outdoor burning (?:is|remains) (?:restricted|prohibited|banned)|fire danger burn restrictions (?:are )?in effect)\b/i.test(current)) {
      throw new Error("Spokane Clean Air: unrecognized current restrictions");
    }
    return {
      status: "restricted", label: "Current outdoor burning restrictions",
      note: "Spokane Clean Air reports current outdoor burning restrictions. Check its notice for the affected kinds of fires and any exceptions.",
    };
  },
});

const kittitasDistricts = [
  "Fire District 1 (Rural Thorp)", "Kittitas Valley Fire and Rescue (Fire District 2)", "Fire District 3 (Easton)",
  "Fire District 4 (Vantage)", "Fire District 51 (Snoqualmie Pass Fire & Rescue)", "Fire District 6 (Ronald)",
  "Fire District 7 (Cle Elum)", "Areas outside fire districts", "City of Cle Elum", "Town of South Cle Elum",
  "City of Roslyn", "City of Ellensburg", "City of Kittitas",
];
export const waKittitasStatus = scopedStatusBulletin({
  id: "wa-kittitas-fire-districts", state: "WA", counties: ["Kittitas"], stack: "ASP.NET WebForms / fire-district status table",
  sourceName: "Kittitas County Fire Marshal", sourceUrl: KITTITAS, officialUrl: KITTITAS,
  ...aggregators,
  async read(input) {
    const table = "#ctl00_ctl00_bodyPlaceHolder_departmentBodyPlaceholder_gvBurnBanInfo";
    const grid = await extractHtmlGrid(input, { row: `${table} tr`, cell: `${table} th, ${table} td` });
    const [header, ...rows] = grid.map((row) => row.map(({ text }) => text));
    if (header?.join("|") !== "District|Information") throw new Error("Kittitas: missing fire district status table");
    const areas = namedStatusRows(rows, kittitasDistricts, 2);
    return [...areas].flatMap(([scopeNote, [report]]) => {
      if (report === "There is no fire safety burn ban.") return [];
      if (!/^(?:There is a fire safety burn ban\.?|(?:A )?[Ff]ire safety burn ban is in effect\.?)$/.test(report)) {
        throw new Error(`Kittitas: unrecognized fire safety status for ${scopeNote}`);
      }
      return [{
        county: "Kittitas", scopeNote, status: "restricted", label: "Fire safety burn ban in effect",
        note: "The Kittitas County Fire Marshal lists a fire safety burn ban for this district or area. Check the county page for its scope and exceptions.",
      }];
    });
  },
});

export const waRegionalStatus = [
  waOrcaaStatus, ...waSwcaaStatuses, waYakimaAir, waNorthwestAir, waSpokaneStatus, waKittitasStatus,
];
