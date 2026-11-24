// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { syncfusionGridRows, webFormsPost } from "./aspnet";
import { arcgisDateOnly, arcgisDistinctUrl, arcgisEditWindow, arcgisLocalDate, arcgisRows, arcgisTimestampOffset, codedDomains, dataLastEditDate, findOperationalLayers, queryArcgis } from "./arcgis";
import { activeRule, calendarDayWindows, calendarStatusRows, CALENDAR_RULES } from "./calendar";
import { civicPlusAlertDetails, civicPlusNotices, civicPlusUrl } from "./civicplus";
import { localDayWindow, parseLocalIsoTimestamp, parseWeekdayDate, reportWindow, weekdayOnOrAfter } from "./dates";
import { decodeFeed, parseCsv, parseDotNetJsonDate, parseFeed, parseJson } from "./feeds";
import { blockAfterHeading, extractHtml, extractHtmlGrid, localClock, parseEndDate, parseHtml, parseLocalDateTime, parseUsDate, US_ZONES } from "./html";
import { BlockedError, fetchSource, HttpError, pacedSourceReader, pacedTextReader, USER_AGENT } from "./http";
import { manualPdf } from "./pdf";
import { parseSharePointItems, parseSharePointPage, sharePointListItems, sharePointListUrl, sharePointRows } from "./sharepoint";
import { ninjaTablesUrl, parseNinjaRows, parseWpItems, parseWpPage, parseWpPageBlocks, wpRestEndpoint, wpRestUrl } from "./wordpress";
import { checkLink, htmlLinks } from "../../../../scripts/check-links";

const data = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const text = (name) => data(name).toString();
const json = (name) => JSON.parse(text(name));
const date = (s) => new Date(s);

test("Syncfusion reads literal JSON rows and rejects computed or ambiguous data sources", () => {
  const rows = [{ name: 'A ]), "quoted"', values: [[1], [2]] }];
  const widget = `<script>new ejs.grids.Grid({"dataSource": ejs.data.DataUtil.parse.isJson(${JSON.stringify(rows)})});</script>`;
  expect(syncfusionGridRows(widget)).toEqual(rows);
  expect(() => syncfusionGridRows(widget + widget)).toThrow("Expected one Syncfusion");
  expect(() => syncfusionGridRows(widget.replace(JSON.stringify(rows), "window.currentRows"))).toThrow("Expected one Syncfusion");
});

test("HTML tables can follow a publisher's text labels instead of heading tags", async () => {
  const markup = '<h2>Orders</h2><p>Stage &amp; status</p><p>Scope</p><table><tr><td>Active</td></tr></table>';
  const options = { tableHeading: ({ tag, text }) => tag === "p" && text === "Stage & status" };
  for (const parts of [parseHtml(markup, options), await extractHtml(markup, options)]) {
    expect(parts.tables).toEqual([{ heading: "Stage & status", id: undefined, rows: [["Active"]] }]);
  }
  expect((await extractHtml(markup)).tables[0].heading).toBe("Orders");
});

test("HTML status grids extract only selected rows and keep cell data", async () => {
  const markup = '<div class="cell">Outside</div><section id="status"><div class="row">' +
    '<span class="cell">One&nbsp;&amp; <strong>Two</strong></span><span class="cell active">On</span>' +
    '<a class="cell" href="/order?p=1&amp;n=2">Order</a></div></section>';
  expect(await extractHtmlGrid(markup, { row: "#status > .row", cell: ".cell" })).toEqual([[
    { text: "One & Two", className: "cell" }, { text: "On", className: "cell active" },
    { text: "Order", className: "cell", href: "/order?p=1&n=2" },
  ]]);
});

test("HTML table cells separate adjacent paragraphs without splitting inline text", async () => {
  const markup = "<table><tr><td><p><a>04-17-24-01</a></p><p><a>Map</a></p></td>" +
    "<td><strong>Year</strong>-round</td></tr></table>";
  for (const parts of [parseHtml(markup), await extractHtml(markup)]) {
    expect(parts.tables[0].rows).toEqual([["04-17-24-01 Map", "Year-round"]]);
  }
});

test("strict HTML and SharePoint sections omit missing and duplicate headings", () => {
  const first = "<h2>Rules</h2><p>First</p>";
  const duplicate = parseHtml(`${first}<h3>Rules</h3><p>Second</p>`);
  const heading = /^Rules$/g;
  const options = { requireUnique: true };
  expect(sharePointListItems(parseHtml(first), heading, options)).toEqual(["First"]);
  expect(sharePointListItems(duplicate, /^Missing$/, options)).toEqual([]);
  expect(sharePointListItems(duplicate, heading, options)).toEqual([]);
  expect(blockAfterHeading(duplicate.blocks, heading)).toEqual([
    { tag: "p", text: "First" }, { tag: "h3", text: "Rules" }, { tag: "p", text: "Second" },
  ]);
});

