import { z } from "zod";
import { COUNTY_BY_FIPS } from "../../counties";
import { beforeYouBurnArea } from "../lib/before-you-burn";
import { calendarStatusRows } from "../lib/calendar";
import { dailyStatusRows, type DailyDecision } from "../lib/daily-status";
import { atLocalTime, localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtml, htmlText } from "../lib/html";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const zone = US_ZONES.Pacific;
const crRanch = {
  id: "or-crooked-river-ranch-burn-status", state: "OR", sourceName: "Crooked River Ranch Fire & Rescue",
  sourceUrl: "https://beforeyouburn.com/a/crooked-river-ranch-fire-rescue/areas",
  officialUrl: "https://beforeyouburn.com/a/crooked-river-ranch-fire-rescue/areas",
  stack: "Before You Burn / HTML", reportingFips: ["41017", "41031"],
};
const depoeBay = {
  id: "or-depoe-bay-burn-status", state: "OR", sourceName: "Depoe Bay Rural Fire Protection District",
  sourceUrl: "https://beforeyouburn.com/a/depoe-bay-rural-fire-protection-district/areas",
  officialUrl: "https://beforeyouburn.com/a/depoe-bay-rural-fire-protection-district/areas",
  stack: "Before You Burn / HTML", reportingFips: ["41041"],
};

export async function parseCrookedRiverRanch(input: Response | string, now: Date) {
  const area = await beforeYouBurnArea(input, {
    id: 894, name: "Crooked River Ranch District", agency: "Crooked River Ranch Fire Rescue",
  });
  if (area.season !== "Set day to day by the agency" ||
      !((area.status === "Open" && area.today === "Open") || (area.status === "Closed" && area.today === "Closed"))) {
    throw new Error("Crooked River Ranch: unrecognized daily burning decision");
  }
  const open = area.status === "Open";
  const date = localClock(now, zone).date;
  const scopeNote = "Crooked River Ranch Rural Fire Protection District";
  return dailyStatusRows(crRanch, zone, ["Deschutes", "Jefferson"].map((county): DailyDecision => ({
    county, date, scopeNote, status: open ? "restricted" : "ban",
    label: open ? "Crooked River Ranch requires advance debris-burn registration" : "Crooked River Ranch debris burning closed",
    note: "The district posts its daily decision on Before You Burn and requires registration before outdoor debris burning. Call 541-923-4633 with questions.",
  })), now);
}

export async function parseDepoeBay(input: Response | string, now: Date) {
  const area = await beforeYouBurnArea(input, {
    id: 299, name: "Depoe Bay Rural Fire Protection District", agency: "Depoe Bay Rural Fire Protection District",
  });
  if (area.status === "Open" && /^Open(?:\. Burn season through [A-Z][a-z]{2} \d{1,2})?$/.test(area.today)) return [];
  if (area.status === "Call Local Agency" && area.today.startsWith("Call Local Agency.")) return [];
  if (area.status !== "Closed" || !/^Closed(?:\. Burn season opens [A-Z][a-z]{2} \d{1,2})?$/.test(area.today)) {
    throw new Error("Depoe Bay: unrecognized burning decision");
  }
  return dailyStatusRows(depoeBay, zone, [{
    county: "Lincoln", date: localClock(now, zone).date, scopeNote: "Depoe Bay Rural Fire Protection District",
    status: "restricted", label: "Backyard debris burning closed in Depoe Bay Fire District",
    note: "The district publishes its backyard debris-burning decision on Before You Burn. Check that service for your address and for updates.",
  }], now);
}

function districtPage(publisher: typeof crRanch, parse: typeof parseCrookedRiverRanch,
  pollGroup: string, hours: readonly [number, ...number[]]): ActiveSource {
  return {
    ...publisher, mode: "positive-only", scope: "part", coverage: "restrictions",
    cadence: { kind: "daily", zone, hours }, pollGroup,
    async fetch({ now }) {
      return { rows: await parse(await getText(publisher.sourceUrl, {
        maxBytes: 260_000, maxResponseAgeMs: 60 * 60_000,
      }), now) };
    },
  };
}

export const orCrookedRiverRanch = districtPage(crRanch, parseCrookedRiverRanch, "or-local-observations", [6, 12]);
export const orDepoeBay = districtPage(depoeBay, parseDepoeBay, "or-regional-burning", [8, 12, 18]);

const tvfr = {
  id: "or-tvfr-high-fire-danger", state: "OR", sourceName: "Tualatin Valley Fire & Rescue",
  sourceUrl: "https://www.arcgis.com/sharing/rest/content/items/9095153e83074dbc8f8d04769bf40d4d/data?f=json",
  officialUrl: "https://tvfr.maps.arcgis.com/apps/instant/lookup/index.html?appid=df8d5dd233854662ae9b999e911876c5",
  stack: "ArcGIS WebMap",
  reportingFips: ["41005", "41051", "41067", "41071"],
};
const tvfrLayer = z.object({
  title: z.literal("TVF&R Burn Ban in Effect"),
  url: z.literal("https://services1.arcgis.com/wOF9vb6aWdPvzl13/arcgis/rest/services/TVFR_bnd_2019_10/FeatureServer/0"),
  visibility: z.boolean(),
  popupInfo: z.object({ popupElements: z.array(z.object({ text: z.string().optional() })) }),
});

