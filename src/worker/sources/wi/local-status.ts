import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { htmlStatusChoice } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const HOUR = 3_600_000;

type LocalPanel = {
  id: string;
  county: string;
  scopeNote: string;
  stack: string;
  sourceName: string;
  officialUrl: string;
  panel: Parameters<typeof htmlStatusChoice<"ban" | "clear">>[1];
  note: string;
};

const panels: readonly LocalPanel[] = [
  {
    id: "wi-burlington-burn-ban", county: "Racine", scopeNote: "Town of Burlington",
    stack: "Juniper / HTML", sourceName: "Town of Burlington Fire Department",
    officialUrl: "https://www.townofburlingtonwi.gov/fire-department/",
    panel: {
      section: ".column3-2-1784217505520",
      blocks: "h2, .Textblock-1784217665431 p",
      choices: [
        ["clear", /^Burn Ban\nThere is currently no burn ban in effect\.$/i],
        ["ban", /^Burn Ban\nThere is currently (?:a )?burn ban in effect\.$/i],
      ],
    },
    note: "The Town of Burlington Fire Department reports an active town burn ban. Check with the town for its extent and exceptions.",
  },
  {
    id: "wi-somerset-burn-ban", county: "St. Croix", scopeNote: "Town and Village of Somerset",
    stack: "WordPress / Elementor", sourceName: "Somerset Fire & Rescue",
    officialUrl: "https://somersetfirerescue.com/burning-permits/",
    panel: {
      section: ".elementor-element-99887dd section.elementor-inner-section:not(.ae-visibility-hidden)",
      blocks: "h2, p, li",
      choices: [
        ["clear", /^No Burn Ban In Effect\nThere is no Burn Ban in effect at this time\. Please refer to the resources on this page for safe outdoor burning\.$/i],
        ["ban", /^Burn Ban In Effect\nA Burn Ban is currently in effect\. The following is prohibited:\nSeasonal backyard burning \(branches, yard debris, etc\.\)\nCommercial agricultural burning \(agricultural waste, crops, field burning, etc\.\)\nAny other land clearing \(slash, stump or controlled forestry burning\.\)$/i],
      ],
    },
    note: "Somerset Fire & Rescue prohibits seasonal yard debris burning, commercial agricultural burning and land-clearing fires under this order.",
  },
];

function localBurnPanel({ county, scopeNote, panel, note, ...publisher }: LocalPanel) {
  const area = countyByName("WI", county);
  if (!area) throw new Error(`Unknown Wisconsin county: ${county}`);
  const { fips, name } = area;
  const { id, ...links } = publisher;
  const sourceUrl = links.officialUrl;
  const meta = { ...links, sourceUrl, state: "WI", scope: "part" } as const;

  async function parse(input: Response | string, now: Date): Promise<CountyStatus[]> {
    const status = await htmlStatusChoice(input, panel);
    if (status === "clear") return [];
    return [{
      ...meta, sourceId: id, fips, county: name, status, scopeNote,
      label: "Local burn ban in effect", note, checked: now.toISOString(),
      since: null, expires: null, sourceUpdated: null,
    }];
  }

  const source: ActiveSource = {
    id, ...meta, mode: "positive-only", coverage: "restrictions", reportingFips: [fips], staleMs: 9 * HOUR,
    cadence: { kind: "daily", zone: US_ZONES.Central, hours: [3, 9, 15, 21] },
    async fetch({ now }) {
      const reply = await fetchSource(sourceUrl, {
        headers: { accept: "text/html" }, attempts: 1, maxBytes: 500_000, maxResponseAgeMs: 2 * HOUR,
      });
      if (reply.notModified) throw new Error(`Unexpected ${id} status 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}

export const wiLocalStatuses = panels.map(localBurnPanel);
