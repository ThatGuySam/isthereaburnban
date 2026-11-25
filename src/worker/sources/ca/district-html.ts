import type { DailyDecision } from "../lib/daily-status";
import { parseUsDate, parseWeekdayDate, shiftDay } from "../lib/dates";
import { blockAfterHeading, cleanText, extractHtml, htmlStatusBlocks, statusTableRows, type Table } from "../lib/html";
import { californiaDailySource } from "./daily";

type DailyBase = Pick<DailyDecision, "date" | "county" | "scopeNote">;

const allowed = (base: DailyBase): DailyDecision => ({ ...base, status: "allowed" });
const pending = (base: DailyBase): DailyDecision => ({ ...base, status: "pending" });
const noBurn = (base: DailyBase, label: string, note: string): DailyDecision => ({ ...base, status: "ban", label, note });
const limited = (base: DailyBase, label: string, note: string): DailyDecision => ({ ...base, status: "restricted", label, note });

function oneTable(tables: readonly Table[], match: (table: Table) => boolean, name: string) {
  const [table, ...extra] = tables.filter(match);
  if (!table || extra.length) throw new Error(`${name}: missing or duplicate status table`);
  return table;
}

const elDoradoPage = "https://www.eldoradocounty.ca.gov/Services/Burn-Day";
const elDoradoAreas = new Map([
  ["WEST SLOPE EL DORADO COUNTY", "West Slope of El Dorado County, outdoor vegetation burning"],
  ["SOUTH LAKE TAHOE BASIN (EL DORADO COUNTY PORTION)", "El Dorado County portion of the South Lake Tahoe Basin, outdoor vegetation burning"],
]);

export const elDoradoBurnDay = californiaDailySource({
  publisher: {
    id: "ca-el-dorado-burn-day", stack: "Granicus OpenCities / HTML table",
    sourceName: "El Dorado County Air Quality Management District", sourceUrl: elDoradoPage, officialUrl: elDoradoPage,
  },
  counties: ["El Dorado"], hours: [0, 9, 15, 18],
  async read(input) {
    const { tables } = await extractHtml(input);
    const decisions = tables.filter(({ heading, rows }) => heading === "El Dorado County Outdoor Burn Day Status" && rows.length > 0);
    return decisions.flatMap(({ rows: [header, ...areas] }) => {
      const date = header.length === 1 ? parseWeekdayDate(header[0]) : null;
      if (!date || areas.length !== elDoradoAreas.size) throw new Error("El Dorado: missing date or incomplete status areas");
      return areas.map(([area, code, ...extra]) => {
        const scopeNote = elDoradoAreas.get(area);
        if (!scopeNote || extra.length) throw new Error("El Dorado: unexpected status area");
        const base = { date, county: "El Dorado", scopeNote };
        if (code === "BURN DAY") return allowed(base);
        if (code === "NO BURN DAY" || code === "NO-BURN DAY") {
          return noBurn(base, "Outdoor vegetation no-burn day", "The district's decision applies to outdoor burning. Check any separate fire agency orders and permit requirements.");
        }
        if (code === "PENDING") return pending(base);
        throw new Error("El Dorado: unrecognized burn decision");
      });
    });
  },
});

const yoloPage = "https://www.ysaqmd.org/";
const yoloCounties = ["Yolo", "Solano"];

export const yoloSolanoBurnDay = californiaDailySource({
  publisher: {
    id: "ca-yolo-solano-burn-day", stack: "WordPress / HTML widget",
    sourceName: "Yolo-Solano Air Quality Management District", sourceUrl: yoloPage, officialUrl: yoloPage,
  },
  counties: yoloCounties, hours: [0, 9, 12, 16, 19],
  async read(input) {
    const blocks = await htmlStatusBlocks(input, ".burn_widget", "h5, .dropdown-item, p");
    const [currentDate, current, marker, nextDate] = blocks;
    if (blocks.length !== 5 || marker !== "Tentative Burn Day Status") throw new Error("Yolo-Solano: changed burn widget");
    const date = parseUsDate(currentDate);
    if (!date || parseUsDate(nextDate) !== shiftDay(date, 1)) throw new Error("Yolo-Solano: invalid burn widget dates");
    // The publisher marks the next-day outlook tentative.
    return yoloCounties.map((county) => {
      const scopeNote = county === "Yolo" ? "Open burning covered by the Yolo-Solano air district in Yolo County"
        : "Open burning in the northeastern Solano County portion of the Yolo-Solano air district";
      const base = { date, county, scopeNote };
      if (current === "BURN DAY") return allowed(base);
      if (current === "PENDING") return pending(base);
      if (current === "NO BURN DAY") return noBurn(base, "Air district no-burn day", "The district lists a no-burn day for regulated open burning. Check the district's boundaries and conditions for your activity.");
      if (current === "MARGINAL BURN DAY") return limited(base, "Marginal air district burn day", "Contact the district for approval and burn limits.");
      throw new Error("Yolo-Solano: unrecognized burn decision");
    });
  },
});

