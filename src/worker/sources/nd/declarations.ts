import { arcgisLocalDate, msToIso, type Attributes } from "../lib/arcgis";
import { US_ZONES } from "../lib/dates";

export const ND_DECLARATION_LAYER = "https://services1.arcgis.com/qQaNyq8h4wNEdlUV/arcgis/rest/services/Fire_Decs_Indexes_Warnings_Template_Publish/FeatureServer/0";
export const ND_DECLARATION_FIELDS = [
  "declaration_status", "declaration_rescinded", "declaration_date_new", "rescinded_date_new", "burn_expiration_date",
] as const;

/** In the map export, start and rescission encode Central wall time. Expiration is already UTC. */
export function ndDeclarationWindow(row: Attributes, at: string, signedEnd?: string) {
  if (row.declaration_status !== "Yes" || typeof row.declaration_rescinded !== "string" ||
    !/^No(?:,\s*No)*$/.test(row.declaration_rescinded)) return;
  const start = arcgisLocalDate(row.declaration_date_new, US_ZONES.Central);
  const lifted = arcgisLocalDate(row.rescinded_date_new, US_ZONES.Central);
  const expires = msToIso(row.burn_expiration_date);
  if (!start || start > at || (row.rescinded_date_new != null && !lifted) ||
    (row.burn_expiration_date != null && !expires)) return;
  const end = [lifted, expires, signedEnd].filter((date): date is string => Boolean(date)).sort()[0] ?? null;
  if (end && end <= at) return;
  return { start, end };
}
