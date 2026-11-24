import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const META = {
  id: "wa-puget-sound-air", state: "WA", stack: "CivicPlus / IIS HTML status grid",
  sourceName: "Puget Sound Clean Air Agency", scope: "part",
  sourceUrl: "https://secure.pscleanair.org/AirQuality/BurnBan",
  officialUrl: "https://pscleanair.gov/168/Air-Quality-Burn-Ban-Status",
} as const;

// The agency's zone map splits these areas independently of the fire-safety jurisdictions.
const AREAS = new Map([
  ["King", ["King", "King air-quality area"]],
  ["Kitsap", ["Kitsap", "Kitsap air-quality area"]],
  ["Pierce", ["Pierce", "Greater Pierce air-quality area outside Peninsula and South Pierce"]],
  ["Peninsula", ["Pierce", "Pierce Peninsula air-quality area"]],
  ["South Pierce", ["Pierce", "South Pierce air-quality area"]],
  ["Snohomish", ["Snohomish", "Snohomish air-quality area outside Darrington"]],
  ["Darrington", ["Snohomish", "Darrington air-quality area"]],
]);
const SELECTORS = {
  row: "#burn-ban-wrapper > .area-row",
  cell: ".area-row > .area-name, .area-row > .status-text",
};

export async function parsePugetSound(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const grid = await extractHtmlGrid(input, SELECTORS);
  const seen = new Set<string>();
  const checked = now.toISOString();
  const rows: CountyStatus[] = [];

  for (const [area, status, ...extra] of grid) {
    const mapped = area && AREAS.get(area.text);
    if (!mapped || !status || extra.length || seen.has(area.text) ||
        !area.className.split(/\s+/).includes("area-name")) {
      throw new Error("Puget Sound: unexpected or duplicate area row");
    }
    seen.add(area.text);

    const classes = status.className.split(/\s+/);
    const codes = classes.filter((name) => /^(?:no-ban|burn-ban-stage-one|burn-ban-stage-two)$/.test(name));
    if (!classes.includes("status-text") || codes.length !== 1) {
      throw new Error(`Puget Sound: unrecognized burn ban code for ${area.text}`);
    }
    const code = codes[0];
    const stage = code === "burn-ban-stage-one" ? 1 : code === "burn-ban-stage-two" ? 2 : null;
    const stageText = /\bStage\s+(\w+)\b/i.exec(status.text)?.[1] ?? "";
    const matchesStage = !stageText || (stage === 1 ? /^(1|one|i)$/i : /^(2|two|ii)$/i).test(stageText);
    if (!status.text || (stage === null ? status.text !== "No Air Quality Burn Ban"
      : /^No\b/i.test(status.text) || !matchesStage)) {
      throw new Error(`Puget Sound: unrecognized burn ban text for ${area.text}`);
    }

    const [name, scopeNote] = mapped;
    const county = countyByName("WA", name);
    if (!county) throw new Error(`Puget Sound: unmapped county ${name}`);
    rows.push({
      state: META.state, sourceId: META.id, scope: META.scope, county: county.name, fips: county.fips, scopeNote,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      status: stage ? "ban" : "unknown",
      label: stage ? `Stage ${stage} air quality burn ban` : "No current Puget Sound air quality ban",
      note: stage
        ? "Outdoor burning is prohibited in this air-quality area. Check the agency for wood heating restrictions and exceptions."
        : "The air agency reports no active air quality burn ban in this area. Check local fire safety rules before burning.",
      checked, since: null, expires: null, sourceUpdated: null,
    });
  }
  if (seen.size !== AREAS.size) throw new Error("Puget Sound: incomplete area grid");
  return rows;
}

export const waPugetSoundAir: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "hourly" },
  staleMs: 12 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html", "cache-control": "no-cache" } });
    if (reply.notModified) throw new Error("Unexpected Puget Sound status 304");
    return { rows: await parsePugetSound(reply.response, now) };
  },
};