const imperialPage = "https://apcd.imperialcounty.org/";

export const imperialBurnDay = californiaDailySource({
  publisher: {
    id: "ca-imperial-burn-day", stack: "WordPress / Brizy HTML",
    sourceName: "Imperial County Air Pollution Control District", sourceUrl: imperialPage, officialUrl: imperialPage,
  },
  counties: ["Imperial"], hours: [0, 9, 14, 18],
  async read(input) {
    const { blocks } = await extractHtml(input);
    const markers = blocks.filter(({ text }) => text === "Burn Day Status:");
    const index = blocks.indexOf(markers[0]);
    const [decision, stamp] = blocks.slice(index + 1, index + 3).map(({ text }) => text);
    const date = stamp && parseUsDate(stamp);
    if (markers.length !== 1 || !date) throw new Error("Imperial: missing dated status block");
    const base = { date, county: "Imperial", scopeNote: "Agricultural burning regulated by the Imperial County air district" };
    if (decision === "Today is a No Burn Day") return [noBurn(base, "Agricultural no-burn day", "The Imperial County air district lists a no-burn day in its agricultural burning widget.")];
    if (decision === "Today is a Burn Day" || decision === "Today is a Permissive Burn Day") {
      return [limited(base, "Agricultural burning requires district authorization", "The district lists a burn day and requires prior authorization. Call the district to confirm burn hours and permit conditions.")];
    }
    throw new Error("Imperial: unrecognized burn decision");
  },
});

const colusaPage = "https://countyofcolusaca.gov/461/Air-Pollution-Control-District";

function colusaDates(stamp: string) {
  const day = parseUsDate(stamp);
  if (day) return [day];
  const range = /^([A-Za-z]+) (\d{1,2})\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?, (\d{4})$/.exec(stamp);
  if (!range) throw new Error("Colusa: missing burn dates");
  const [, month, first, last, year] = range;
  const start = parseUsDate(`${month} ${first}, ${year}`);
  const end = parseUsDate(`${month} ${last}, ${year}`);
  const days = Number(last) - Number(first);
  if (!start || !end || days < 1 || days > 6) throw new Error("Colusa: invalid burn date range");
  return Array.from({ length: days + 1 }, (_, offset) => shiftDay(start, offset));
}

export const colusaBurnDay = californiaDailySource({
  publisher: {
    id: "ca-colusa-burn-day", stack: "CivicPlus / HTML",
    sourceName: "Colusa County Air Pollution Control District", sourceUrl: colusaPage, officialUrl: colusaPage,
  },
  counties: ["Colusa"], hours: [0, 9, 13, 17],
  async read(input) {
    const { blocks } = await extractHtml(input);
    const headings = blocks.filter(({ tag }) => tag === "h2");
    const index = headings.findIndex(({ text }) => text === "Burn Day Status");
    if (index === -1 || headings.findLastIndex(({ text }) => text === "Burn Day Status") !== index) {
      throw new Error("Colusa: missing or duplicate burn status heading");
    }
    const [stamp, decision] = headings.slice(index + 1, index + 3).map(({ text }) => text);
    if (!stamp || !decision) throw new Error("Colusa: incomplete burn status block");
    return colusaDates(stamp).map((date) => {
      const base = { date, county: "Colusa", scopeNote: "Open burning covered by the Colusa County air district" };
      if (decision === "BURN DAY" || decision === "PERMISSIVE BURN DAY") return allowed(base);
      if (decision === "NO BURN DAY") return noBurn(base, "Air district no-burn day", "The county air district lists a no-burn day. Call its burn line for applicable exceptions and current limits.");
      throw new Error("Colusa: unrecognized burn decision");
    });
  },
});

const venturaPage = "https://www.vcapcd.org/Forecast.aspx";
const venturaPeriods = ["Early Morning (7 am - 10 am)", "Late Morning (10 am - noon)", "Afternoon (noon - 4 pm)"];
const venturaRegions = new Set(["1", "2", "3", "4", "5", "6 < 3k ft", "6 > 3k ft"]);
const venturaHeading = "Agricultural Burn Status for ";

