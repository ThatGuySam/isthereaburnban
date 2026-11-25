import { parseJson } from "./feeds";
import { attributes, extractHtmlGrid } from "./html";
import { getText } from "./http";

// Inventory: ASP.NET WebForms and DNN, primarily Michigan's township pages and Alabama Forestry.
// Prefer a public detail GET. Post only to the same-origin form published for read-only navigation.
export function webFormsPost(html: string, pageUrl: string, eventTarget: string, eventArgument = "", fields: Record<string, string> = {}) {
  const forms = html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi);
  for (const [, form, content] of forms) {
    const params = new URLSearchParams();
    for (const [, raw] of content.matchAll(/<input\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
      const field = attributes(raw);
      if (field.type?.toLowerCase() === "hidden" && field.name && !("disabled" in field)) params.append(field.name, field.value ?? "");
    }
    if (!params.has("__VIEWSTATE")) continue;
    const url = new URL(attributes(form).action ?? "", pageUrl);
    if (url.origin !== new URL(pageUrl).origin) throw new Error("Cross-origin WebForms action");
    for (const [name, value] of Object.entries(fields)) params.set(name, value);
    params.set("__EVENTTARGET", eventTarget);
    params.set("__EVENTARGUMENT", eventArgument);
    return { url: url.href, body: params };
  }
  throw new Error("No WebForms form with __VIEWSTATE found");
}

export function postBack(html: string, pageUrl: string, eventTarget: string, eventArgument?: string, fields?: Record<string, string>, cookie?: string): Promise<string> {
  const { url, body } = webFormsPost(html, pageUrl, eventTarget, eventArgument, fields);
  return getText(url, { method: "POST", body, headers: cookie ? { cookie } : undefined, redirect: "error" });
}

/** Read a server-rendered Syncfusion grid's literal JSON array. Never execute the page's script. */
export function syncfusionGridRows(html: string): unknown[] {
  // Skip quoted JSON strings and nonfinal brackets. A closing bracket in a string is data.
  const dataSource = /"dataSource"\s*:\s*ejs\.data\.DataUtil\.parse\.isJson\(\s*(\[(?:[^"\]\\]|"(?:[^"\\]|\\[\s\S])*"|\](?!\s*\)))*\])\s*\)/g;
  const matches = html.matchAll(dataSource);
  const first = matches.next().value;
  if (!first || !matches.next().done) throw new Error("Expected one Syncfusion grid JSON data source");
  return parseJson(first[1], Array.isArray);
}

/** Read a named group from the WebCAD Public Incident View, omitting other dispatch records. */
export async function webCadLiveGroup(input: Response | string, group: string) {
  const tableRow = "#updatePanel table.dxgvControl_Glass tr";
  const stamp = "#updatePanel .subHeadline";
  const [refresh, ...grid] = await extractHtmlGrid(input, {
    row: `${stamp}, ${tableRow}`, cell: `${stamp} #lblPageRefreshed, ${tableRow} > td`, spaceLineBreaks: true,
  });
  const columns = ["Incident Number Time Received", "Incident Type", "Location", "Units Assigned"];
  const headings = (row: (typeof grid)[number] | undefined) => row?.length === columns.length &&
    row.every((cell, index) => cell.text === columns[index] && cell.className === "dxgvHeader_Glass");
  if (refresh?.length !== 1 || !refresh[0].text || !grid.some(headings)) {
    throw new Error("Missing WebCAD live refresh stamp or incident headers");
  }
  const isGroup = (row: (typeof grid)[number]) => row.length === 1 && row[0].text === group;
  const start = grid.findIndex(isGroup);
  if (start === -1) return { refreshed: refresh[0].text, incidents: [] };
  if (grid.findLastIndex(isGroup) !== start || !headings(grid[start + 1])) {
    throw new Error(`Missing or duplicate WebCAD headers for ${group}`);
  }
  const end = grid.findIndex((row, index) => index > start + 1 && row.length === 1);
  const rows = grid.slice(start + 2, end < 0 ? undefined : end);
  if (rows.some((row) => row.length !== columns.length || row.some(({ className }) => className !== "dxgv"))) {
    throw new Error(`Incomplete WebCAD incident row for ${group}`);
  }
  const incidents = rows.map(([received, type, location]) => ({ received: received.text, type: type.text, location: location.text }));
  return { refreshed: refresh[0].text, incidents };
}
