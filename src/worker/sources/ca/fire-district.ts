import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const sanBernardinoPage = "https://sbcfire.org/openburningstatus/";
const sanBernardino = countyByName("CA", "San Bernardino")!;
const meta = {
  id: "ca-san-bernardino-fire-divisions", state: "CA", scope: "part", stack: "WordPress / HTML table",
  sourceName: "San Bernardino County Fire Protection District", sourceUrl: sanBernardinoPage, officialUrl: sanBernardinoPage,
} as const;
const permitRequirement = "You MUST obtain an open fire permit to conduct burning of residential or agricultural vegetation waste within the San Bernardino County Fire Protection District.";

export async function parseSanBernardinoFire(input: Response, now: Date): Promise<CountyStatus[]> {
  const { blocks, tables } = await extractHtml(input);
  const [table, ...extra] = tables.filter(({ heading, rows: [header] }) =>
    heading === "Open Burning Status" && header?.length === 2 && header[0] === "Location" && header[1] === "Burn Status");
  const divisions = table?.rows.slice(1);
  if (!divisions || extra.length || divisions.length !== 5 || !blocks.some(({ text }) => text.startsWith(permitRequirement))) {
    throw new Error("San Bernardino Fire: incomplete division roster or missing permit policy");
  }
  return divisions.map(([place, code, ...rest], index) => {
    if (!place.startsWith(`Division ${index + 1}: `) || rest.length || place.length > 350) {
      throw new Error("San Bernardino Fire: unexpected division");
    }
    const closed = code === "Burning Suspended" || code === "Burning Not Allowed" || code === "Burning Prohibited";
    if (!closed && code !== "Burning Allowed") throw new Error("San Bernardino Fire: unknown burn status");
    return {
      fips: sanBernardino.fips, county: sanBernardino.name, state: meta.state, scope: meta.scope,
      scopeNote: `County Fire ${place.replace(/\.{2}$/, ".")}`,
      status: closed ? "ban" : "restricted",
      label: closed ? "County Fire has suspended open burning" : "County Fire requires an open fire permit",
      note: closed ? "The district lists this division as closed to covered open burning. Check the fire district for applicable exemptions."
        : "The district lists burning as allowed with an open fire permit for residential or agricultural vegetation. Confirm the air district decision and report your intent to burn to County Fire.",
      sourceId: meta.id, sourceName: meta.sourceName, sourceUrl: meta.sourceUrl, officialUrl: meta.officialUrl,
      checked: now.toISOString(), sourceUpdated: null, since: null, expires: null,
    };
  });
}

export const sanBernardinoFire: ActiveSource = {
  ...meta, mode: "positive-only", coverage: "restrictions", reportingFips: [sanBernardino.fips],
  cadence: { kind: "daily", zone: US_ZONES.Pacific, hours: [7, 13, 19] },
  staleMs: 24 * 60 * 60 * 1000,
  async fetch({ now }) {
    const reply = await fetchSource(meta.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected San Bernardino Fire HTTP 304");
    return { rows: await parseSanBernardinoFire(reply.response, now) };
  },
};
