import type { EvidenceTiming, FireWeatherAlert } from "./types";

export const DEFAULT_STALE_MS = 48 * 3_600_000;

export function checkDeadline(checked: string | null | undefined, staleMs = DEFAULT_STALE_MS): number {
  const time = checked ? Date.parse(checked) : NaN;
  return Number.isFinite(time) ? time + staleMs : -Infinity;
}

export function evidenceDeadline({ checked, staleMs, validUntil, ruleReview }: EvidenceTiming): number {
  const freshness = ruleReview ? Date.parse(ruleReview.reviewBy) : checkDeadline(checked, staleMs);
  return Math.min(freshness, validUntil ? Date.parse(validUntil) : Infinity);
}

export function evidenceInEffect(report: EvidenceTiming, now: number): boolean {
  return (!report.validFrom || Date.parse(report.validFrom) <= now) && now < evidenceDeadline(report);
}

export function nextEvidenceBoundary(report: EvidenceTiming, now: number): number {
  const end = evidenceDeadline(report);
  const start = report.validFrom ? Date.parse(report.validFrom) : -Infinity;
  if (!(end > now) || start >= end) return Infinity;
  return start > now ? start : end;
}

export function fireWeatherDeadline({ ends, expires }: Pick<FireWeatherAlert, "ends" | "expires">): number {
  if (!ends && !expires) return -Infinity;
  return Math.min(ends ? Date.parse(ends) : Infinity, expires ? Date.parse(expires) : Infinity);
}
