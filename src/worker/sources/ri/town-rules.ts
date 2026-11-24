import { countiesInState } from "../../counties";
import { calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { civicPlusPageText } from "../lib/civicplus";
import { US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const BASE = {
  state: "RI", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
  counties: new Set(["washington"]),
} satisfies Partial<CalendarRule>;
const COUNTIES = countiesInState(BASE.state);
const TOWNS = {
  narragansett: {
    title: "Open Burning Laws", name: "Narragansett", sourceName: "Narragansett Fire Department",
    url: "https://www.narragansettri.gov/610/Open-Burning-Laws",
    fingerprint: "8a63036ad5c51cee50895e9fddffa1eb96e15d0a974de02939f6132c3269b8c6",
    label: "Local fire permits and open-burning limits",
    note: "Narragansett requires fire department permits for fires on public grounds, private bonfires and burning cut brush or leaves. The town prohibits open fires on commercial property and burning solid waste or treated wood. Qualifying residential fires and grills have exceptions.",
  },
  northkingstown: {
    title: "Outdoor Burning", name: "North Kingstown", sourceName: "North Kingstown Fire Department",
    url: "https://www.northkingstownri.gov/172/Outdoor-Burning",
    fingerprint: "5c0627608057c944d70f6bf608b563542d195ecce25581524b1d75d7a2ee88a0",
    label: "Daily approval for covered open burning",
    note: "North Kingstown requires permits for covered fires on public grounds and at construction sites, and limits open fires on residential property. Fire department permits depend on weather and inspection. Call the dispatcher for approval and temporary restrictions.",
  },
  southkingstown: {
    title: "Burn Permits", name: "South Kingstown", sourceName: "South Kingstown Emergency Management",
    url: "https://www.southkingstownri.gov/1206/Burn-Permits",
    fingerprint: "43dc73086b2d5acbd26ee2993a0b4dd67ab705da1179b02c448c560cb45fb374",
    label: "Local permits required for covered fires",
    note: "South Kingstown requires permits for bonfires and covered open fires, with a local exception for qualifying recreational fires on private residential property. The fire chief can suspend burning. Ask Public Safety Dispatch about permit hours and current conditions.",
  },
};

type Town = keyof typeof TOWNS;

function publisher(town: Town) {
  const { name, sourceName, url } = TOWNS[town];
  return {
    id: `ri-${name.toLowerCase().replaceAll(" ", "-")}-burning`, state: BASE.state, scope: BASE.scope,
    stack: "CivicPlus / rich-text HTML and calendar",
    sourceName, sourceUrl: url, officialUrl: url,
  };
}

export async function parseRiTownRule(input: Response | string, now: Date, town: Town) {
  const { title, name, fingerprint } = TOWNS[town];
  const blocks = await civicPlusPageText(input, title, ["h2", "h3", "p", "li"]);
  if (await sha256(blocks.join("\n")) !== fingerprint) {
    throw new Error(`${name}: reviewed open-burning rules changed or missing`);
  }

  return pinnedRows(now, town);
}

function pinnedRows(now: Date, town: Town) {
  const { name, url, label, note } = TOWNS[town];
  const rule = { ...BASE, scopeNote: `Town of ${name}`, officialUrl: url, label, note };
  const meta = publisher(town);
  const options = { includeTomorrow: true, includeSeasonDates: true };
  const rows = calendarStatusRows(rule, COUNTIES, meta, now, options);
  if (town === "northkingstown") {
    rows.push(...calendarStatusRows({
      ...rule,
      label: "Spring outdoor burning closed",
      note: "North Kingstown Fire Department guidance prohibits outdoor burning during April and May due to brush fire risk. Contact the department about the rule and any permit exceptions.",
      seasons: [["04-01", "05-31"]],
    }, COUNTIES, meta, now, options));
  }
  return rows;
}

function makeSource(town: Town): ActiveSource {
  const meta = publisher(town);
  return {
    ...meta, recurring: true, pinnedRows: (now) => pinnedRows(now, town), mode: "positive-only", coverage: "restrictions",
    cadence: { kind: "daily", zone: BASE.zone, hours: [9] },
    async fetch({ now }) {
      const reply = await fetchSource(meta.sourceUrl, { headers: { accept: "text/html" } });
      if (reply.notModified) throw new Error(`Unexpected ${meta.id} 304`);
      return { rows: await parseRiTownRule(reply.response, now, town) };
    },
  };
}

export const riTownSources = {
  narragansett: makeSource("narragansett"),
  northkingstown: makeSource("northkingstown"),
  southkingstown: makeSource("southkingstown"),
};
