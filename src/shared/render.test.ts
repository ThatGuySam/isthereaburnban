// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { alertText, currentAlerts, renderAlertLineHtml, renderReportDetailsHtml, renderStatusHtml } from "./render";

// 2026-11-24 12:00 CST
const NOW = Date.parse("2026-11-24T18:00:00Z");
const redFlag = {
  event: "Red Flag Warning",
  headline: "Red Flag Warning issued November 24 at 4:02AM CST until November 24 at 8:00PM CST by NWS Tulsa OK",
  onset: "2026-11-24T16:00:00Z",
  expires: "2026-11-24T14:00:00Z",
  ends: "2026-11-25T02:00:00Z",
  url: "https://alerts.weather.gov/search?id=urn:oid:2.49.0.1.840.0.abc",
  sender: "NWS Tulsa OK",
};
const tulsa = {
  fips: "40143", state: "OK", county: "Tulsa County", status: "none", label: "None",
  since: null, expires: null, sourceUpdated: null, checked: "2026-11-24T17:07:00Z",
  sourceName: "Oklahoma Forestry Services", sourceUrl: "https://example.test/feed", officialUrl: "https://example.test/official",
};

describe("NWS fire-weather line", () => {
  test("uses ends before expires, on the county's clock", () => {
    expect(alertText(redFlag, "OK", NOW)).toBe("Red Flag Warning until 8 PM CST");
    // Same instant reads an hour earlier in Mountain time.
    expect(alertText(redFlag, "CO", NOW)).toBe("Red Flag Warning until 7 PM MST");
  });

  test("names the weekday when it ends on another local day", () => {
    const later = { ...redFlag, ends: "2026-11-26T02:00:00Z" };
    expect(alertText(later, "OK", NOW)).toBe("Red Flag Warning until Wed 8 PM CST");
  });

  test("drops ended alerts and duplicate events", () => {
    const ended = { ...redFlag, event: "Fire Weather Watch", ends: "2026-11-24T17:00:00Z" };
    expect(currentAlerts({ alerts: [redFlag, { ...redFlag, sender: "NWS Norman OK" }, ended] }, NOW)).toHaveLength(1);
    expect(renderAlertLineHtml({ state: "OK", alerts: [ended] }, NOW)).toBe("");
  });

  test("details show one linked weather alert with an explicit time zone", () => {
    const html = renderStatusHtml({ ...tulsa, alerts: [redFlag] }, { relativeTimeBase: NOW });
    expect(html).toContain('class="status-meta"');
    expect(html).not.toContain('class="status-alert"');
    expect(renderReportDetailsHtml({ ...tulsa, alerts: [redFlag] }, NOW)).toContain("Red Flag Warning until 8 PM CST");
    const detail = renderReportDetailsHtml({ ...tulsa, alerts: [redFlag] }, NOW);
    expect(detail).toContain("⚠︎");
    expect(detail).toContain(`href="${redFlag.url}"`);
    expect(detail.match(/status-alert/g)).toHaveLength(1);
  });

  test("no alerts, no line", () => {
    expect(renderStatusHtml(tulsa, { relativeTimeBase: NOW })).not.toContain("status-alert");
  });
});

test("the headline keeps the scoped answer and source while details carry dates and exemptions", () => {
  const report = { ...tulsa, status: "restricted", scope: "part", scopeNote: "Tulsa Fire District",
    label: "Burn ban in Tulsa Fire District", note: "Exemptions apply to covered permits.",
    since: "2026-11-20", firstSeenAt: "2026-11-21T17:00:00Z", statusChangedAt: "2026-11-22T17:00:00Z",
    sourceUpdated: "2026-11-23T20:00:00Z" };
  const hero = renderStatusHtml(report, { relativeTimeBase: NOW });
  expect(hero).toContain("Burn ban in Tulsa Fire District");
  expect(hero).toContain("checked");
  expect(hero).not.toContain("Exemptions apply");
  expect(hero).not.toContain("Nov 20, 2026");
  const detail = renderReportDetailsHtml(report, NOW);
  for (const item of ["Effective", "First recorded", "Published status changed", "Publisher report date", "Exemptions apply"]) {
    expect(detail).toContain(item);
  }
});
