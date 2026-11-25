import type { CountyStatus } from "../../../shared/types";
import { localClock, localDayWindow, parseLocalDateTime, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://apcb.org/";
const ZONE = US_ZONES.Eastern;
const META = {
  id: "tn-hamilton-apcb-daily", state: "TN", scope: "part", stack: "WordPress / Elementor shortcode",
  sourceName: "Chattanooga-Hamilton County Air Pollution Control Bureau",
  sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const WIDGET = ".dark-box > .widget-box-right";
const DATE_AND_DETAIL = /^([A-Za-z]+ \d{1,2}, \d{4})(?:\s+(.+))?$/;
const TIME = /^(\d{1,2}:\d{2} [ap]\.m\.) to (\d{1,2}:\d{2} [ap]\.m\.)(?:\s|$)/i;

export async function parseHamiltonBurnDecision(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const rows = await extractHtmlGrid(input, {
    row: WIDGET,
    cell: `${WIDGET} > .widget-text, ${WIDGET} .widget-text-b2, ${WIDGET} .small-text`,
    spaceLineBreaks: true,
  });
  const [decision, ...duplicates] = rows.filter(([heading]) => heading?.text === "Burning Allowed?");
  const [, flag, detail] = decision?.map(({ text }) => text) ?? [];
  const match = DATE_AND_DETAIL.exec(detail ?? "");
  const date = match && parseUsDate(match[1]);
  if (duplicates.length || decision?.length !== 3 || (flag !== "Yes" && flag !== "No") || !date) {
    throw new Error("Hamilton APCB: missing or changed daily burning widget");
  }
  if (date !== localClock(now, ZONE).date) return [];

  let note = "The Air Pollution Control Bureau posted a no-burn day for its open-burning permit program. Separate rules apply to recreational fires.";
  if (flag === "Yes") {
    const hours = TIME.exec(match[2] ?? "");
    const start = hours && parseLocalDateTime(`${date} ${hours[1]}`, ZONE);
    const end = hours && parseLocalDateTime(`${date} ${hours[2]}`, ZONE);
    if (!hours || !start || !end || end <= start || !/\bA valid permit is required\./i.test(detail)) {
      throw new Error("Hamilton APCB: expected permitted burn hours and a permit requirement");
    }
    note = `Approved burns require a valid permit and may run only from ${hours[1]} to ${hours[2]} Eastern. Check the Bureau’s bulletin for conditions and contact the local fire department before burning.`;
  }

  return [{
    ...localDayWindow(date, ZONE), fips: "47065", county: "Hamilton County", state: META.state,
    scope: META.scope, scopeNote: "Open burning covered by the Hamilton County air bureau’s permit program",
    status: "restricted", label: flag === "Yes" ? "Hamilton County permit and daily burn hours" : "Hamilton County no-burn day",
    note, checked: now.toISOString(), sourceUpdated: null, since: date, expires: date,
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL,
  }];
}

export const tnHamiltonDailyBurning: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [8, 9, 11, 14, 17] },
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html" }, maxBytes: 300_000 });
    if (reply.notModified) throw new Error("Unexpected Hamilton APCB 304");
    return { rows: await parseHamiltonBurnDecision(reply.response, now) };
  },
};
