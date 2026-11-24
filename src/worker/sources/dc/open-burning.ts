import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { extractHtmlGrid } from "../lib/html";
import { pacedSourceReader } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.DC;
const COUNTIES = countiesInState(RULE.state);
const CHAPTER = "https://dcregs.dc.gov/Common/DCMR/RuleList.aspx?ChapterNum=20-6";
const DOWNLOAD = "https://dcregs.dc.gov/Common/DCMR/RuleList.aspx?DownloadFile=00C7545F-0000-C7AF-B33F-1DE74AD122DF";
const REVIEWED_DOCUMENT = "a8aff5ec16cb53e974c4af75ffebd26a2aaaa47fd122468155f539027e251585";
const META = {
  id: "dc-open-burning-rule", state: RULE.state, scope: RULE.scope,
  stack: "DCRegs ASP.NET WebForms / HTML, Word and calendar",
  sourceName: "DC Department of Energy and Environment (20 DCMR § 604)",
  sourceUrl: CHAPTER, officialUrl: RULE.officialUrl,
};
const GRID = {
  row: "#ruleTable tr",
  cell: "#ruleTable th, #ruleTable td:not(:nth-child(4)), #ruleTable td:nth-child(4) a",
  linkAttribute: "title",
};
const COLUMNS = ["", "Section Number", "Section Heading", "Latest Version", "Effective Date"];

export async function parseDcOpenBurning(
  input: Response | string, now: Date, readDocument: (url: string) => Promise<Response>,
) {
  const [header, ...rows] = await extractHtmlGrid(input, GRID);
  const [rule, ...duplicates] = rows.filter((row) => row[1]?.text === "20-604");
  // DCRegs uses 1/1/1900 for this legacy entry. It is not the rule's effective date.
  if (header?.length !== COLUMNS.length || COLUMNS.some((column, i) => header[i].text !== column) ||
      duplicates.length || rule?.length !== COLUMNS.length || rule[2].text !== "OPEN BURNING" ||
      rule[3].text !== "View text" || rule[3].href !== DOWNLOAD || rule[4].text !== "1/1/1900") {
    throw new Error("DCRegs: current § 604 listing changed or is missing. Review the latest rule.");
  }
  const document = await readDocument(DOWNLOAD);
  if (await sha256(await document.arrayBuffer()) !== REVIEWED_DOCUMENT) {
    throw new Error("DCRegs: reviewed § 604 document changed. Review the rule's scope and terms.");
  }
  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const dcOpenBurning: ActiveSource = {
  ...META, recurring: true, pinnedRows, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [9] },
  async fetch({ now }) {
    const read = pacedSourceReader({ maxBytes: 96_000, maxResponseAgeMs: 24 * 3_600_000 });
    const page = await read(CHAPTER);
    if (page.notModified) throw new Error("Unexpected DCRegs listing 304");
    return { rows: await parseDcOpenBurning(page.response, now, async (url) => {
      const document = await read(url);
      if (document.notModified) throw new Error("Unexpected DCRegs document 304");
      return document.response;
    }) };
  },
};
