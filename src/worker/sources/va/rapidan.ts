import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { parseLocalDateTime, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://dwr.virginia.gov/wma/rapidan/";
const SIX_HOURS = 6 * 60 * 60 * 1000;
const COUNTIES = countiesInState("VA").filter(({ fips }) => fips === "51079" || fips === "51113");
const META = {
  id: "va-dwr-rapidan-fire-restrictions", state: "VA", scope: "part", stack: "WordPress / WMA notice table",
  sourceName: "Virginia Department of Wildlife Resources", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const ISSUE = /^Rapidan WMA:\s*Beginning (.+?), at (\d{1,2}(?::\d{2})? [ap]\.m\.), (.+)$/i;
const LIFT = /^Rapidan WMA:\s*(?:The )?(?:fire ban|fire restrictions?) (?:has|have) been (?:lifted|rescinded)\.$/i;
const FIRE_NOTICE = /\b(?:fire (?:ban|restrictions?)|fires? (?:will be |are )?prohibited|(?:campfire|burning) (?:ban|restrictions?))\b/i;
const PARK_REFERENCE = " Shenandoah National Park, which borders the WMA, also has a fire ban in place.";
// Check the complete terms so a new end date, activity, or footprint needs review.
const OPEN_ENDED_ORDER = "fires will be prohibited in Rapidan Wildlife Management Area due to exceptionally dry conditions and elevated wildfire risk affecting the area. " +
  "This restriction only affects Rapidan WMA and includes all wood, charcoal, coal or other solid fuel open air fires. " +
  "Visitors may use pressurized gas-fuel camp stoves and backpacking stoves.";

export function parseRapidanAlerts({ blocks, tables }: HtmlParts, now: Date): CountyStatus[] {
  const overview = blockAfterHeading(blocks, /^Overview$/);
  if (!blocks.some(({ tag, text }) => tag === "h1" && text === "Rapidan WMA") ||
    !overview.some(({ text }) => /in Madison and Greene Counties\./.test(text))) {
    throw new Error("Virginia DWR: Rapidan WMA page or county footprint changed");
  }
  const notices = tables.filter(({ heading }) => heading === "Important Notices for this WMA");
  if (!notices.length && !blocks.some(({ text }) => text === "Important Notices for this WMA")) return [];
  if (notices.length !== 1 || notices[0].rows[0]?.join() !== "Notice" || notices[0].rows.some((row) => row.length !== 1)) {
    throw new Error("Virginia DWR: unexpected Rapidan notice table");
  }

  const relevant = notices[0].rows.slice(1).map(([text]) => text.replace(PARK_REFERENCE, "")).filter((text) => FIRE_NOTICE.test(text));
  if (!relevant.length || (relevant.length === 1 && LIFT.test(relevant[0]))) return [];
  const issue = relevant.length === 1 && ISSUE.exec(relevant[0]);
  if (!issue || issue[3] !== OPEN_ENDED_ORDER) throw new Error("Virginia DWR: unrecognized Rapidan fire restriction terms");
  const since = parseWeekdayDate(issue[1]);
  const validFrom = since && parseLocalDateTime(`${since} ${issue[2]}`, US_ZONES.Eastern);
  if (!since || !validFrom) throw new Error("Virginia DWR: unrecognized Rapidan fire restriction time");

  return COUNTIES.map(({ fips, name }) => ({
    fips, county: name, state: META.state, status: "ban", sourceId: META.id, scope: META.scope,
    scopeNote: "Within Rapidan Wildlife Management Area", label: "Rapidan WMA solid-fuel fire prohibition",
    note: "Virginia DWR prohibits open solid-fuel fires within Rapidan WMA. Pressurized gas camp stoves and backpacking stoves are allowed.",
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    checked: now.toISOString(), sourceUpdated: null, since, expires: null, validFrom,
  }));
}

export const vaRapidanAlerts: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", cadence: { kind: "hourly" }, staleMs: SIX_HOURS,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 256_000, maxResponseAgeMs: SIX_HOURS,
    });
    if (reply.notModified) throw new Error("Unexpected Rapidan WMA 304");
    return { rows: parseRapidanAlerts(await extractHtml(reply.response), now) };
  },
};
