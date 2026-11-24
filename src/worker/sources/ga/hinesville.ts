import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { civicPlusFormInstructions } from "../lib/civicplus";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { pacedSourceReader } from "../lib/http";
import type { ActiveSource } from "../types";

const ORIGIN = "https://www.cityofhinesville.org";
const PAGE = ORIGIN + "/123/Burn-Permits";
const ZONE = US_ZONES.Eastern;
const META = {
  id: "ga-hinesville-permit-status", state: "GA", scope: "part",
  sourceName: "Hinesville Fire Department", officialUrl: PAGE, sourceUrl: PAGE,
  stack: "CivicPlus / Form Center",
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "sourceName" | "officialUrl" | "sourceUrl" | "stack">;

export async function hinesvilleFormLink(input: Response | string): Promise<string> {
  const [page, ...extra] = await extractHtmlGrid(input, {
    row: "#moduleContent #page",
    cell: "#moduleContent #page #versionHeadLine, #moduleContent #page .pageContent a[href*='FormCenter/']",
  });
  const [heading, ...links] = page ?? [];
  const targets = links.filter(({ text }) => text === "Residential Burn Permit Form");
  const link = targets.length === 1 && targets[0].href ? new URL(targets[0].href, PAGE) : null;
  if (extra.length || heading?.text !== "Burn Permits" || !link || link.origin !== ORIGIN ||
      !/^\/FormCenter\/Fire-Department-3\/[a-z\d-]+$/i.test(link.pathname)) {
    throw new Error("Hinesville: expected one current Fire Department residential permit form link");
  }
  return link.href;
}

export async function parseHinesvilleClosure(input: Response | string, now: Date, formUrl = PAGE): Promise<CountyStatus[]> {
  const { title, instructions } = await civicPlusFormInstructions(input);
  if (title === "Residential Burn Permit" && instructions.some((text) => /\bapply for a (?:residential )?burn permit\b/i.test(text))) return [];
  if (title !== "Not Issuing Burn Permits" || !instructions.some((text) =>
    text.startsWith("We are not issuing burn permits at this time. This only applies to citizens that reside in the city limits Hinesville."))) {
    throw new Error("Hinesville: unrecognized residential permit form status");
  }
  const county = countyByName("GA", "Liberty");
  if (!county) throw new Error("Missing Liberty County");
  const { date } = localClock(now, ZONE);
  const { id: sourceId, state, scope, sourceName, officialUrl } = META;
  return [{
    ...localDayWindow(date, ZONE), fips: county.fips, county: county.name,
    sourceId, state, scope, sourceName, officialUrl, sourceUrl: formUrl,
    status: "restricted", scopeNote: "Residential yard-debris burning within the City of Hinesville",
    label: "Hinesville residential burn permits suspended",
    note: "The Hinesville Fire Department's public permit form says it is withholding permits. Call the Fire Marshal at 912-876-4143 for current availability.",
    checked: now.toISOString(), sourceUpdated: null, since: null, expires: null,
  }];
}

export const gaHinesvilleClosure: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", staleMs: 12 * 3_600_000,
  cadence: { kind: "daily", zone: ZONE, hours: [8, 12, 16] },
  async fetch({ now }) {
    const read = pacedSourceReader({ headers: { accept: "text/html" }, maxBytes: 400_000 });
    const page = await read(PAGE);
    if (page.notModified) throw new Error("Unexpected Hinesville permit page 304");
    const link = await hinesvilleFormLink(page.response);
    const form = await read(link);
    if (form.notModified) throw new Error("Unexpected Hinesville permit form 304");
    return { rows: await parseHinesvilleClosure(form.response, now, link) };
  },
};
