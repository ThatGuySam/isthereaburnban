import { calendarStatusRows, type CalendarRule } from "./calendar";
import { reviewedHtmlDigest } from "./html";
import { fetchSource } from "./http";
import { manualPdf } from "./pdf";
import type { ActiveSource } from "../types";

export type LocalCalendarRule = Pick<CalendarRule, "label" | "note" | "scopeNote" | "seasons" | "hours">;
export type LocalCalendarEvidence = { digest: string } & (
  | { kind: "html"; selector: string; startsWith?: string }
  | { kind: "pdf" }
);
type Publisher = Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
type ReviewedLocalCalendar = {
  publisher: Publisher & { scope: "county" | "part" };
  county: { fips: string; name: string };
  rule: LocalCalendarRule;
  review: LocalCalendarEvidence;
  zone: string;
  hour: number;
};

/** Poll the reviewed document before applying the standing local restriction. */
export function reviewedLocalCalendar({ publisher, county, rule, review, zone, hour }: ReviewedLocalCalendar) {
  async function parse(input: Response, now: Date) {
    const digest = review.kind === "html"
      ? await reviewedHtmlDigest(input, review.selector, review.startsWith)
      : (await manualPdf(input)).sha256;
    if (digest !== review.digest) throw new Error(`${publisher.id}: reviewed local burning rule changed`);
    return calendarStatusRows({
      ...rule, zone, state: publisher.state, scope: publisher.scope, officialUrl: publisher.officialUrl, status: "restricted",
    }, [county], publisher, now, { includeTomorrow: true, includeSeasonDates: true });
  }

  const source: ActiveSource = {
    ...publisher, mode: "positive-only", coverage: "restrictions", recurring: true,
    cadence: { kind: "daily", zone, hours: [hour] },
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, {
        headers: { accept: review.kind === "html" ? "text/html" : "application/pdf" },
      });
      if (reply.notModified) throw new Error(`Unexpected ${publisher.id} 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}
