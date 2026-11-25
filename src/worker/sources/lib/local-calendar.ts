import { calendarStatusRows, type CalendarCounty, type CalendarRule } from "./calendar";
import { reviewedHeadingDigest, reviewedHtmlDigest } from "./html";
import { fetchSource, isSourceUnavailable } from "./http";
import { manualPdf } from "./pdf";
import type { ActiveSource } from "../types";

export type LocalCalendarRule = Pick<CalendarRule, "label" | "note" | "scopeNote" | "seasons" | "hours">;
export type LocalCalendarEvidence =
  | { kind: "html"; digest: string; selector: string; startsWith?: string }
  | { kind: "html-heading"; digest: string; selector: string; heading: string }
  | { kind: "pdf"; digest: string }
  | { kind: "pdf-etag"; etag: string };
type Publisher = Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
type ReviewedLocalCalendar = {
  publisher: Publisher & { scope: "county" | "part" };
  counties: readonly CalendarCounty[];
  rule: LocalCalendarRule;
  review: LocalCalendarEvidence;
  zone: string;
  hour: number;
  lastReviewed?: string;
};

async function matchesReview(input: Response, review: LocalCalendarEvidence): Promise<boolean> {
  switch (review.kind) {
    case "html":
      return await reviewedHtmlDigest(input, review.selector, review.startsWith) === review.digest;
    case "html-heading":
      return await reviewedHeadingDigest(input, review.selector, review.heading) === review.digest;
    case "pdf":
      return (await manualPdf(input)).sha256 === review.digest;
    case "pdf-etag":
      // A strong validator identifies the exact document version reviewed by hand.
      return input.status === 200 && /^application\/pdf\b/i.test(input.headers.get("content-type") ?? "") &&
        /^"[^"]+"$/.test(review.etag) && input.headers.get("etag") === review.etag;
  }
}

export function staleVerificationNote(note: string, lastReviewed: string) {
  return `${note} Online verification is stale. The published rule was last manually verified on ${lastReviewed}.`;
}

/** Poll the reviewed document before applying the standing local restriction. */
export function reviewedLocalCalendar({ publisher, counties, rule, review, zone, hour, lastReviewed }: ReviewedLocalCalendar) {
  function rowsAt(now: Date, note = rule.note) {
    return calendarStatusRows({
      ...rule, note, zone, state: publisher.state, scope: publisher.scope, officialUrl: publisher.officialUrl, status: "restricted",
    }, counties, publisher, now, { includeTomorrow: true, includeSeasonDates: true });
  }

  async function parse(input: Response, now: Date) {
    if (!await matchesReview(input, review)) throw new Error(`${publisher.id}: reviewed local burning rule changed`);
    return rowsAt(now);
  }

  const source: ActiveSource = {
    ...publisher, mode: "positive-only", coverage: "restrictions", recurring: true,
    keepRowLinks: counties.some(({ officialUrl }) => officialUrl !== undefined) || undefined,
    cadence: { kind: "daily", zone, hours: [hour] },
    async fetch({ now }) {
      let reply;
      try {
        reply = await fetchSource(publisher.sourceUrl, {
          method: review.kind === "pdf-etag" ? "HEAD" : "GET",
          headers: { accept: review.kind.startsWith("html") ? "text/html" : "application/pdf" },
        });
      } catch (error) {
        if (!lastReviewed || !isSourceUnavailable(error)) throw error;
        return { rows: rowsAt(now, staleVerificationNote(rule.note, lastReviewed)) };
      }
      if (reply.notModified) throw new Error(`Unexpected ${publisher.id} 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}
