import type { CountyStatus, Snapshot } from "../shared/types";
import { STATES_DIR } from "./counties";
import { DISCLAIMER } from "./lookup";

/** Active bans and restrictions, optionally for one state. */
export function activeBans(snapshot: Snapshot, state?: string) {
  const st = state?.trim().toUpperCase();
  const counties: CountyStatus[] = Object.values(snapshot.counties)
    .filter((c) => (c.status === "ban" || c.status === "restricted") && (!st || c.state === st))
    .sort((a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county));
  const sources = snapshot.sources.filter((s) => !st || s.state === st);
  return { generated: snapshot.generated, counties, sources, disclaimer: DISCLAIMER };
}

export function coverage(snapshot: Snapshot) {
  return { generated: snapshot.generated, states: STATES_DIR, sources: snapshot.sources, disclaimer: DISCLAIMER };
}