test("calendar rows keep only covered counties and windows that have not ended", () => {
  const rule = { ...CALENDAR_RULES.AZ, hours: [18 * 60, 8 * 60] };
  const counties = [{ fips: "04013", name: "Maricopa County" }, { fips: "04019", name: "Pima County" }];
  const publisher = { id: "az-example", sourceName: "Publisher", sourceUrl: rule.officialUrl };
  const rows = calendarStatusRows(rule, counties, publisher, date("2026-06-01T18:00:00Z"));
  expect(rows.map(({ fips, sourceId, validFrom, validUntil }) => ({ fips, sourceId, validFrom, validUntil }))).toEqual([{
    fips: "04013", sourceId: "az-example", validFrom: "2026-06-02T01:00:00.000Z", validUntil: "2026-06-02T07:00:00.000Z",
  }]);
});

test("calendar lookahead joins adjacent days and applies the opening day's hours", () => {
  const rule = { ...CALENDAR_RULES.NY, hoursByDay: { "03-16": [8 * 60, 1440] } };
  const counties = [{ fips: "36001", name: "Albany County" }];
  const publisher = { id: "ny-example", sourceName: "Publisher", sourceUrl: rule.officialUrl };
  const now = date("2026-03-16T05:00:00Z");
  expect(activeRule(rule, now)).toBeUndefined();
  expect(activeRule(rule, date("2026-03-16T12:00:00Z"))?.status).toBe("restricted");
  expect(calendarStatusRows(rule, counties, publisher, now, { includeTomorrow: true })).toMatchObject([{
    checked: now.toISOString(), validFrom: "2026-03-16T12:00:00.000Z", validUntil: "2026-03-18T04:00:00.000Z",
  }]);
});

test("calendar rows preserve multiple local scopes for one county", () => {
  const rule = CALENDAR_RULES.NY_FIRE_TOWNS;
  const county = { fips: "36019", name: "Clinton County" };
  const places = [
    { ...county, scopeNote: "Town of Altona" },
    { ...county, scopeNote: "Town of Au Sable" },
    county,
  ];
  const publisher = { id: "ny-example", sourceName: "Publisher", sourceUrl: rule.officialUrl };
  const rows = calendarStatusRows(rule, places, publisher, date("2026-11-24T13:00:00Z"));
  expect(rows.map(({ fips, scope, scopeNote }) => [fips, scope, scopeNote])).toEqual([
    [county.fips, "part", "Town of Altona"],
    [county.fips, "part", "Town of Au Sable"],
    [county.fips, "part", rule.scopeNote],
  ]);
});

test("offset-free ISO timestamps use the stated zone and reject invalid local times", () => {
  expect(parseLocalIsoTimestamp("2026-11-24T00:01:02.1234567", US_ZONES.Central)).toBe("2026-11-24T06:01:02.123Z");
  expect(parseLocalIsoTimestamp("2026-11-24T00:01:02", US_ZONES.Eastern)).toBe("2026-11-24T05:01:02.000Z");
  expect(parseLocalIsoTimestamp("2026-03-08T02:30:00", US_ZONES.Eastern)).toBeNull();
  expect(parseLocalIsoTimestamp("2026-02-30T00:00:00", US_ZONES.Central)).toBeNull();
  expect(parseLocalIsoTimestamp("2026-11-24T00:00:00Z", US_ZONES.Central)).toBeNull();
});

test("publisher-local dates allow a comma before a whole hour with meridiem", () => {
  expect(parseLocalDateTime("Wednesday, November 18, 2026, 9 a.m.", US_ZONES.Pacific)).toBe("2026-11-18T17:00:00.000Z");
  expect(parseLocalDateTime("November 18, 2026, 12 p.m.", US_ZONES.Pacific)).toBe("2026-11-18T20:00:00.000Z");
  expect(parseLocalDateTime("November 18, 2026, 9", US_ZONES.Pacific)).toBeNull();
});

test("weekday-dated headings require a real date and a matching weekday", () => {
  expect(parseWeekdayDate("Tuesday Nov 24", 2026)).toBe("2026-11-24");
  expect(parseWeekdayDate("Thu., January 1, 2026")).toBe("2026-01-01");
  expect(parseWeekdayDate("Tuesday Nov 24")).toBeNull();
  expect(parseWeekdayDate("Monday Nov 24", 2026)).toBeNull();
  expect(parseWeekdayDate("February 29, 2024")).toBeNull();
  expect(parseWeekdayDate("Thursday February 29, 2026")).toBeNull();
});

test("weekday-only forecasts resolve within a bounded publisher-local horizon", () => {
  expect(weekdayOnOrAfter("2026-11-23", "Tuesday", 3)).toBe("2026-11-24");
  expect(weekdayOnOrAfter("2026-12-31", "Sunday", 3)).toBe("2027-01-03");
  expect(weekdayOnOrAfter("2026-11-20", "Monday", 2)).toBeNull();
  expect(weekdayOnOrAfter("2026-11-20", "Friday", 0)).toBe("2026-11-20");
  expect(weekdayOnOrAfter("2026-02-30", "Monday", 3)).toBeNull();
  expect(weekdayOnOrAfter("2026-11-23", "Weekend", 3)).toBeNull();
});

