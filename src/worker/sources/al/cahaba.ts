import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";
import { CAHABA_BURNING_URL } from "./air-rules";

const ZONE = US_ZONES.Central;
const COUNTIES = countiesInState("AL").filter(({ fips }) => fips === "01073" || fips === "01117");
const SCOPE = "Cahaba Valley Fire District portions of Jefferson and Shelby counties";
const META = {
  id: "al-cahaba-valley-burning", state: "AL", scope: "part",
  stack: "ASP.NET / server-rendered HTML status",
  sourceName: "Cahaba Valley Fire District", sourceUrl: CAHABA_BURNING_URL, officialUrl: CAHABA_BURNING_URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
const COVERAGE_TEXT = "The information on this page only applies to those areas in Jefferson and Shelby County serviced by the Cahaba Valley Fire District.";
const JEFFERSON_APPROVAL = "**A permit will not be issued to an address in Jefferson County unless the applicant provides an approved permit from the Jefferson County Health Department at the time of application.**";

export async function parseCahabaBurning(input: Response | string, now: Date, responseDate: string | null): Promise<CountyStatus[]> {
  const fetchedAt = Date.parse(responseDate ?? "");
  const { date: today } = localClock(now, ZONE);
  if (!Number.isFinite(fetchedAt) || localClock(new Date(fetchedAt), ZONE).date !== today) {
    throw new Error("Cahaba Valley Fire District: today's status requires a same-day HTTP response");
  }
  const [section, ...duplicates] = await extractHtmlGrid(input, {
    row: "div.page-body",
    cell: "section.burn-status, .content > p",
  });
  const [banner, ...paragraphs] = section ?? [];
  const codes = banner?.className.split(/\s+/).filter((name) => name.startsWith("burn-") && name !== "burn-status") ?? [];
  if (duplicates.length || paragraphs.some(({ className }) => className.split(/\s+/).includes("burn-status")) ||
    paragraphs.filter(({ text }) => text.endsWith(COVERAGE_TEXT)).length !== 1 || !banner?.text.startsWith("Can I burn today? ")) {
    throw new Error("Cahaba Valley Fire District: status or district boundaries changed");
  }

  const permitted = codes[0] === "burn-allowed" && banner.text.startsWith("Can I burn today? Open burning is allowed with a permit.") &&
    paragraphs.some(({ text }) => text === JEFFERSON_APPROVAL);
  const prohibited = codes[0] === "burn-banned" &&
    /^Can I burn today\? Open burning is (?:prohibited|banned|not allowed)\b/i.test(banner.text);
  if (codes.length !== 1 || (!permitted && !prohibited)) throw new Error("Cahaba Valley Fire District: unrecognized burn status or permit terms");

  const checked = now.toISOString();
  const { validUntil } = localDayWindow(today, ZONE);
  return COUNTIES.map(({ fips, name }) => ({
    validUntil, fips, county: name, scope: META.scope, scopeNote: SCOPE, state: META.state,
    status: prohibited ? "ban" : "restricted",
    label: prohibited ? "Cahaba Valley open burning prohibited" : "Cahaba Valley open-burning permit required",
    note: (prohibited ? "The district’s status page prohibits open burning today." :
      "The district requires an approved permit for covered open burning. Addresses in Jefferson County also need county health department approval for a district permit.") +
      " Ask the district about exceptions and your address.",
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    checked, sourceUpdated: null, since: null, expires: null,
  }));
}

export const alCahabaBurning: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  // The banner can reflect the district's recurring brush-burning season.
  recurring: true,
  cadence: { kind: "daily", zone: ZONE, hours: [0, 7, 12, 17] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 150_000, maxResponseAgeMs: 2 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Cahaba Valley Fire District: unexpected HTTP 304");
    return { rows: await parseCahabaBurning(reply.response, now, reply.response.headers.get("date")) };
  },
};
