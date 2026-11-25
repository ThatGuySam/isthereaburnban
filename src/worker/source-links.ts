import type { CountyStatus, SnapshotData } from "../shared/types";
import { ADAPTERS, type Adapter } from "./adapters";
import { SOURCES } from "./sources/registry";

const BY_ID = new Map(SOURCES.map((source) => [source.id, source]));
const LEGACY_BY_STATE = new Map(ADAPTERS.map((source) => [source.state, source]));

function updateLinks(row: CountyStatus, source: Pick<Adapter, "sourceName" | "sourceUrl" | "officialUrl" | "keepRowLinks"> | undefined) {
  if (!source) return;
  row.sourceName = source.sourceName;
  if (!row.sourceUrl || (!row.sourceId && !source.keepRowLinks)) row.sourceUrl = source.sourceUrl;
  if (!source.keepRowLinks || !row.officialUrl) row.officialUrl = source.officialUrl;
}

export function withCurrentCountyLinks(row: CountyStatus) {
  updateLinks(row, row.sourceId ? BY_ID.get(row.sourceId) : LEGACY_BY_STATE.get(row.state));
}

/** Apply current links without replacing a scoped or per-order link with a state directory link. */
export function withCurrentLinks<T extends Pick<SnapshotData, "counties">>(snapshot: T, adapters?: Adapter[]): T {
  const legacy = adapters ? new Map(adapters.map((a) => [a.state, a])) : undefined;
  for (const row of Object.values(snapshot.counties)) {
    if (legacy) updateLinks(row, legacy.get(row.state));
    else withCurrentCountyLinks(row);
  }
  return snapshot;
}
