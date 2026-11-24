import type { FireWeatherAlert, FireWeatherOrder, ScopedOrder } from "../../../shared/types";
import { arcgisRows, arcgisUrl, msToIso } from "../lib/arcgis";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";
import { fetchSource, type HttpFetch } from "../lib/http";

type Declaration = { start: string; end: string };

type Rule = Pick<ScopedOrder, "scope" | "scopeNote" | "label" | "sourceName" | "officialUrl" | "note"> & {
  throughMidnight?: boolean;
};

const standingRules: Record<string, Rule> = {
  "08009": {
    scope: "part", scopeNote: "Unincorporated Baca County", sourceName: "Baca County Board of County Commissioners",
    label: "Stage I fire restrictions during a Red Flag Warning",
    officialUrl: "https://www.bacacountyco.gov/ordinance-no-7/",
    note: "Baca County Ordinance No. 7, Part One §7 and Part Three, automatically activates Stage I restrictions throughout unincorporated Baca County during the warning. The rules include limits on campfires, charcoal and wood grills, and debris burning.",
  },
  "08013": {
    scope: "part", scopeNote: "Unincorporated Boulder County", sourceName: "Boulder County Board of County Commissioners",
    label: "Open fire restrictions during a Red Flag Warning",
    officialUrl: "https://assets.bouldercounty.gov/wp-content/uploads/2023/10/ordinance-2023-1_fire_bans_open_burning.pdf",
    note: "Boulder County Ordinance 2023-1 §II(B) restricts open fires and fireworks in unincorporated Boulder County during the warning. See the county for local timing and exemptions.",
  },
  "08027": {
    scope: "county", scopeNote: "Activities covered by Custer County Ordinance 20-01",
    sourceName: "Custer County Board of County Commissioners",
    label: "Stage 2 fire restrictions during a Red Flag Warning",
    officialUrl: "https://custercounty-co.gov/wp-content/uploads/2026/02/Custer-County-Colorado-Ordinance-20-01.pdf#page=6",
    note: "Custer County Ordinance 20-01 §8.1 activates Stage 2 fire restrictions throughout Custer County during the warning. The warning also suspends the ordinance’s agricultural burning exception.",
  },
  "08059": {
    scope: "part", scopeNote: "Unincorporated Jefferson County", sourceName: "Jefferson County Sheriff’s Office",
    label: "Stage 1 fire restrictions triggered by a Red Flag Warning",
    officialUrl: "https://www.jeffcosheriffco.gov/safety/wildland-fire/fire-restrictions/guide",
    note: "The Jefferson County Sheriff’s standing order applies Stage 1 restrictions to unincorporated Jefferson County from the start of a warning through midnight at the end of the last warned day.",
    throughMidnight: true,
  },
  "08101": {
    scope: "part", scopeNote: "Unincorporated Pueblo County", sourceName: "Pueblo County Board of County Commissioners",
    label: "Stage 2 fire restrictions during a Red Flag Warning",
    officialUrl: "https://www.pueblocounty.gov/county-attorney/chapter-824-open-fire-and-open-burning-restriction",
    note: "Pueblo County Code §8.24.070 applies Stage 2 restrictions during the warning in unincorporated Pueblo County. See §8.24.090 for exceptions.",
  },
  "46089": {
    scope: "part", scopeNote: "McPherson County outside municipalities", sourceName: "McPherson County Board of Commissioners",
    label: "Open fire restrictions during a Red Flag Warning",
    officialUrl: "https://mcpherson.sdcounty.gov/wp-content/uploads/2026/01/Ordinance-21-1-Signed_Open-Burning-Regulation.pdf",
    note: "McPherson County Ordinance 21-1 §II(A) restricts open fires outside municipalities during a warning. Sections I and II(C) specify activity and campground exceptions.",
  },
  "46097": {
    scope: "part", scopeNote: "Open fires outside municipalities and burn barrels in Miner County",
    sourceName: "Miner County Board of Commissioners",
    label: "Open fire and burn barrel restrictions during a Red Flag Warning",
    officialUrl: "https://miner.sdcounty.gov/firedanger/",
    note: "Miner County Ordinance 2024-04 §II(A–B) restricts open fires outside municipalities and use of burn barrels during a warning. Section II(E) provides campground exceptions.",
  },
};

const newMexico: Rule = {
  scope: "part", scopeNote: "Prescribed burns in the area covered by the warning", sourceName: "New Mexico Legislature",
  label: "Starting a prescribed burn is prohibited during a Red Flag Warning",
  officialUrl: "https://www.nmlegis.gov/Sessions/23%20Regular/final/SB0021.PDF",
  note: "NMSA 1978 §68-5-3(C), as enacted by 2023 Laws, Chapter 88, prohibits starting a prescribed burn when the NWS has issued a Red Flag Warning for the planned burn area.",
};

