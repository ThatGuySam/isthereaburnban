import type { CountyStatus } from "../../../shared/types";
import { countiesInState, type County } from "../../counties";
import { arcgisEditWindow, arcgisRows, arcgisUrl, type Attributes } from "../lib/arcgis";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const SERVICE = "https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer";
const FIELDS = ["FIRE_DANGER", "RECFIRE_RESTRICTION", "AGBURN_RESTRICTION", "FROST_EXCEPTION", "COMMENTS", "EditDate"];
const DIVISION_URL = arcgisUrl(`${SERVICE}/2`, ["DIVISION", ...FIELDS]);
const COUNTY_URL = arcgisUrl(`${SERVICE}/1`, ["COUNTY", ...FIELDS]);
const META = {
  id: "nj-ffs-restrictions", state: "NJ", stack: "ArcGIS FeatureServer",
  sourceName: "New Jersey Forest Fire Service", sourceUrl: DIVISION_URL,
  officialUrl: "https://www.arcgis.com/apps/dashboards/ab223d9403e94560a60b31b4141cc46e",
};
const MAX_EDIT_AGE_MS = 48 * 60 * 60 * 1000;
const countyKey = (county: County) => county.name.replace(/ County$/, "").toUpperCase();
const COUNTIES = new Map(countiesInState(META.state).map((county) => [countyKey(county), county]));
const REPORTED_DANGER = new Set<unknown>(["LOW", "MODERATE", "HIGH", "VERY_HIGH", "EXTREME"]);
const INACTIVE_COUNTY = new Set<unknown>(["Emtpy", "Empty", null]);

// NJFFS's published jurisdiction list and both dashboard polygons agree on these county overlaps.
// Mercer and Middlesex belong to both A and B. See fixtures/README.md for the map and publication.
const DIVISIONS = new Map([
  ["A", { region: "northern", counties: ["BERGEN", "ESSEX", "HUDSON", "HUNTERDON", "MERCER", "MIDDLESEX", "MORRIS", "PASSAIC", "SOMERSET", "SUSSEX", "UNION", "WARREN"] }],
  ["B", { region: "central", counties: ["BURLINGTON", "MERCER", "MIDDLESEX", "MONMOUTH", "OCEAN"] }],
  ["C", { region: "southern", counties: ["ATLANTIC", "CAMDEN", "CAPE MAY", "CUMBERLAND", "GLOUCESTER", "SALEM"] }],
]);
const SPLIT_COUNTIES = new Set(["MERCER", "MIDDLESEX"]);
const STAGES = new Map<unknown, { label: string; note: string }>([
  ["STAGE1", { label: "Stage 1 campfire restriction", note: "Ground fires in wooded areas are restricted. Check the dashboard for prepared fire ring exceptions." }],
  ["STAGE2", { label: "Stage 2 campfire restriction", note: "Fires in wooded areas are limited to approved elevated fireplaces, elevated charcoal grills or stoves using electricity or liquid or gas fuel." }],
  ["STAGE3", { label: "Stage 3 campfire restriction", note: "Wood and charcoal fires in wooded areas are prohibited. Check the dashboard for allowed stoves and fuels." }],
]);

function indexedReports<T>(data: unknown, key: "DIVISION" | "COUNTY", areas: ReadonlyMap<string, T>) {
  const reports = new Map<string, { area: T; feature: Attributes }>();
  for (const feature of arcgisRows(data, { requireComplete: true })) {
    const name = feature[key];
    const area = typeof name === "string" ? areas.get(name) : undefined;
    if (typeof name !== "string" || area === undefined || reports.has(name)) {
      throw new Error(`NJ Forest Fire Service: invalid or repeated ${key}`);
    }
    if (!FIELDS.every((field) => Object.hasOwn(feature, field))) {
      throw new Error(`NJ Forest Fire Service: missing fields for ${name}`);
    }
    reports.set(name, { area, feature });
  }
  if (reports.size !== areas.size) throw new Error(`NJ Forest Fire Service: incomplete ${key} layer`);
  return reports;
}