test("ArcGIS DateOnly fields accept only valid ISO calendar dates", () => {
  expect(arcgisDateOnly("2028-02-29")).toBe("2028-02-29");
  for (const value of ["2026-02-29", "11/24/2026", "2026-11-24T00:00:00Z", " 2026-11-24", 1795478400000, null]) {
    expect(arcgisDateOnly(value)).toBeNull();
  }
});

test("ArcGIS TimestampOffset fields require a real date and explicit offset", () => {
  expect(arcgisTimestampOffset("2026-11-24T04:15:00.927-06:00")).toBe("2026-11-24T10:15:00.927Z");
  expect(arcgisTimestampOffset("2026-11-24T04:15:00Z")).toBe("2026-11-24T04:15:00.000Z");
  for (const value of ["2026-11-24T04:15:00", "2026-02-29T04:15:00-06:00", "2026-11-24T24:00:00Z",
    "2026-11-24T04:15:00+24:00", "2026-11-24", 1795478400000, null]) {
    expect(arcgisTimestampOffset(value)).toBeNull();
  }
});

test("ArcGIS distinct queries request only unique attribute combinations", () => {
  const layer = "https://example.gov/arcgis/rest/services/Lands/FeatureServer/0";
  const url = new URL(arcgisDistinctUrl(layer + "/", ["Owner", "Status"], "State = 'WY'"));
  expect(url.origin + url.pathname).toBe(layer + "/query");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    where: "State = 'WY'", outFields: "Owner,Status", returnGeometry: "false", f: "json", returnDistinctValues: "true",
  });
});

test("legacy .NET JSON dates preserve the UTC instant regardless of the optional offset", () => {
  expect(parseDotNetJsonDate("/Date(1795437502000)/")).toEqual(date("2026-11-23T12:38:22Z"));
  expect(parseDotNetJsonDate("/Date(1795437502000-0600)/")).toEqual(date("2026-11-23T12:38:22Z"));
  expect(parseDotNetJsonDate("/Date(-1+0100)/")).toEqual(date("1969-12-31T23:59:59.999Z"));
  expect(parseDotNetJsonDate("/Date(8640000000000001)/")).toBeNull();
  expect(parseDotNetJsonDate("/Date(1795437502000.5)/")).toBeNull();
  expect(parseDotNetJsonDate("1795437502000")).toBeNull();
});

test("HTTP rejects publisher access-denied HTML, including HTTP 200 error documents", async () => {
  const url = "https://burnpermit.fire.ca.gov/current-burn-status/";
  await expect(fetchSource(url, { fetchImpl: async () => new Response(text("akamai.html"), { status: 200 }) })).rejects.toBeInstanceOf(BlockedError);
  await expect(fetchSource(url, { fetchImpl: async () => new Response("?", { status: 403 }) })).rejects.toBeInstanceOf(BlockedError);
  await expect(fetchSource(url, { fetchImpl: async () => new Response("<title>Just a moment...</title>", {
    headers: { "cf-mitigated": "challenge" },
  }) })).rejects.toBeInstanceOf(BlockedError);
  await expect(fetchSource(url, { fetchImpl: async () => new Response(
    '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>', { status: 503 },
  ) })).rejects.toBeInstanceOf(BlockedError);
  await expect(fetchSource(url, { fetchImpl: async () => new Response("challenge", {
    status: 403, headers: { "x-datadome-traffic-rule-response": "block" },
  }) })).rejects.toThrow("DataDome challenge");
  await expect(fetchSource(url, { fetchImpl: async () => new Response(
    '<script>var dd={host:"geo.captcha-delivery.com"}</script>',
  ) })).rejects.toThrow("DataDome challenge");
  await expect(fetchSource(url, { fetchImpl: async () => new Response("missing", { status: 404 }) })).rejects.toBeInstanceOf(HttpError);
});

test("a paced reader spaces same-publisher requests and returns their bounded text", async () => {
  const starts: number[] = [];
  const read = pacedTextReader({ maxBytes: 20, fetchImpl: async (url) => {
    starts.push(Date.now());
    return new Response(new URL(url).pathname);
  } }, 20);
  expect(await read("https://example.gov/metadata")).toBe("/metadata");
  expect(await read("https://example.gov/query")).toBe("/query");
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(19);
});

test("a paced read-only POST can send a different lookup body on each request", async () => {
  const read = pacedTextReader({ method: "POST", headers: { "content-type": "application/json" },
    fetchImpl: async (_, { method, headers, body }) => {
      expect(method).toBe("POST");
      expect(headers.get("content-type")).toBe("application/json");
      return new Response(body);
    },
  }, 0);
  expect(await read("https://example.gov/status", { body: '{"county":1}' })).toBe('{"county":1}');
  expect(await read("https://example.gov/status", { body: '{"county":2}' })).toBe('{"county":2}');
});

