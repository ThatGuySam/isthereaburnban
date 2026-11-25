import { LookupError } from "./lookup";

export const DEFAULT_BANS_LIMIT = 50;
export const MAX_BANS_LIMIT = 100;
export type BansPage = { limit: number; cursor?: string };

export function bansPage(limit?: string | number, cursor?: string): BansPage {
  const size = limit === undefined ? DEFAULT_BANS_LIMIT : Number(limit);
  if ((typeof limit === "string" && !/^[1-9]\d*$/.test(limit)) ||
      !Number.isInteger(size) || size < 1 || size > MAX_BANS_LIMIT) {
    throw new LookupError(`limit must be an integer from 1 to ${MAX_BANS_LIMIT}`, 400);
  }
  return { limit: size, cursor };
}

export function pageStart(page: BansPage, revision: string, length: number) {
  if (page.cursor === undefined) return 0;
  const match = /^([a-z0-9_-]{1,64})\.(0|[1-9]\d{0,4})$/i.exec(page.cursor);
  if (!match) throw new LookupError("Invalid bans cursor", 400);
  if (match[1] !== revision) throw new LookupError("The publication changed. Start again without a cursor.", 409);
  const offset = Number(match[2]);
  if (offset > length) throw new LookupError("Invalid bans cursor", 400);
  return offset;
}

export function pageFields(revision: string, count: number, offset: number, length: number) {
  return { count, nextCursor: offset < length ? `${revision}.${offset}` : null };
}
