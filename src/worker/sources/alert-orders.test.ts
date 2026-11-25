// @ts-nocheck -- Bun tests run outside the Worker tsconfig.
import { expect, test } from "bun:test";
import { alertNotices } from "../snapshot";
import { mergeSources } from "./merge";

const fips = "40143";
const source = { id: "fixture", state: "OK", scope: "county", mode: "positive-only" };
const ban = { fips, state: "OK", county: "Tulsa County", status: "ban", label: "County Burn Ban",
  since: "2026-11-24", expires: "2026-11-27", sourceUpdated: null,
  sourceName: "County issuer", sourceUrl: "https://example.gov", officialUrl: "https://example.gov" };
const clear = { ...ban, status: "none", label: "No burn ban", since: null, expires: null };

function publish(prev, day, rows, options = {}) {
  const now = new Date(Date.UTC(2026, 10, 24 + day, 18));
  const checked = now.toISOString();
  const { snapshot, transitions } = mergeSources(prev?.snapshot ?? null, [
    { source, rows, checked, ...options },
  ], now);
  return { snapshot, notices: alertNotices(transitions, snapshot) };
}

test("an empty bootstrap followed by a verified order sends once, across both outages and sparse disappearance", () => {
  const bootstrap = publish(null, 0, []);
  const added = publish(bootstrap, 1, [ban]);
  expect(added.notices.map(({ title }) => title)).toEqual(["Burn ban: Tulsa County, OK"]);
  const failed = publish(added, 4, [ban], { error: "outage", lastGood: "2026-11-25T18:00:00Z" });
  expect(failed.snapshot.counties[fips].status).toBe("unknown");
  expect(failed.notices).toEqual([]);
  const recovered = publish(failed, 5, [ban]);
  expect(recovered.notices).toEqual([]);
  const missing = publish(recovered, 6, []);
  expect(missing.notices).toEqual([]);
  expect(publish(missing, 7, [ban]).notices).toEqual([]);
});

test("verified extensions and clears alert even after an unknown publication", () => {
  const full = { ...source, mode: "full" };
  const bootstrap = publish(null, 0, [ban], { source: full });
  expect(bootstrap.notices).toEqual([]);
  const longer = { ...ban, expires: "2026-12-05", sourceUpdated: "2026-11-25" };
  const extended = publish(bootstrap, 1, [longer], { source: full });
  expect(extended.notices.map(({ title }) => title)).toEqual(["Burn ban extended: Tulsa County, OK"]);
  expect(extended.notices[0].body).toContain("Dec 5, 2026");
  const failed = publish(extended, 4, [longer], { source: full, error: "outage", lastGood: "2026-11-25T18:00:00Z" });
  const lifted = publish(failed, 5, [clear], { source: full });
  expect(lifted.notices.map(({ title }) => title)).toEqual(["Burn ban lifted: Tulsa County, OK"]);
  expect(publish(lifted, 6, [clear], { source: full }).notices).toEqual([]);
});

test("a signed lift can close an omitted order without announcing a countywide all-clear", () => {
  const issuer = { ...source, id: "signed-orders" };
  const step = (prev, day, reports, issuerReports) => {
    const now = new Date(Date.UTC(2026, 10, 24 + day, 18));
    return mergeSources(prev?.snapshot ?? null, [
      { source, rows: reports, checked: now.toISOString() },
      { source: issuer, rows: issuerReports, checked: now.toISOString() },
    ], now);
  };
  const baseline = step(null, 0, [ban], []);
  const rescission = { ...clear, documentId: "rescission-22", issuerFor: source.id, validFrom: "2026-11-25T00:00:00Z" };
  const disagreement = step(baseline, 1, [ban], [rescission]);
  expect(disagreement.transitions).toEqual([]);
  const resolved = step(disagreement, 2, [], [rescission]);
  expect(resolved.snapshot.counties[fips].status).toBe("unknown");
  expect(alertNotices(resolved.transitions, resolved.snapshot)[0].title).toBe("Burn ban lifted: Tulsa County, OK");
  expect(step(resolved, 3, [], [rescission]).transitions).toEqual([]);
});

test("the first successful fetch of a newly added source seeds its order without alerting", () => {
  const configured = publish(null, 0, [], { source: { ...source, id: "other" } });
  const failed = publish(configured, 1, [], { error: "unreachable" });
  const firstSuccess = publish(failed, 2, [ban]);
  expect(firstSuccess.notices).toEqual([]);
  expect(firstSuccess.snapshot.counties[fips].status).toBe("ban");
  const next = publish(firstSuccess, 3, [{ ...ban, since: "2026-11-27", expires: "2026-12-05" }]);
  expect(next.notices.map(({ title }) => title)).toEqual(["Burn ban: Tulsa County, OK"]);
});