test("a paced source reader keeps PDF bytes and response metadata", async () => {
  const bytes = Uint8Array.of(37, 80, 68, 70, 45, 255);
  const read = pacedSourceReader({ fetchImpl: async () => new Response(bytes, {
    headers: { "content-type": "application/pdf", etag: '"pdf-1"' },
  }) }, 0);
  const reply = await read("https://example.gov/rule.pdf");
  expect(reply.notModified).toBe(false);
  expect(reply.validators.etag).toBe('"pdf-1"');
  expect(new Uint8Array(await reply.response.arrayBuffer())).toEqual(bytes);
});

test("HTTP sends validators, retains them on 304 and retries unblocked transient GET failures", async () => {
  const url = "https://example.gov/burn-bans";
  const lastModified = "Mon, 23 Nov 2026 13:00:00 GMT";
  const validators = { etag: '"1"', lastModified };
  let calls = 0;
  const result = await fetchSource(url, { validators, fetchImpl: async (_url, { headers }) => {
    expect(headers.get("if-none-match")).toBe('"1"');
    expect(headers.get("if-modified-since")).toBe(lastModified);
    expect(headers.get("user-agent")).toBe(USER_AGENT);
    return ++calls === 1 ? new Response("busy", { status: 503 }) : new Response(null, { status: 304 });
  } });
  expect(calls).toBe(2);
  expect(result).toEqual({ notModified: true, validators });
});

test("HTTP freshness checks both the response date and cache age when enabled", async () => {
  const url = "https://example.gov/current-alerts";
  const recent = new Date().toUTCString();
  const old = new Date(Date.now() - 120_000).toUTCString();
  const get = (headers) => fetchSource(url, {
    attempts: 1, maxResponseAgeMs: 60_000,
    fetchImpl: async () => new Response("[]", { headers }),
  });
  await expect(get({ date: recent, age: "0" })).resolves.toMatchObject({ notModified: false });
  for (const headers of [{ date: old }, { date: recent, age: "120" }, { date: recent, age: "-1" }, {}]) {
    await expect(get(headers)).rejects.toThrow("stale or undated HTTP response");
  }
});

test("HTTP reliably peeks at a split challenge, preserves a normal body and caps bytes", async () => {
  const url = "https://example.gov/burn-bans";
  const stream = (chunks) => new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  await expect(fetchSource(url, { fetchImpl: async () => new Response(stream(["<h1>Acc", "ess Denied</h1>"])) }))
    .rejects.toBeInstanceOf(BlockedError);
  const reply = await fetchSource(url, { fetchImpl: async () => new Response(stream(["burn ", "ban"])) });
  expect(await reply.response.text()).toBe("burn ban");
  await expect(fetchSource(url, { attempts: 1, fetchImpl: async () => new Response("burn ban"), maxBytes: 5 }))
    .rejects.toThrow("exceeded 5 bytes");
});

test("ArcGIS reads real coded values and traverses a Dashboard to its WebMap", async () => {
  const meta = json("alaska-layer.json");
  expect(codedDomains(meta).get("Status")?.get(4)).toMatch(/open/i);
  expect(dataLastEditDate(meta)).toMatch(/^2026-/);
  const ids = [];
  const layers = await findOperationalLayers("1f6572c92f8d41ec860f461ea433819b", { read: async (url) => {
    const id = new URL(url).pathname.split("/")[5];
    ids.push(id);
    if (id === "1f6572c92f8d41ec860f461ea433819b") return json("fl-dashboard.json");
    if (id === "577458dcce5c4906947e427a3246ad20") return json("fl-webmap.json");
    throw new Error("Unrecognized document " + id);
  } });
  expect(ids).toHaveLength(2);
  expect(layers.some(({ title, url }) => title === "Burn Bans*" && /FeatureServer\/0$/.test(url))).toBe(true);
  expect(() => arcgisRows({ error: { message: "Invalid query" } })).toThrow("Invalid query");
});

test("ArcGIS rejects malformed attributes and can require a complete response", () => {
  const partial = { features: [{ attributes: { FIPS: "26083" } }], exceededTransferLimit: true };
  expect(arcgisRows(partial)).toEqual([{ FIPS: "26083" }]);
  expect(() => arcgisRows(partial, { requireComplete: true })).toThrow("Incomplete");
  expect(() => arcgisRows({ features: [{ attributes: [] }] })).toThrow("attributes");
  expect(() => arcgisRows(null)).toThrow("JSON");
});

test("ArcGIS legacy wall-clock dates use the supplied zone and its DST offset", () => {
  const summer = Date.parse("2026-07-24T23:50:02.321Z");
  const winter = Date.parse("2026-11-23T23:50:02Z");
  expect(arcgisLocalDate(summer, US_ZONES.Eastern)).toBe("2026-07-25T03:50:02.321Z");
  expect(arcgisLocalDate(winter, US_ZONES.Eastern)).toBe("2026-11-24T04:50:02.000Z");
  expect(arcgisLocalDate("unpublished", US_ZONES.Eastern)).toBeNull();
});

