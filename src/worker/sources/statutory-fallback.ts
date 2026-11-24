import { shortDate } from "../../shared/render";
import type { CountyStatus, RuleReview } from "../../shared/types";

const REVIEW_INTERVAL_MS = 180 * 86_400_000;

export const reviewWindow = ({ reviewedAt, reviewBy }: RuleReview) => Date.parse(reviewBy) - Date.parse(reviewedAt);

export function reviewedRuleFallback(rows: CountyStatus[], reviewedAt: string, now: Date, reason: unknown) {
  const time = Date.parse(reviewedAt);
  const reviewBy = new Date(time + REVIEW_INTERVAL_MS).toISOString();
  if (now.getTime() < time || now.getTime() >= Date.parse(reviewBy)) throw new Error("Pinned statutory rule is beyond its review deadline", { cause: reason });
  const note = `Current guidance could not be verified. The statutory rule was last reviewed on ${shortDate(reviewedAt)}.`;
  return {
    rows: rows.map((row) => ({ ...row, note: [row.note, note].filter(Boolean).join(" ") })),
    fallback: { reviewedAt, reviewBy, reason: reason instanceof Error ? reason.message : String(reason) },
  };
}
