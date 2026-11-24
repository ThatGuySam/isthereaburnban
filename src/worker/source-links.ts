import type { SnapshotData } from "../shared/types";
import { ADAPTERS, type Adapter } from "./adapters";
import { SOURCES } from "./sources/registry";

const BY_ID = new Map(SOURCES.map((source) => [source.id, source]));
const LEGACY_BY_STATE = new Map(ADAPTERS.map((source) => [source.state, source]));

/** Apply current links without replacing a scoped or per-order link with a state directory link. */
export function withCurrentLinks<T extends Pick<SnapshotData, "counties">>(snapshot: T, adapters?: Adapter[]): T {
  const legacy = adapters ? new Map(adapters.map((a) => [a.state, a])) : LEGACY_BY_STATE;
  for (const row of Object.values(snapshot.counties)) {
    const source = row.sourceId && !adapters ? BY_ID.get(row.sourceId) : legacy.get(row.state);
    if (!source) continue;
    row.sourceName = source.sourceName;
    row.sourceUrl = source.sourceUrl;
    if (!source.keepRowLinks || !row.officialUrl) row.officialUrl = source.officialUrl;
  }
  return snapshot;
}
