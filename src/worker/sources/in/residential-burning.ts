import { COUNTY_BY_FIPS } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.in.gov/idem/openburning/exempt-burning-activities-and-required-conditions";
const META = {
  id: "in-idem-residential-burning", state: "IN", scope: "county", stack: "IDEM guidance / HTML",
  sourceName: "Indiana Department of Environmental Management", sourceUrl: URL, officialUrl: URL,
} as const;
const COUNTIES = ["18019", "18043", "18089", "18127"];

export async function parseIdemResidentialBurning(input: Response | string, now: Date) {
  const { blocks } = await extractHtml(input);
  const rule = blocks.some(({ text }) => text === "In Clark, Floyd, Lake, or Porter counties due to federal requirements for controlling ground-level ozone pollution.");
  const scope = blocks.some(({ text }) => text.startsWith("Residential open burning is the burning of leaves, brush, paper, and other clean wood waste"));
  if (!rule || !scope) throw new Error("IDEM residential burning guidance changed");

  return COUNTIES.map((fips) => ({
    ...META, fips, county: COUNTY_BY_FIPS.get(fips)!.name, standing: true as const, status: "restricted" as const,
    scopeNote: "Residential waste burning at private residences",
    label: "Residential open burning prohibited",
    note: "The rule covers burning leaves, brush, paper and other clean wood waste at a private residence. Recreational and ceremonial fires have separate requirements.",
    checked: now.toISOString(), since: null, expires: null, sourceUpdated: null,
  }));
}

export const inIdemResidentialBurning: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", recurring: true,
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [9] },
  async fetch({ now, validators }) {
    const reply = await fetchSource(URL, { validators, headers: { accept: "text/html" }, maxBytes: 250_000 });
    if (reply.notModified) return reply;
    return { rows: await parseIdemResidentialBurning(reply.response, now), validators: reply.validators };
  },
};
