import type { ActiveSource, SourceResult } from "../types";
import { BlockedError, HttpError, SourceNetworkError, type Validators } from "./http";

export const VERIFICATION_GRACE_MS = 30 * 24 * 60 * 60_000;

export type Verification = {
  lastVerified?: string;
  staleSince?: string;
  rejected?: boolean;
};

function unavailable(reason: unknown): boolean {
  return reason instanceof BlockedError || reason instanceof SourceNetworkError ||
    (reason instanceof HttpError && (reason.status === 408 || reason.status === 429 || reason.status >= 500)) ||
    (reason instanceof Error && reason.name === "TimeoutError");
}

export async function verifySource(
  source: ActiveSource, context: { now: Date; validators?: Validators }, previous?: Verification,
): Promise<
  | { result: SourceResult; verification?: Verification; warning?: string }
  | { reason: unknown; verification?: Verification; discard?: boolean }
> {
  const pinnedRows = source.pinnedRows;
  try {
    const result = await source.fetch(context);
    return { result, verification: pinnedRows ? { lastVerified: context.now.toISOString() } : undefined };
  } catch (reason) {
    if (!pinnedRows) return { reason };
    if (!unavailable(reason)) return { reason, verification: { ...previous, rejected: true }, discard: true };
    if (previous?.rejected) return { reason, verification: previous, discard: true };

    const { now } = context;
    const staleSince = previous?.staleSince ?? now.toISOString();
    const lastVerified = previous?.lastVerified;
    const verification = { lastVerified, staleSince };
    const warning = `verification stale since ${staleSince.slice(0, 10)}`;
    if (now.getTime() - Date.parse(lastVerified ?? staleSince) >= VERIFICATION_GRACE_MS) {
      return { reason: new Error(`${warning}: 30-day verification grace expired`, { cause: reason }), verification, discard: true };
    }
    return { result: { rows: pinnedRows(now), validators: context.validators }, verification, warning };
  }
}