export function parseTvfrBurnBan(data: unknown, now: Date) {
  const raw = z.object({ operationalLayers: z.array(z.object({ title: z.string() }).passthrough()) }).parse(data);
  const matches = raw.operationalLayers.filter(({ title }) => title === "TVF&R Burn Ban in Effect");
  if (matches.length !== 1) throw new Error("TVF&R: missing or duplicate burn ban overlay");
  const layer = tvfrLayer.parse(matches[0]);
  if (!layer.visibility) return [];
  const text = htmlText(layer.popupInfo.popupElements.map(({ text }) => text).join(" "));
  const issued = /enacting a High-Fire Danger Burn Ban as of ([A-Za-z]+ \d{1,2}, \d{4}) at (\d{1,2}):(\d{2}) hours/.exec(text);
  const day = issued && parseUsDate(issued[1]);
  const validFrom = day && atLocalTime(day, Number(issued[2]) * 60 + Number(issued[3]), zone);
  if (!validFrom || !text.includes("including areas served in Washington, Multnomah, Clackamas and Yamhill Counties") ||
      !text.includes("Backyard or open burning")) {
    throw new Error("TVF&R: unrecognized burn ban date, activities or district footprint");
  }
  if (validFrom > now.toISOString()) return [];
  const { id: sourceId, state, sourceName, sourceUrl, officialUrl, reportingFips } = tvfr;
  return reportingFips.map((fips) => ({
    sourceId, state, sourceName, sourceUrl, officialUrl, fips, county: COUNTY_BY_FIPS.get(fips)!.name, scope: "part" as const,
    scopeNote: "Tualatin Valley Fire & Rescue district", status: "ban" as const,
    label: "Tualatin Valley Fire & Rescue high-fire-danger burn ban",
    note: "The district bans backyard, agricultural and other open burning in its service area. Check the district map and order for restrictions on other fires and equipment.",
    checked: now.toISOString(), since: day, expires: null, validFrom, sourceUpdated: null,
  }));
}

export const orTvfrBurnBan: ActiveSource = {
  ...tvfr, scope: "part", mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone, hours: [8, 12, 18] }, pollGroup: "or-regional-burning",
  async fetch({ now }) {
    return { rows: parseTvfrBurnBan(JSON.parse(await getText(tvfr.sourceUrl, { maxBytes: 350_000 })), now) };
  },
};

const tillamook = {
  id: "or-tillamook-bay-permit-window", state: "OR", sourceName: "Tillamook Bay Fire & Rescue",
  sourceUrl: "https://www.tillamookfiredistrict.com/", officialUrl: "https://www.tillamookfiredistrict.com/",
  stack: "Streamline", scope: "part", mode: "positive-only", coverage: "restrictions", recurring: true, reportingFips: ["41057"],
} as const;
const tillamookCounty = COUNTY_BY_FIPS.get("41057")!;

export async function parseTillamookPermitWindow(input: Response | string, now: Date) {
  const { blocks } = await extractHtml(input);
  const notices = blocks.filter(({ tag, text }) => tag === "h2" && text.startsWith("Outdoor Burning for Tillamook Bay Fire & Rescue RFPD"));
  const match = /^Outdoor Burning for Tillamook Bay Fire & Rescue RFPD will open effective ([^,]+, \d{4}), with a Valid Burn Permit\..*The Burn Season will end on ([^,]+, \d{4}) in Tillamook Bay Fire & Rescue District\.$/i.exec(notices[0]?.text ?? "");
  const from = match && parseUsDate(match[1]);
  const through = match && parseUsDate(match[2]);
  if (notices.length !== 1 || !from || !through || through <= from ||
      Date.parse(through) - Date.parse(from) > 366 * 86_400_000) {
    throw new Error("Tillamook Bay: unrecognized permit season announcement");
  }
  return calendarStatusRows({
    state: "OR", zone, status: "restricted", scope: "part", officialUrl: tillamook.officialUrl,
    scopeNote: "Tillamook Bay Fire & Rescue Rural Fire Protection District",
    label: "Tillamook Bay Fire requires a permit during its open-burning window",
    note: "The fire district requires a valid permit during the posted season. Check the district for current closures and permitted materials.",
    effectiveDates: [from, through],
  }, [tillamookCounty], tillamook, now, { includeTomorrow: true, includeSeasonDates: true });
}

export const orTillamookPermitWindow: ActiveSource = {
  ...tillamook, cadence: { kind: "daily", zone, hours: [6] }, pollGroup: "or-local-observations",
  async fetch({ now }) {
    return { rows: await parseTillamookPermitWindow(await getText(tillamook.sourceUrl, { maxBytes: 250_000 }), now) };
  },
};
