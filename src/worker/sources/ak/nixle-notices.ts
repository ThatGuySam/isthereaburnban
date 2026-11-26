import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { localClock, parseLocalDateTime, parseUsDate, parseWeekdayDate, reportWindow, US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import { nixleNotice, nixleWire } from "../lib/nixle";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Alaska;
const HOUR = 60 * 60 * 1000;
const NOTICE_LIFETIME = 24 * HOUR;
const RECHECK_WINDOW = 2 * HOUR;
const NIXLE_WIRE = "https://local.nixle.com/";
const BURN_HEADLINE = /^(?:Correction: )?(?:Burn (?:Ban|Permit (?:Ban|Suspension|Restriction)|Restriction)|Total Burn Ban|Fire Danger is Moderate\. Burning is now allowed|Fire Danger has reached Very High, Campfires are not allowed)\b/i;

type BurnDecision = {
  status: "ban" | "restricted";
  since?: string;
  effective?: string;
  label: string;
  note: string;
};

const HAINES_PERMIT_NOTE = "The borough suspended burning that requires a permit. Campfires in rings and barbecue grills are exempt from the permit suspension.";
const HAINES_PERMIT = { status: "restricted", label: "Haines burn permits suspended", note: HAINES_PERMIT_NOTE } as const;

function hainesDecision(title: string, body: string): BurnDecision | undefined {
  if (title === body && (title === "Burn Ban has been lifted. Burning conditions lowered to Moderate." ||
      title === "Fire danger is Moderate. Burning is now allowed per the permitted process.")) return;

  if (title === "Burn Permit Suspension") {
    const start = /^Starting (\d{1,2}\/\d{1,2}\/\d{4}) at (\d{1,2}:\d{2}[AP]M), the Haines Borough will be entering a burn permit suspension\. Any fires covered under a burn permit will not be permitted due to [^.]+\. Campfires in fire rings and BBQ grills are still permitted during a burn permit suspension\. For more information on burn permits, visit the borough website at: https:\/\/www\.hainesalaska\.gov\/fire\/page\/burn-permits$/.exec(body);
    const since = start && parseUsDate(start[1]);
    const effective = start && parseLocalDateTime(`${start[1]} ${start[2]}`, ZONE);
    if (since && effective) return { ...HAINES_PERMIT, since, effective };
  }
  if (title === "Correction: Burn Permit Ban in Effect" && (
    body === "Due to weather conditions and fires in the area, a Haines Borough Burn Permit Ban is in effect until further notice." ||
    body === "A ban on permitted burns is in effect until further notice."
  )) return { status: "restricted", label: "Haines permitted burning suspended", note: "Haines Borough suspended permitted burns until further notice. Check borough dispatch for the current restrictions and exemptions." };

  if (title === body && title === "FIRE DANGER HAS REACHED VERY HIGH, CAMPFIRES ARE NOT ALLOWED. ATTENDED BBQ GRILLS AND SMOKE HOUSES ALLOWED") {
    return {
      status: "restricted", label: "Haines campfires prohibited",
      note: "Haines Borough prohibited campfires under very high fire danger. The notice allows attended barbecue grills and smokehouses. Check borough dispatch for other restrictions.",
    };
  }
  throw new Error("Haines: unrecognized burn notice");
}

function skagwayDecision(title: string, body: string, publicationDay: string): BurnDecision | undefined {
  if (title === "Burn Ban has been Lifted - Open burning now permitted" &&
      body.startsWith("The Skagway Fire Department has lifted the burn ban due to a reduction in fire danger. Open burning is now permitted,")) return;

  const date = /^Total burn ban for the Municipality of Skagway as of (\d{2}\/\d{2}\/\d{2,4})$/.exec(title)?.[1];
  if (date && parseUsDate(date) === publicationDay &&
      body === "NO open burning is allowed anywhere within Municipality boundaries. This includes: - Campfires, bonfires, and debris burning - Portable outdoor fireplaces and fire pits (wood-burning or propane) - Fireworks or any open-flame devices capable of igniting dry vegetation Charcoal and propane grills on private property are permitted only with extreme caution and constant attendance.") {
    return {
      status: "ban", since: publicationDay, label: "Skagway municipal burn ban",
      note: "The municipality prohibited open burning, including campfires, debris burns and portable fire pits. The notice allows attended charcoal and propane grills on private property with extreme caution.",
    };
  }
  throw new Error("Skagway: unrecognized burn notice");
}

const publishers = {
  haines: {
    id: "ak-haines-borough-nixle", fips: "02100", sourceName: "Haines Borough Police Department", slug: "haines-borough-police-department",
    scope: "part", scopeNote: "Haines Borough fire service areas", decide: hainesDecision,
  },
  skagway: {
    id: "ak-skagway-nixle", fips: "02230", sourceName: "Skagway Police Department", slug: "skagway-police-department",
    scope: "county", scopeNote: undefined, decide: skagwayDecision,
  },
} as const;

export type AkNixlePublisher = keyof typeof publishers;

function noticeTime(value: string) {
  const stamp = /^(.+) :: (\d{2}:\d{2} [ap]\.m\.) (AKST|AKDT)$/.exec(value);
  const day = stamp && parseWeekdayDate(stamp[1]);
  const instant = day && stamp && parseLocalDateTime(`${day} ${stamp[2]}`, ZONE);
  if (!day || !instant || !stamp) throw new Error("Nixle: invalid Alaska publication timestamp");
  const offset = Date.parse(instant) - Date.parse(`${day}T00:00:00Z`) - localClock(new Date(instant), ZONE).minute * 60_000;
  if (offset !== (stamp[3] === "AKST" ? 9 : 8) * HOUR) throw new Error("Nixle: inconsistent Alaska publication time zone");
  return { day, instant };
}

export async function parseAkNixleNotice(
  name: AkNixlePublisher, input: Response | string, readNotice: (url: string) => Promise<Response | string>, now: Date,
): Promise<CountyStatus[]> {
  const { id, fips, sourceName, slug, scope, scopeNote, decide } = publishers[name];
  const items = await nixleWire(input, sourceName);
  const latest = items.find(({ title }) => BURN_HEADLINE.test(title));
  if (!latest) return [];

  const detail = await nixleNotice(await readNotice(latest.url), sourceName, slug, latest.title);
  const { day, instant } = noticeTime(detail.published);
  if (detail.expired || !reportWindow(instant, now, NOTICE_LIFETIME)) return [];

  const decision = decide(latest.title, detail.body, day);
  if (!decision) return [];
  const { status, label, note, since = null, effective = instant } = decision;
  const checked = now.toISOString();
  if (effective > checked) return [];

  const county = COUNTY_BY_FIPS.get(fips);
  if (!county) throw new Error(`Unknown Alaska FIPS ${fips}`);
  // The web-message expiration marks freshness, not the legal end of the issuer's order.
  const validUntil = new Date(Math.min(now.getTime() + RECHECK_WINDOW, Date.parse(instant) + NOTICE_LIFETIME)).toISOString();
  return [{
    fips, state: county.state, county: county.name, scope, scopeNote, status, label, note,
    sourceId: id, sourceName, sourceUrl: NIXLE_WIRE + slug, officialUrl: latest.url,
    checked, sourceUpdated: instant, validFrom: effective, validUntil, since, expires: null,
  }];
}

const publisherNames: readonly AkNixlePublisher[] = ["haines", "skagway"];
export const akNixleNotices: ActiveSource[] = publisherNames.map((name) => {
  const { id, sourceName, slug, fips, scope } = publishers[name];
  const sourceUrl = NIXLE_WIRE + slug;
  return {
    id, state: "AK", sourceName, sourceUrl, officialUrl: sourceUrl, scope, stack: "Everbridge Nixle / HTML notices",
    mode: "positive-only", coverage: "restrictions", reportingFips: [fips], keepRowLinks: true,
    cadence: { kind: "hourly" }, staleMs: RECHECK_WINDOW,
    async fetch({ now }) {
      const read = pacedTextReader({ headers: { accept: "text/html" }, maxBytes: 150_000, maxResponseAgeMs: 15 * 60 * 1000, redirect: "error" });
      return { rows: await parseAkNixleNotice(name, await read(sourceUrl), read, now) };
    },
  };
});
