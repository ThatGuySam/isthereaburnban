import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { extractHtml, type HtmlParts } from "../lib/html";
import { pacedSourceReader } from "../lib/http";
import { manualPdf } from "../lib/pdf";
import type { ActiveSource } from "../types";

const RULES = [CALENDAR_RULES.MO_ST_LOUIS_YARD_WASTE_CLOSED, CALENDAR_RULES.MO_ST_LOUIS_YARD_WASTE_LIMITED];
const META = {
  id: "mo-st-louis-metro-yard-waste", state: "MO", scope: "part", stack: "Drupal / regulation PDF + calendar",
  sourceName: "U.S. EPA (Missouri State Implementation Plan)",
  sourceUrl: "https://www.epa.gov/air-quality-implementation-plans/missouri-sip-chapter-6-air-quality-standards-definitions-sampling",
  officialUrl: RULES[0].officialUrl,
} as const;
const DOCUMENTS = [
  {
    rule: "10 CSR 10-6.045",
    url: META.officialUrl,
    sha256: "425e3d6bb607325650e6fb329c84a5f93309ae8169ac46a30b48565c2870886f",
  },
  {
    rule: "10 CSR 10-6.020",
    url: "https://www.epa.gov/system/files/documents/2025-11/10-csr-10-6.020-definitions-and-common-reference-tables.pdf",
    sha256: "007e7be29f72ca5cbcc75aad1967fcaa2129b5b9b7575cce703aa768cd35aa10",
  },
];
// 10 CSR 10-6.020(2)(S)23 includes the independent City of St. Louis.
const METRO_FIPS = new Set(["29071", "29099", "29183", "29189", "29510"]);
const COUNTIES = countiesInState(META.state).filter(({ fips }) => METRO_FIPS.has(fips));

export async function parseMoYardWaste(
  parts: HtmlParts,
  now: Date,
  readPdf: (url: string) => Promise<Response>,
): Promise<CountyStatus[]> {
  const approvals = parts.tables.find(({ rows }) => rows.some(([rule, title, sip]) =>
    rule === "Rule" && title === "Title" && sip === "SIP"));
  for (const { rule, url } of DOCUMENTS) {
    const approved = approvals?.rows.some(([number, , sip]) => number === rule && sip === "X");
    const published = parts.links.some(({ href, text }) => href === url && text.startsWith(rule + " "));
    if (!approved || !published) throw new Error(`Missouri SIP: ${rule} listing changed and needs review`);
  }
  for (const { rule, url, sha256 } of DOCUMENTS) {
    if ((await manualPdf(await readPdf(url))).sha256 !== sha256) {
      throw new Error(`Missouri SIP: ${rule} PDF changed and needs review`);
    }
  }
  return RULES.flatMap((rule) => calendarStatusRows(rule, COUNTIES, META, now));
}

export const moYardWaste: ActiveSource = {
  ...META, recurring: true, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Central, hours: [0] },
  async fetch({ now }) {
    const read = pacedSourceReader({ headers: { accept: "text/html, application/pdf" } });
    const readResponse = async (url: string) => {
      const reply = await read(url);
      if (reply.notModified) throw new Error("Unexpected Missouri SIP 304");
      return reply.response;
    };
    const parts = await extractHtml(await readResponse(META.sourceUrl), { links: true });
    return { rows: await parseMoYardWaste(parts, now, readResponse) };
  },
};
