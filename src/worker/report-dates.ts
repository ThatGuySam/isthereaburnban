import type { CountyStatus } from "../shared/types";

/** Historic summaries mixed publisher effective dates with dates inferred by the merge. */
export function withReportDates(row: CountyStatus): CountyStatus {
  if (row.firstSeenAt !== undefined) return row;
  return { ...row, since: null, firstSeenAt: null, statusChangedAt: null };
}