test("ArcGIS UTC edit windows expire at the configured row age", () => {
  const edited = Date.parse("2026-11-24T04:50:02.321Z");
  const hour = 3_600_000;
  expect(arcgisEditWindow(edited, new Date(edited), hour)).toEqual({
    sourceUpdated: "2026-11-24T04:50:02.321Z", validUntil: "2026-11-24T05:50:02.321Z",
  });
  expect(arcgisEditWindow(edited, new Date(edited - 1), hour)).toBeUndefined();
  expect(arcgisEditWindow(edited, new Date(edited + hour), hour)).toBeUndefined();
  expect(arcgisEditWindow(String(edited), new Date(edited), hour)).toBeUndefined();
});

test("report windows use the publisher time and reject invalid, future, or expired reports", () => {
  const now = date("2026-11-24T06:00:00Z");
  const publish = "2026-11-24T05:59:00.000Z";
  expect(reportWindow(publish, now, 120_000)).toEqual({
    sourceUpdated: publish, validUntil: "2026-11-24T06:01:00.000Z",
  });
  expect(reportWindow(publish, now, 60_000)).toBeUndefined();
  expect(reportWindow("2026-11-24T06:01:00.000Z", now, 120_000)).toBeUndefined();
  expect(reportWindow("not a timestamp", now, 120_000)).toBeUndefined();
  expect(reportWindow(null, now, 120_000)).toBeUndefined();
});

test("ArcGIS follows the Southwest dashboard's embedded Experience and finds AZ DFFM's layer", async () => {
  const documents = new Map([
    ["aa9ff369dd414b74b69b696b40a1d057", "sw-dashboard.json"],
    ["48b5a9c2048b4464aaaf2d943e96cd1b", "sw-experience.json"],
    ["3cc937c423e44a678da007a70a8f8598", "sw-webmap.json"],
  ]);
  const seen = [];
  const layers = await findOperationalLayers("aa9ff369dd414b74b69b696b40a1d057", { read: async (url) => {
    const id = new URL(url).pathname.split("/")[5];
    seen.push(id);
    return json(documents.get(id));
  } });
  expect(seen).toEqual([...documents.keys()]);
  expect(layers[0].url).toMatch(/AZ_DFFM_Fire_Restrictions_2_view\/FeatureServer\/0$/);
});

test("ArcGIS follows stable offsets or ID batches and rejects partial pages", async () => {
  const layer = "https://example.gov/FeatureServer/0";
  const feature = (OBJECTID) => ({ attributes: { OBJECTID } });
  const fixtures = new Map([
    ["0", { features: [feature(1), feature(2)], exceededTransferLimit: true }],
    ["2", { features: [feature(3)], exceededTransferLimit: false }],
  ]);
  const paged = await queryArcgis(layer, ["OBJECTID"], {
    objectIdField: "OBJECTID", maxRecordCount: 2, advancedQueryCapabilities: { supportsPagination: true },
  }, { read: async (url) => {
    const q = new URL(url).searchParams;
    expect(q.get("orderByFields")).toBe("OBJECTID ASC");
    return fixtures.get(q.get("resultOffset"));
  } });
  expect(paged.map((row) => row.OBJECTID)).toEqual([1, 2, 3]);
  const read = async (url) => {
    const q = new URL(url).searchParams;
    if (q.get("returnIdsOnly")) return { objectIds: [1, 2, 3] };
    return { features: q.get("objectIds").split(",").map((id) => feature(+id)) };
  };
  expect(await queryArcgis(layer, ["OBJECTID"], { maxRecordCount: 2 }, { read })).toEqual(paged);
  await expect(queryArcgis(layer, ["OBJECTID"], { maxRecordCount: 2 }, {
    read: async (url) => new URL(url).searchParams.has("returnIdsOnly") ? { objectIds: [1, 2] } : { features: [feature(1)] },
  })).rejects.toThrow("Incomplete");
});

test("HTML finds heading blocks and extracts table cells through optional end tags", async () => {
  const html = text("kentucky-list.html");
  const parts = parseHtml(html);
  const block = blockAfterHeading(parts.blocks, /^Current Burn Bans$/i);
  expect(block.map(({ text }) => text).slice(-2)).toEqual(["Edmonson", "Grayson"]);
  expect(await extractHtml(new Response(html))).toEqual(parts);
  const table = parseHtml('<h2>Open Burning</h2><table id="t"><tr><th>County<th>Status<tr><td>A &amp; B<td>Burn<br>Ban</table>');
  expect(table.tables).toEqual([{ heading: "Open Burning", id: "t", rows: [["County", "Status"], ["A & B", "Burn Ban"]] }]);
  expect(blockAfterHeading(parseHtml("<h2>Burn Ban</h2><p>First</p><h3>Scope</h3><li>One</li><h2>Other</h2><p>Skip</p>").blocks,
    /burn ban/gi).map(({ text }) => text)).toEqual(["First", "Scope", "One"]);
});

test("streamed HTML keeps text inside captured elements and ignores unrelated content", async () => {
  const html = '<script>' + 'large &amp; uncollected text '.repeat(2048) +
    '</script><div>outside<h2>Fire &amp; <em>weather</em></h2><p>Effective<br>today.</p>' +
    '<a href="/order">Official &amp; current</a>outside</div>';
  expect(await extractHtml(new Response(html), { links: true })).toEqual({
    blocks: [{ tag: "h2", text: "Fire & weather" }, { tag: "p", text: "Effective today." }],
    tables: [], links: [{ href: "/order", text: "Official & current" }],
  });
});

