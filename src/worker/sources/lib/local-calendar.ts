import { apptegyPageText } from "./apptegy";
import { calendarStatusRows, type CalendarCounty, type CalendarRule } from "./calendar";
import { reviewedEcode360Digest } from "./ecode360";
import { sha256 } from "./hash";
import { htmlStatusBlocks, reviewedAnchoredHtmlDigest, reviewedHeadingDigest, reviewedHtmlDigest } from "./html";
import { fetchSource, isSourceUnavailable } from "./http";
import { manualPdf, matchesPdfEtag } from "./pdf";
import { reviewedRuleFallback, RuleChangedError } from "../statutory-fallback";
import type { ActiveSource } from "../types";

export type LocalCalendarRule = Pick<CalendarRule, "label" | "note" | "scopeNote" | "seasons" | "hours" | "effectiveDates">;
export type LocalCalendarEvidence =
  | { kind: "html"; digest: string; selector: string; startsWith?: string }
  | { kind: "html-blocks"; digest: string; section: string; blocks: string }
  | { kind: "html-heading"; digest: string; selector: string; heading: string }
  | ({ kind: "html-anchors"; digest: string } & Parameters<typeof reviewedAnchoredHtmlDigest>[1])
  | { kind: "html-apptegy-node"; digest: string; pageId: number; nodeId: string }
  | { kind: "html-ecode360"; digest: string; sections: readonly [string, ...string[]] }
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
  reviewedAt?: string;
  standing?: true;
};

async function matchesReview(input: Response, review: LocalCalendarEvidence): Promise<boolean> {
  switch (review.kind) {
    case "html":
      return await reviewedHtmlDigest(input, review.selector, review.startsWith) === review.digest;
    case "html-blocks": {
      const blocks = await htmlStatusBlocks(input, review.section, review.blocks);
      return blocks.length > 0 && await sha256(blocks.join("\n")) === review.digest;
    }
    case "html-heading":
      return await reviewedHeadingDigest(input, review.selector, review.heading) === review.digest;
    case "html-anchors":
      return await reviewedAnchoredHtmlDigest(input, review) === review.digest;
    case "html-apptegy-node":
      return await sha256(apptegyPageText(await input.text(), review.pageId, review.nodeId)) === review.digest;
    case "html-ecode360":
      return await reviewedEcode360Digest(input, review.sections) === review.digest;
    case "pdf":
      return (await manualPdf(input)).sha256 === review.digest;
    case "pdf-etag":
      return matchesPdfEtag(input, review.etag);
  }
}

export function staleVerificationNote(note: string, lastReviewed: string) {
  return `${note} Online verification is stale. The published rule was last manually verified on ${lastReviewed}.`;
}

/** Poll the reviewed document before applying the standing local restriction. */
export function reviewedLocalCalendar({ publisher, counties, rule, review, zone, hour, lastReviewed, reviewedAt, standing }: ReviewedLocalCalendar) {
  function rowsAt(now: Date, note = rule.note) {
    const rows = calendarStatusRows({
      ...rule, note, zone, state: publisher.state, scope: publisher.scope, officialUrl: publisher.officialUrl, status: "restricted",
    }, counties, publisher, now, { includeTomorrow: true, includeSeasonDates: true });
    return standing ? rows.map((row) => ({ ...row, standing })) : rows;
  }

  async function parse(input: Response, now: Date) {
    if (!await matchesReview(input, review)) {
      const message = `${publisher.id}: reviewed local burning rule changed`;
      throw reviewedAt ? new RuleChangedError(message) : new Error(message);
    }
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
        if (isSourceUnavailable(error)) {
          if (reviewedAt) return reviewedRuleFallback(rowsAt(now), reviewedAt, now, error);
          if (lastReviewed) return { rows: rowsAt(now, staleVerificationNote(rule.note, lastReviewed)) };
        }
        throw error;
      }
      if (reply.notModified) throw new Error(`Unexpected ${publisher.id} 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}