export const venturaAgriculturalBurn = californiaDailySource({
  publisher: {
    id: "ca-ventura-ag-burn-day", stack: "WordPress / HTML table",
    sourceName: "Ventura County Air Pollution Control District", sourceUrl: venturaPage, officialUrl: venturaPage,
  },
  counties: ["Ventura"], hours: [0, 8, 12, 17],
  async read(input) {
    const parts = await extractHtml(input);
    const table = oneTable(parts.tables, ({ id }) => id === "table-forecast-burn-3", "Ventura");
    const date = table.heading.startsWith(venturaHeading) ? parseWeekdayDate(table.heading.slice(venturaHeading.length)) : null;
    const rows = statusTableRows(parts, { id: "table-forecast-burn-3", heading: table.heading, columns: ["Burn Region", ...venturaPeriods] });
    if (!date || rows.length !== venturaRegions.size) throw new Error("Ventura: missing date or incomplete burn regions");
    return rows.map(([region, ...codes]) => {
      if (!venturaRegions.has(region) || codes.some((code) => code !== "Yes" && code !== "No")) {
        throw new Error("Ventura: unknown burn region or code");
      }
      const base = { date, county: "Ventura", scopeNote: `Ventura air district burn region ${region}, agricultural burning` };
      if (codes.every((code) => code === "No")) return noBurn(base, "Agricultural no-burn day", "The district lists no agricultural burning in this region during any of its published burn windows.");
      const permitHours = venturaPeriods.filter((_, index) => codes[index] === "Yes").join(", ");
      return limited(base, "Agricultural burning limited to approved hours", `The district lists: ${permitHours}. Confirm authorization and permit requirements before burning.`);
    });
  },
});

const featherPage = "https://www.fraqmdca.gov/burn-day-status";
const featherZones = [
  ["1", "2", "3", "4", "5", "6", "7 - SB"],
  ["1", "2", "3", "4 - SRA"],
];
const featherHeader = ["County", "Zone", "District Permits", "Permit Hours*", "", "Residential", "Residential Hours"];

export const featherRiverBurnDay = californiaDailySource({
  publisher: {
    id: "ca-feather-river-burn-day", stack: "Streamline / HTML table",
    sourceName: "Feather River Air Quality Management District", sourceUrl: featherPage, officialUrl: featherPage,
  },
  counties: ["Sutter", "Yuba"], hours: [0, 10, 14, 18],
  async read(input) {
    const { tables } = await extractHtml(input);
    const { heading, rows: [, ...zones] } = oneTable(tables, ({ rows: [header] }) =>
      header?.length === featherHeader.length && header.every((cell, i) => cell === featherHeader[i]), "Feather River");
    const date = parseWeekdayDate(heading);
    const [sutter, yuba] = featherZones;
    if (!date || zones.length !== sutter.length + yuba.length) throw new Error("Feather River: missing date or incomplete zones");
    return zones.flatMap(([name, zone, permit, permitHours, spacer, residential, residentialHours, ...extra], index) => {
      const county = index < sutter.length ? "Sutter" : "Yuba";
      const groupIndex = county === "Sutter" ? index : index - sutter.length;
      const expected = county === "Sutter" ? sutter : yuba;
      if (name !== (groupIndex === 0 ? county : "") || zone !== expected[groupIndex] || spacer || extra.length) {
        throw new Error("Feather River: changed burn zones");
      }
      return [
        { type: "open burning under district permit", code: permit, hours: permitHours },
        { type: "residential open burning", code: residential, hours: residentialHours },
      ].map(({ type, code, hours }) => {
        const base = { date, county, scopeNote: `Feather River air district zone ${zone} in ${county} County, ${type}` };
        if (code === "NO") return noBurn(base, "Air district no-burn day", "The district lists no burning for this zone and activity.");
        if (code !== "YES" || !hours || !/\d+(?::\d{2})?\s*[AP]M\s*(?:to|[-–])\s*/i.test(hours)) {
          throw new Error("Feather River: unrecognized decision or burn hours");
        }
        return limited(base, "Open burning limited to approved hours", `The district lists ${cleanText(hours)} for this activity. Confirm any fire agency permit and notification requirements.`);
      });
    });
  },
});

const buttePage = "https://www.bcaqmd.org/open-burning";