test("US dates validate calendar values and use the publisher's clock", () => {
  expect(parseUsDate("Tue Nov. 24", 2026)).toBe("2026-11-24");
  expect(parseUsDate("2/29/24")).toBe("2024-02-29");
  expect(parseUsDate("5/14/2026")).toBe("2026-05-14");
  expect(parseUsDate("May 14th, 2026")).toBe("2026-05-14");
  expect(parseUsDate("2/29/2026")).toBeNull();
  expect(parseUsDate("Marching 20 2026")).toBeNull();
  expect(parseEndDate("Until further notice")).toEqual({ kind: "open-ended" });
  expect(parseEndDate("unreadable")).toEqual({ kind: "unknown" });
  expect(parseLocalDateTime("Nov. 23, 2026 at 10:52:12 AM", US_ZONES.Central)).toBe("2026-11-23T16:52:12.000Z");
  expect(parseLocalDateTime("2026-03-08 02:30", US_ZONES.Pacific)).toBeNull();
  expect(parseLocalDateTime("2026-11-01 01:30", US_ZONES.Pacific)).toBe("2026-11-01T08:30:00.000Z");
  const now = date("2026-07-01T06:10Z");
  expect(localClock(now, US_ZONES.Eastern)).toEqual({ date: "2026-07-01", minute: 130 });
  expect(localClock(now, US_ZONES.Central)).toEqual({ date: "2026-07-01", minute: 70 });
  expect(localClock(now, US_ZONES.Mountain)).toEqual({ date: "2026-07-01", minute: 10 });
  expect(localClock(now, US_ZONES.Pacific)).toEqual({ date: "2026-06-30", minute: 1390 });
});

test("WordPress parses Faulkner's REST search and Mississippi's Ninja Tables rows", () => {
  expect(parseWpItems(json("faulkner-search.json"))[0]).toMatchObject({ id: 4320, title: "04/04/2026 Burn Ban Lifted" });
  expect(new URL(wpRestUrl("https://county.gov/site", "search", { search: "burn ban" })).pathname).toBe("/site/wp-json/wp/v2/search");
  const url = new URL(ninjaTablesUrl("https://www.mfc.ms.gov", 1775));
  expect(url.pathname).toBe("/wp-admin/admin-ajax.php");
  expect(url.searchParams.get("table_id")).toBe("1775");
  const ms = JSON.parse(readFileSync(new URL("../../adapters/fixtures/ms.json", import.meta.url), "utf8"));
  expect(parseNinjaRows(ms)[0]).toEqual(ms[0].value);
  expect(() => parseWpItems({ code: "rest_forbidden" })).toThrow();
});

test("WordPress builds a custom REST route below a subdirectory install", () => {
  const url = new URL(wpRestEndpoint("https://county.gov/site/", "agency/v2/lookup", { county: "New City" }));
  expect(url.pathname).toBe("/site/wp-json/agency/v2/lookup");
  expect(url.searchParams.get("county")).toBe("New City");
});

test("WordPress validates a published page and keeps its rendered structure", async () => {
  const url = "https://county.gov/fire-status/";
  const expected = { id: 12, url };
  const page = { id: 12, link: url, status: "publish", modified_gmt: "2026-02-03T19:25:00",
    content: { rendered: "<h2>Current</h2><p>Stage 1</p>", protected: false } };
  expect(new URL(wpRestUrl("https://county.gov", "pages/12")).pathname).toBe("/wp-json/wp/v2/pages/12");
  expect(parseWpPage(page, expected)).toEqual({ html: page.content.rendered, modified: "2026-02-03T19:25:00Z" });
  expect(await parseWpPageBlocks(page, expected, new Date("2026-02-03T19:25:00Z"))).toEqual({
    blocks: [{ tag: "h2", text: "Current" }, { tag: "p", text: "Stage 1" }],
    modified: "2026-02-03T19:25:00Z",
  });
  await expect(parseWpPageBlocks(page, expected, new Date("2026-02-03T19:24:59Z")))
    .rejects.toThrow("Future WordPress page update");
  expect(() => parseWpPage({ ...page, id: 18 }, expected)).toThrow("Invalid public WordPress page");
  expect(() => parseWpPage({ ...page, status: "draft" }, expected)).toThrow("Invalid public WordPress page");
  expect(() => parseWpPage({ ...page, modified_gmt: "2026-02-30T19:25:00" }, expected)).toThrow("Invalid public WordPress page");
  expect(() => parseWpPage({ ...page, content: { ...page.content, protected: true } }, expected)).toThrow("Invalid public WordPress page");
});

