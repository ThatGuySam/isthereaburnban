import { z } from "zod";
import { parseLocalDateTime } from "./dates";

// The JSON embed used by NPS park conditions pages. It is public and needs no API key.
const alertList = z.array(z.object({
  site_code: z.string(),
  id: z.uuid(),
  title: z.string().trim().min(1),
  description: z.string().trim(),
  category: z.string().min(1),
  is_active: z.union([z.literal(0), z.literal(1)]),
  start_date: z.string(),
  end_date: z.string(),
}));

export function parseNpsParkAlerts(data: unknown, parkCode: string) {
  const alerts = alertList.parse(data);
  if (alerts.some(({ site_code }) => site_code !== parkCode) || new Set(alerts.map(({ id }) => id)).size !== alerts.length) {
    throw new Error(`NPS ${parkCode}: unexpected park code or duplicate alert`);
  }
  return alerts;
}

export function npsAlertTime(raw: string, zone: string): string | null {
  if (!raw || /\b1900\b/.test(raw)) return null; // NPS Conditions treats 1900 as an unset date.
  const instant = parseLocalDateTime(raw.replace(/^([A-Za-z]+),\s+/, "$1 "), zone);
  if (!instant) throw new Error(`NPS: unrecognized alert timestamp ${raw}`);
  return instant;
}
