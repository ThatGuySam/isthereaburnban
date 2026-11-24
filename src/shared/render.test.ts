// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { alertText, currentAlerts, renderAlertLineHtml, renderStatusHtml } from "./render";

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
    expect(alertText(redFlag, "OK", NOW)).toBe("Red Flag Warning until 8 PM");
    // Same instant reads an hour earlier in Mountain time.
    expect(alertText(redFlag, "CO", NOW)).toBe("Red Flag Warning until 7 PM");
  });

  test("names the weekday when it ends on another local day", () => {
    const later = { ...redFlag, ends: "2026-11-26T02:00:00Z" };
    expect(alertText(later, "OK", NOW)).toBe("Red Flag Warning until Wed 8 PM");
  });

  test("drops ended alerts and duplicate events", () => {
    const ended = { ...redFlag, event: "Fire Weather Watch", ends: "2026-11-24T17:00:00Z" };
    expect(currentAlerts({ alerts: [redFlag, { ...redFlag, sender: "NWS Norman OK" }, ended] }, NOW)).toHaveLength(1);
    expect(renderAlertLineHtml({ state: "OK", alerts: [ended] }, NOW)).toBe("");
  });

  test("hero markup puts one linked text-style line under the official-source line", () => {
    const html = renderStatusHtml({ ...tulsa, alerts: [redFlag] }, { relativeTimeBase: NOW });
    const meta = html.indexOf('class="status-meta"');
    const alert = html.indexOf('class="status-alert"');
    expect(meta).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(meta);
    expect(html).toContain("⚠︎");
    expect(html).toContain(`href="${redFlag.url}"`);
    expect(html).toContain("Red Flag Warning until 8 PM");
    expect(html.match(/status-alert/g)).toHaveLength(1);
  });

  test("no alerts, no line", () => {
    expect(renderStatusHtml(tulsa, { relativeTimeBase: NOW })).not.toContain("status-alert");
  });
});