test("CivicPlus recognizes related links in Placer mobile News Flash, and both desktop families", () => {
  const page = "https://www.placer.ca.gov/m/newsflash/Home/Detail/1898";
  const html = text("placer-newsflash.html");
  expect(civicPlusNotices(parseHtml(html, { links: true }), page).map(({ url }) => url)).toContain("https://www.placer.ca.gov/m/newsflash/Home/Detail/1915");
  expect(civicPlusUrl(page, "alerts")).toBe("https://www.placer.ca.gov/AlertCenter.aspx");
  const links = parseHtml('<a href="/AlertCenter.aspx?AID=15">Active</a><a href="/CivicAlerts.aspx?AID=12">News</a><a href="https://different.gov/AlertCenter.aspx?AID=3">Cross-origin</a>', { links: true });
  expect(civicPlusNotices(links, page).map(({ title }) => title)).toEqual(["Active", "News"]);
});

test("CivicPlus extracts a unique emergency widget without mixing in other headings", () => {
  const widget = "<h2>Current Alert</h2><h3>Alert Type<!-- -->:</h3><p>Stage 1 is active.</p>";
  const read = (html: string) => civicPlusAlertDetails(parseHtml(html), /^Current Alert$/gi);
  expect(read("<h3>Current Alert</h3><p>Menu copy</p>" + widget + "<h2>Other</h2><p>Evergreen rules</p>"))
    .toEqual(["Stage 1 is active."]);
  expect(read(widget + widget)).toEqual([]);
  expect(read(widget.replace("Alert Type", "Example Type"))).toEqual([]);
});

test("WebForms posts Michigan's actual hidden values to the same origin", () => {
  const url = "https://www2.dnr.state.mi.us/burnpermits/";
  const { url: action, body } = webFormsPost(text("michigan-form.html"), url, "ctl00$ContentPlaceHolder1$CntyName", "", {
    "ctl00$ContentPlaceHolder1$CntyName": "Alcona",
  });
  expect(new URL(action).origin).toBe(new URL(url).origin);
  expect(body.get("__VIEWSTATE")?.length).toBeGreaterThan(50);
  expect(body.get("__EVENTVALIDATION")?.length).toBeGreaterThan(50);
  expect(body.get("__EVENTTARGET")).toBe("ctl00$ContentPlaceHolder1$CntyName");
  expect(body.get("ctl00$ContentPlaceHolder1$CntyName")).toBe("Alcona");
  expect(() => webFormsPost('<form action="https://other.gov"><input type=hidden name=__VIEWSTATE value=abc></form>', url, "ctl")).toThrow("Cross-origin");
});

test("SharePoint normalizes a rendered list and both public REST envelopes", () => {
  expect(sharePointListItems(parseHtml(text("kentucky-list.html")), /current burn bans/i).slice(-2)).toEqual(["Edmonson", "Grayson"]);
  const path = sharePointListUrl("https://agency.gov/sites/Forestry", "County's Bans", { $top: "20" });
  expect(new URL(path).pathname).toBe("/sites/Forestry/_api/web/lists/getbytitle('County%27%27s%20Bans')/items");
  const rows = [{ Title: "Edmonson" }];
  expect(parseSharePointItems({ value: rows, "@odata.nextLink": "next" })).toEqual({ rows, next: "next" });
  expect(parseSharePointItems({ d: { results: rows } }).rows).toEqual(rows);
  expect(sharePointRows(parseHtml("<table><tr><td>County<td>Status<tr><td>Edmonson<td>Ban</table>"), ["status", "county"]))
    .toEqual([["Ban", "Edmonson"]]);
});

test("SharePoint page reads one named rich-text field and validates the editorial timestamp", () => {
  const fileName = "Status.aspx";
  const contentField = "Main_x0020_Content";
  const row = { FileLeafRef: fileName, [contentField]: "<p>Reported bans</p>", Modified: "2026-11-20T23:41:51Z" };
  const parse = (data) => parseSharePointPage(data, { fileName, contentField });
  expect(parse({ d: { results: [row] } })).toEqual({ content: row[contentField], modified: "2026-11-20T23:41:51.000Z" });
  expect(() => parse({ value: [row], "@odata.nextLink": "next" })).toThrow("Expected one SharePoint page");
  expect(() => parse({ value: [{ ...row, FileLeafRef: "Other.aspx" }] })).toThrow("Expected one SharePoint page");
  expect(() => parse({ value: [{ ...row, [contentField]: null }] })).toThrow("Missing SharePoint page content");
  expect(() => parse({ value: [{ ...row, Modified: "2026-02-30T23:41:51Z" }] })).toThrow("Invalid SharePoint edit time");
  expect(() => parse({ value: [{ ...row, Modified: "2026-11-20T23:41:51" }] })).toThrow("UTC edit time");
});

