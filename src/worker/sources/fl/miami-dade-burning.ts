import { US_ZONES } from "../lib/dates";
import { extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.miamidade.gov/global/permit.page?Mduid_permit=per1518193325458214";
const META = {
  id: "fl-miami-dade-residential-burning", state: "FL", scope: "county", stack: "Miami-Dade permits / HTML",
  sourceName: "Miami-Dade County Fire Rescue", sourceUrl: URL, officialUrl: URL,
} as const;

export async function parseMiamiDadeResidentialBurning(input: Response | string, now: Date) {
  const { blocks } = await extractHtml(input);
  const rule = blocks.some(({ text }) => text ===
    "Residential property owners are prohibited from burning residential trash, garbage, construction debris, leaves, cuttings, yard trimmings, tree stumps, plastic, and pallets.");
  if (!rule) throw new Error("Miami-Dade residential burning guidance changed");

  return [{
    ...META, fips: "12086", county: "Miami-Dade County", standing: true as const, status: "restricted" as const,
    scopeNote: "Residential yard debris burning", label: "Residential yard debris burning prohibited",
    note: "The county prohibits residential burning of leaves, tree cuttings and yard trimmings. Check Fire Rescue's separate requirements for bonfires.",
    checked: now.toISOString(), since: null, expires: null, sourceUpdated: null,
  }];
}

export const flMiamiDadeResidentialBurning: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", recurring: true,
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [9] },
  async fetch({ now, validators }) {
    const reply = await fetchSource(URL, { validators, headers: { accept: "text/html" }, maxBytes: 250_000 });
    if (reply.notModified) return reply;
    return { rows: await parseMiamiDadeResidentialBurning(reply.response, now), validators: reply.validators };
  },
};