export const butteBurnDay = californiaDailySource({
  publisher: {
    id: "ca-butte-burn-day", stack: "Streamline / HTML table",
    sourceName: "Butte County Air Quality Management District", sourceUrl: buttePage, officialUrl: buttePage,
  },
  counties: ["Butte"], hours: [0, 9, 14, 18],
  async read(input) {
    const { tables } = await extractHtml(input);
    const { rows } = oneTable(tables, ({ heading, rows }) => heading === "Burn Day Status:" && rows.length > 0, "Butte");
    if (rows.length !== 3 && rows.length !== 6) throw new Error("Butte: incomplete decision table");
    const decisions: DailyDecision[] = [];
    for (let i = 0; i < rows.length; i += 3) {
      const [header, residential, agricultural] = rows.slice(i, i + 3);
      const stamp = /^([A-Za-z]+) \(([^()]+)\)$/.exec(header[1] ?? "");
      const date = stamp && parseWeekdayDate(`${stamp[1]}, ${stamp[2]}`);
      if (!date || header[0] !== "" || header.length !== 2 ||
          residential[0] !== "Residential Burning" || agricultural[0] !== "Agricultural Burning" ||
          residential.length !== 2 || agricultural.length !== 2) {
        throw new Error("Butte: changed date or activity headings");
      }
      for (const [activity, decision] of [residential, agricultural]) {
        const base = { date, county: "Butte", scopeNote: `${activity} regulated by the Butte County air district` };
        if (/^No forecast\b/i.test(decision)) decisions.push(pending(base));
        else if (/^(?:Residential |Agricultural )?No[- ]Burn Day\b/i.test(decision)) {
          decisions.push(noBurn(base, `${activity} no-burn day`, decision));
        } else if (/^Permissive burn day where burning is allowed\./i.test(decision) && /burn hours are\b/i.test(decision)) {
          decisions.push(limited(base, "Residential burning limited to approved hours", decision));
        } else if (/^Agricultural burn day with valid district permit\b/i.test(decision)) {
          decisions.push(limited(base, "Agricultural burning requires a district permit", decision));
        } else throw new Error("Butte: unrecognized daily decision");
      }
    }
    return decisions;
  },
});

const tehamaPage = "https://www.tehcoapcd.net/todays-burn-day-decision/";

export const tehamaBurnDay = californiaDailySource({
  publisher: {
    id: "ca-tehama-burn-day", stack: "WordPress / HTML notice",
    sourceName: "Tehama County Air Pollution Control District", sourceUrl: tehamaPage, officialUrl: tehamaPage,
  },
  counties: ["Tehama"], hours: [0, 9, 14],
  async read(input) {
    const { blocks } = await extractHtml(input);
    const decisionHeading = /^Burn Decision for \(([^()]+)\):$/;
    const [heading, ...extra] = blocks.filter(({ tag, text }) => tag === "h2" && decisionHeading.test(text));
    const stamp = heading && decisionHeading.exec(heading.text)?.[1];
    const date = stamp && parseUsDate(stamp);
    if (!date || extra.length) throw new Error("Tehama: missing unique dated burn decision");
    const section = blockAfterHeading(blocks, heading.text, { requireUnique: true, headingTag: "h2" });
    const decisionFor = (name: string) => {
      const paragraphs = blockAfterHeading(section, `${name}:`, { requireUnique: true, headingTag: "h3" });
      if (paragraphs.length < 1 || paragraphs[0].tag !== "p") throw new Error(`Tehama: missing ${name} decision`);
      return paragraphs;
    };
    const agricultural = decisionFor("Agricultural Burning");
    const residential = decisionFor("Residential Burning");
    const farm = { date, county: "Tehama", scopeNote: "Agricultural burning covered by the Tehama County air district" };
    const homes = { date, county: "Tehama", scopeNote: "Residential open burning in Tehama County outside Red Bluff" };
    const farmText = agricultural[0].text;
    const homesText = residential[0].text;
    const farmHours = agricultural.find(({ text }) => text.startsWith("Burn hours for "));
    const homesHours = residential.find(({ text }) => text.startsWith("Burn hours are "));
    const farmDecision = /\b(?:no[- ]burn day for agricultural burning|no (?:agricultural burning|agricultural burn day))\b/i.test(farmText)
      ? noBurn(farm, "Agricultural no-burn day", farmText)
      : /\bprunings?['’]?(?:s)? only agricultural burn day\b/i.test(farmText)
        ? limited(farm, "Agricultural burning limited to prunings", [farmText, farmHours?.text].filter(Boolean).join(" "))
        : /\bpermissive agricultural burn day\b/i.test(farmText)
          ? allowed(farm) : undefined;
    const homesDecision = /\b(?:no[- ]burn day for residential burning|no residential burn(?:ing| day))\b/i.test(homesText)
      ? noBurn(homes, "Residential no-burn day", homesText)
      : /\bpermissive residential burn day in all other areas of Tehama County\b/i.test(homesText) && homesHours
        ? limited(homes, "Residential burning limited to approved hours", homesHours.text) : undefined;
    if (!farmDecision || !homesDecision) throw new Error("Tehama: unrecognized daily decision");
    return [farmDecision, homesDecision];
  },
});
