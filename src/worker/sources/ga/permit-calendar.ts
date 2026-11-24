import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";
import { firestoreDocument, firestoreQuery, firestoreTimestampQuery } from "../lib/firestore";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Eastern;
const ROOT = "projects/georgiaburnpermits/databases/(default)/documents/counties";
const REST = `https://firestore.googleapis.com/v1/${ROOT}`;
const QUERY_LIMIT = 8;
const PROGRAMS = {
  Barrow: {
    sourceName: "Barrow County Fire Department",
    officialUrl: "https://www.barrowga.org/494/Obtain-a-Burn-Permit",
    scopeNote: "Barrow County Fire Department residential permit area, excluding Winder",
    hours: [8, 12, 16],
  },
  Habersham: {
    sourceName: "Habersham County Emergency Services",
    officialUrl: "https://www.habershamga.com/burnpermit.cfm",
    scopeNote: "Residential permits issued by Habersham County Emergency Services",
    hours: [9, 13, 17],
  },
  Ware: {
    sourceName: "Ware County Fire Rescue",
    officialUrl: "https://www.warecountyga.gov/department-nodes/public-health-safety",
    scopeNote: "Ware County Fire Rescue residential permits outside Waycross",
    hours: [10, 14, 18],
  },
} satisfies Record<string, { sourceName: string; officialUrl: string; scopeNote: string; hours: [number, number, number] }>;

type Program = keyof typeof PROGRAMS;
const dateFields = z.object({
  date: z.object({ timestampValue: z.iso.datetime() }),
  reason: z.object({ stringValue: z.string() }).optional(),
});
const programFields = z.object({
  name: z.object({ stringValue: z.string() }),
  enabled: z.object({ booleanValue: z.boolean() }),
});

const programPath = (program: Program) => `${ROOT}/${program.toUpperCase()}`;
const excludedPath = (program: Program) => `${programPath(program)}/excludedDates`;
const sourceId = (program: Program) => `ga-${program.toLowerCase()}-permit-calendar`;
const closuresUrl = (program: Program) => `https://firestore.googleapis.com/v1/${excludedPath(program)}?pageSize=1&orderBy=date%20desc&mask.fieldPaths=date&mask.fieldPaths=reason`;

function programEnabled(payload: unknown, program: Program) {
  const { fields } = firestoreDocument(payload, programPath(program), programFields);
  if (fields.name.stringValue !== program) throw new Error(`Unexpected Firestore county name for ${program}`);
  return fields.enabled.booleanValue;
}

export function parsePermitCalendar(payload: unknown, program: Program, now: Date): CountyStatus[] {
  const rows = firestoreQuery(payload, excludedPath(program), dateFields, QUERY_LIMIT);
  const { date } = localClock(now, ZONE);
  const monthDay = date.slice(5);
  const epdSeason = monthDay >= "05-01" && monthDay <= "09-30";
  const window = localDayWindow(date, ZONE);
  const start = Date.parse(window.validFrom);
  const end = Date.parse(window.validUntil);
  const checked = now.toISOString();
  const county = countyByName("GA", program);
  if (!county) throw new Error(`Missing Georgia county: ${program}`);
  let latest: string | undefined;
  for (const { fields, updateTime } of rows) {
    const at = Date.parse(fields.date.timestampValue);
    const updated = new Date(updateTime).toISOString();
    if (at < start || at >= end || Date.parse(updated) > now.getTime() + 60_000) {
      throw new Error(`${program}: permit calendar response outside its expected date range`);
    }
    const reason = fields.reason?.stringValue.trim();
    if (!reason) continue;
    if (program === "Barrow" && epdSeason && /^annual burn ban$/i.test(reason)) continue;
    if (!latest || updated > latest) latest = updated;
  }
  if (!latest) return [];
  const { sourceName, officialUrl, scopeNote } = PROGRAMS[program];
  return [{
    ...window, fips: county.fips, county: county.name, state: "GA",
    scope: "part", scopeNote, status: "restricted",
    sourceId: sourceId(program), sourceName, sourceUrl: closuresUrl(program), officialUrl, checked, sourceUpdated: latest,
    since: date, expires: date,
    label: "Local residential burn permits suspended",
    note: "The local permit calendar lists a closure for covered residential burning today. Use the county permit page to check the closure and other permit types.",
  }];
}

function makeSource(program: Program): ActiveSource {
  const { sourceName, officialUrl, hours } = PROGRAMS[program];
  return {
    id: sourceId(program), state: "GA", scope: "part",
    sourceName, officialUrl, sourceUrl: closuresUrl(program), stack: "Georgia Burn Permits / Firestore JSON",
    mode: "positive-only", coverage: "restrictions", cadence: { kind: "daily", zone: ZONE, hours },
    staleMs: 8 * 3_600_000,
    async fetch({ now }) {
      const read = pacedTextReader({
        headers: { accept: "application/json", "content-type": "application/json" },
        maxBytes: 32_000, maxResponseAgeMs: 3_600_000,
      });
      const parent = `${REST}/${program.toUpperCase()}`;
      const county = await read(`${parent}?mask.fieldPaths=name&mask.fieldPaths=enabled`);
      if (!programEnabled(JSON.parse(county), program)) return { rows: [] };

      const { validFrom, validUntil } = localDayWindow(localClock(now, ZONE).date, ZONE);
      const body = firestoreTimestampQuery({
        collection: "excludedDates", field: "date", fields: ["date", "reason"],
        from: validFrom, until: validUntil, limit: QUERY_LIMIT,
      });
      const reply = await read(`${parent}:runQuery`, { method: "POST", body: JSON.stringify(body) });
      return { rows: parsePermitCalendar(JSON.parse(reply), program, now) };
    },
  };
}

export const gaPermitCalendars = [makeSource("Barrow"), makeSource("Habersham"), makeSource("Ware")];