function restrictions({ RECFIRE_RESTRICTION, AGBURN_RESTRICTION, FROST_EXCEPTION, COMMENTS }: Attributes):
  Pick<CountyStatus, "status" | "label" | "note"> | undefined {
  const stage = STAGES.get(RECFIRE_RESTRICTION);
  const agricultural = AGBURN_RESTRICTION === "Y";
  const reported = stage || agricultural || RECFIRE_RESTRICTION === "N" || AGBURN_RESTRICTION === "N";
  if (!reported) return;

  const campfireNote = stage?.note ?? (RECFIRE_RESTRICTION === "N"
    ? "The Forest Fire Service reports no temporary campfire stage here."
    : "The campfire restriction status is unconfirmed.");
  const agriculturalNote = agricultural ? "The Forest Fire Service reports an agricultural open-burning restriction here."
    : AGBURN_RESTRICTION === "N" ? "The Forest Fire Service reports no temporary agricultural open-burning restriction here."
    : "The agricultural open-burning restriction status is unconfirmed.";
  const comments = typeof COMMENTS === "string" ? COMMENTS.trim() : "";
  const note = [
    campfireNote, agriculturalNote,
    FROST_EXCEPTION === "Y" && "The dashboard flags a frost exception. Confirm the terms with the Forest Fire Service.",
    comments && `Forest Fire Service comments: ${comments}`,
    "Check permit requirements and local rules before burning.",
  ].filter(Boolean).join(" ");
  return {
    status: stage || agricultural ? "restricted" : "unknown",
    label: [stage?.label, agricultural && "Agricultural open-burning restriction"].filter(Boolean).join(" and ")
      || "Countywide status unconfirmed",
    note,
  };
}

export function parseNjRestrictions(divisions: unknown, counties: unknown, now: Date): CountyStatus[] {
  const divisionReports = indexedReports(divisions, "DIVISION", DIVISIONS);
  const countyReports = indexedReports(counties, "COUNTY", COUNTIES);
  const overrides = new Set<string>();
  const rows: CountyStatus[] = [];
  const checked = now.toISOString();
  let freshReports = 0;

  function add(report: Attributes, targets: County[], scope: "county" | "part", area: string, sourceUrl: string) {
    const window = arcgisEditWindow(report.EditDate, now, MAX_EDIT_AGE_MS);
    if (!window) return;
    freshReports++;
    const condition = restrictions(report);
    if (!condition) return;
    for (const county of targets) {
      const part = scope === "part" && SPLIT_COUNTIES.has(countyKey(county));
      rows.push({
        ...condition, ...window, checked, since: null, expires: null, scope,
        scopeNote: part ? `${area}, part of ${county.name}` : area,
        sourceId: META.id, state: META.state, fips: county.fips, county: county.name,
        sourceName: META.sourceName, sourceUrl, officialUrl: META.officialUrl,
      });
    }
  }

  for (const [name, { area: county, feature }] of countyReports) {
    // The dashboard displays county reports only when a fire danger value is set.
    if (INACTIVE_COUNTY.has(feature.FIRE_DANGER)) continue;
    if (!REPORTED_DANGER.has(feature.FIRE_DANGER)) {
      throw new Error(`NJ Forest Fire Service: unrecognized county reporting code for ${name}`);
    }
    overrides.add(name);
    add(feature, [county], "county", "Campfires and agricultural open burning", COUNTY_URL);
  }
  for (const [id, { area: { region, counties: names }, feature }] of divisionReports) {
    const targets = names.filter((name) => !overrides.has(name)).map((name) => {
      const report = countyReports.get(name);
      if (!report) throw new Error(`NJ Forest Fire Service: unmapped county ${name}`);
      return report.area;
    });
    add(feature, targets, "part", `Division ${id} (${region} New Jersey)`, DIVISION_URL);
  }
  if (!freshReports) throw new Error("NJ Forest Fire Service: no current county or division reports");
  return rows;
}

export const njRestrictions: ActiveSource = {
  ...META,
  scope: "county",
  mode: "positive-only",
  coverage: "restrictions",
  // Firewardens can change the stages without notice. Recheck source timestamps each poll.
  cadence: { kind: "hourly" },
  staleMs: MAX_EDIT_AGE_MS,
  async fetch({ now }) {
    const options = { headers: { accept: "application/json" }, maxBytes: 100_000 };
    const divisions: unknown = JSON.parse(await getText(DIVISION_URL, options));
    const counties: unknown = JSON.parse(await getText(COUNTY_URL, options));
    return { rows: parseNjRestrictions(divisions, counties, now) };
  },
};