const datedRules: Record<string, { county: string; filename: string; signedEnd: string; rule: Rule }> = {
  "38017": {
    county: "Cass County", filename: "Cass County 04062026 Burn Restriction Declaration.pdf",
    signedEnd: "2026-12-01T06:00:00.000Z",
    rule: {
      scope: "county", scopeNote: "Activities covered by the Cass County declaration",
      sourceName: "Cass County Board of Commissioners", label: "Open burning restrictions during a Red Flag Warning",
      officialUrl: "https://www.casscountynd.gov/departments/emergency-management/cass-county-burn-restrictions",
      note: "Cass County’s April 6, 2026 Fire Emergency and Burn Restriction Declaration restricts open burning, campfires, agricultural burning and fireworks during a Red Flag Warning. The declaration exempts certain controlled devices.",
    },
  },
  "38055": {
    county: "McLean County", filename: "McLean County 02182026 Burn Restriction Declaration.pdf",
    signedEnd: "2027-01-01T06:00:00.000Z",
    rule: {
      scope: "county", scopeNote: "Activities covered by the McLean County declaration",
      sourceName: "McLean County Board of Commissioners", label: "Open burning restrictions during a Red Flag Warning",
      officialUrl: "https://www.mcleancountynd.gov/county-news/2026-burn-restrictions/",
      note: "McLean County’s February 18, 2026 Fire Emergency Burn Restrictions restrict open burning, crop residue burning, campfires and fireworks during a Red Flag Warning. The declaration exempts certain controlled devices.",
    },
  },
  "38057": {
    county: "Mercer County", filename: "Mercer County 20260506  Burn Restriction Declaration.pdf",
    signedEnd: "2027-01-01T06:00:00.000Z",
    rule: {
      scope: "county", scopeNote: "Activities covered by the Mercer County declaration",
      sourceName: "Mercer County Board of County Commissioners", label: "Burning restrictions during a Red Flag Warning",
      officialUrl: "https://mercercountynd.com/image/cache/5-6-2026_Fire_Emergency_Declaration_Burn_Ban.pdf",
      note: "Mercer County’s May 6, 2026 Fire Emergency Declaration covers incorporated cities and prohibits listed burning activities during a Red Flag Warning, including campfires, agricultural burning, fireworks, and charcoal or wood grills and smokers.",
    },
  },
};
const ndRulesByName = new Map(Object.entries(datedRules).map(([fips, value]) => [value.county, { fips, ...value }]));
const ND_DES = "https://services1.arcgis.com/qQaNyq8h4wNEdlUV/arcgis/rest/services/Fire_Decs_Indexes_Warnings_Template_Publish/FeatureServer/0";
const counties = [...ndRulesByName.keys()].map((name) => `'${name}'`).join(", ");
export const ND_DECLARATIONS_URL = arcgisUrl(ND_DES, [
  "county", "attachment_declaration_name", "declaration_status", "declaration_rescinded",
  "declaration_date_new", "burn_expiration_date",
], { where: `county IN (${counties}) AND Jurisdiction_Type = 'County FDR'` });

export const hasDatedRedFlagRule = (fips: string) => Object.hasOwn(datedRules, fips);

export async function readNdDeclarations(now: Date, fetchImpl?: HttpFetch): Promise<Map<string, Declaration>> {
  const reply = await fetchSource(ND_DECLARATIONS_URL, { fetchImpl, maxBytes: 32_000, timeoutMs: 5_000, attempts: 1 });
  if (reply.notModified) throw new Error("Unexpected North Dakota declaration 304");
  const rows = arcgisRows(await reply.response.json(), { allowEmpty: true, requireComplete: true });
  const checked = now.toISOString();
  const valid = new Map<string, Declaration>();
  for (const row of rows) {
    const expected = typeof row.county === "string" ? ndRulesByName.get(row.county) : undefined;
    if (!expected || row.attachment_declaration_name !== expected.filename ||
      row.declaration_status !== "Yes" || row.declaration_rescinded !== "No") continue;
    const start = msToIso(row.declaration_date_new);
    const publishedEnd = msToIso(row.burn_expiration_date);
    const end = publishedEnd && publishedEnd < expected.signedEnd ? publishedEnd : expected.signedEnd;
    if (start && end && start <= checked && checked < end) valid.set(expected.fips, { start, end });
  }
  return valid;
}

export function redFlagOrder(fips: string, alert: FireWeatherAlert, effective: string | null,
  declaration?: Declaration,
): Omit<FireWeatherOrder, "checked"> | undefined {
  if (alert.event !== "Red Flag Warning") return;
  const rule = declaration ? datedRules[fips]?.rule : fips.startsWith("35") ? newMexico : standingRules[fips];
  const onset = alert.onset ?? effective;
  const end = alert.ends ?? alert.expires;
  if (!rule || !onset || !end) return;
  const { throughMidnight, ...details } = rule;
  const validFrom = declaration && declaration.start > onset ? declaration.start : onset;
  const expires = throughMidnight
    ? localDayWindow(localClock(new Date(Date.parse(end) - 1), US_ZONES.Mountain).date, US_ZONES.Mountain).validUntil
    : declaration && declaration.end < end ? declaration.end : end;
  const validUntil = !throughMidnight && alert.expires && alert.expires < expires ? alert.expires : expires;
  if (validUntil <= validFrom) return;
  return {
    ...details, sourceId: `nws-red-flag-${fips}`, status: "restricted",
    since: validFrom, expires, validFrom, validUntil, sourceUpdated: null,
    ...(throughMidnight && end < expires ? { retainAfter: end } : {}),
  };
}