test("Feeds parse Wisconsin's real CSV and JSON plus Texas's UTF-16LE RSS", () => {
  const rows = parseCsv(text("wisconsin.csv"));
  expect(rows[1][1]).toBe("Adams");
  expect(rows[1][8]).toContain("DNR annual burning permit");
  expect(parseCsv('a,b\r\n"x,y","line 1\nline 2 ""quoted"""\r\n')).toEqual([["a", "b"], ["x,y", 'line 1\nline 2 "quoted"']]);
  expect(() => parseCsv('"unfinished')).toThrow();
  const wi = parseJson(text("wisconsin.json"), Array.isArray);
  expect(wi[0]).toMatchObject({ COUNTY_NAME: "Adams" });
  const rss = parseFeed(decodeFeed(Uint8Array.from(data("texas-rss.xml")).buffer));
  expect(rss[0].title).toContain("Texas Burn Bans");
  expect(rss[0].text).toContain("ARCHER");
  expect(parseFeed('<feed><entry><id>1</id><title>Burn &amp; Smoke</title><link rel="alternate" href="https://county.gov/order"/><updated>2026-11-23T02:00Z</updated></entry></feed>')[0])
    .toMatchObject({ id: "1", title: "Burn & Smoke", url: "https://county.gov/order", published: "2026-11-23T02:00:00.000Z" });
});

test("Manual PDF records the signed Faulkner order's hash and Last-Modified", async () => {
  const stamp = "Mon, 23 Nov 2026 12:00:00 GMT";
  const pdf = await manualPdf(new Response(data("faulkner-rescind.pdf"), { headers: { "last-modified": stamp } }));
  expect(pdf).toEqual({ mode: "manual", sha256: "d9dc49bc427429701782efee2a23cf05389706e5aaf03ffff8735fe61595366e", lastModified: stamp });
  await expect(manualPdf(new Response("not a pdf"))).rejects.toThrow("Expected a PDF");
});

test("Calendar restrictions respect local windows, covered counties, and narrow activities", () => {
  const { NY, OH, GA, VA, WV, MD } = CALENDAR_RULES;
  expect(activeRule(NY, date("2026-03-16T03:59Z"))).toBeUndefined();
  expect(activeRule(NY, date("2026-03-16T04:00Z"))?.label).toContain("brush");
  expect(activeRule(NY, date("2026-05-15T04:00Z"))).toBeUndefined();
  expect(activeRule(OH, date("2026-11-23T11:00Z"))).toMatchObject({ scope: "part", status: "restricted" });
  expect(activeRule(OH, date("2026-11-23T23:00Z"))).toBeUndefined();
  expect(activeRule(GA, date("2026-07-01T12:00Z"), "Gwinnett County")?.status).toBe("restricted");
  expect(activeRule(GA, date("2026-07-01T12:00Z"), "Chatham County")).toBeUndefined();
  expect(GA.counties.size).toBe(54);
  expect(activeRule(VA, date("2026-02-15T20:59Z"))?.scopeNote).toContain("300 feet");
  expect(activeRule(VA, date("2026-02-15T21:00Z"))).toBeUndefined();
  expect(activeRule(WV, date("2026-03-02T12:00Z"))?.status).toBe("restricted");
  expect(activeRule(MD, date("2026-06-01T12:00Z"))?.note).toContain("Snow cover");
});

test("Calendar day windows follow local midnight across DST and split overnight hours", () => {
  const rule = CALENDAR_RULES.NY;
  expect(calendarDayWindows(rule, date("2026-03-16T03:59Z"))).toEqual([]);
  expect(calendarDayWindows(rule, date("2026-03-16T04:00Z"))).toEqual([
    { validFrom: "2026-03-16T04:00:00.000Z", validUntil: "2026-03-17T04:00:00.000Z" },
  ]);
  expect(calendarDayWindows({ ...rule, seasons: undefined }, date("2026-03-08T12:00Z"))).toEqual([
    { validFrom: "2026-03-08T05:00:00.000Z", validUntil: "2026-03-09T04:00:00.000Z" },
  ]);
  expect(calendarDayWindows({ ...rule, hours: [1320, 120] }, date("2026-03-16T12:00Z"))).toEqual([
    { validFrom: "2026-03-16T04:00:00.000Z", validUntil: "2026-03-16T06:00:00.000Z" },
    { validFrom: "2026-03-17T02:00:00.000Z", validUntil: "2026-03-17T04:00:00.000Z" },
  ]);
});

test("Publisher-local dates include the extra hour at the end of daylight saving time", () => {
  expect(localDayWindow("2026-11-01", US_ZONES.Eastern)).toEqual({
    validFrom: "2026-11-01T04:00:00.000Z", validUntil: "2026-11-02T05:00:00.000Z",
  });
  expect(() => localDayWindow("2026-02-30", US_ZONES.Eastern)).toThrow("Invalid local day");
});

test("Link checker reads external anchors and separates access walls from missing links and TLS", async () => {
  expect(htmlLinks('<a href="/us/ca/">local</a><a href="https://example.gov?a=1&amp;b=2">ext</a><iframe src="//example.gov/table">'))
    .toEqual(["https://example.gov?a=1&b=2", "https://example.gov/table"]);
  const url = "https://example.gov/order";
  expect((await checkLink(url, async () => new Response("", { status: 403 }))).kind).toBe("blocked");
  expect((await checkLink(url, async () => new Response("", { status: 404 }))).kind).toBe("failed");
  expect(await checkLink(url, async () => { throw Object.assign(new Error("TLS verification failed"), { code: "CERT_HAS_EXPIRED" }); }))
    .toMatchObject({ kind: "failed", detail: expect.stringContaining("CERT_HAS_EXPIRED") });
});
