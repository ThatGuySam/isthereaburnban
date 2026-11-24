import { parseUsDate } from "./dates";

type ReportingAreaRecord = {
  issued: string;
  date: string;
  kind: "F" | "O" | "Y";
  area: string;
  category: string;
  actionDay: boolean;
  publisher: string;
};

/** EPA AirNow reportingarea.dat (pipe-delimited). F is a forecast, O and Y are observations. */
export function parseAirNowReportingAreas(text: string, state: string): ReportingAreaRecord[] {
  if (!/^[A-Z]{2}$/.test(state)) throw new Error("Invalid AirNow state code");
  if (!/^\d{2}\/\d{2}\/\d{2}\|\d{2}\/\d{2}\/\d{2}\|[^\r\n]*\|[FOY]\|[YN]\|/.test(text)) {
    throw new Error("Invalid AirNow reporting-area feed");
  }
  const records: ReportingAreaRecord[] = [];
  const marker = `|${state}|`;
  // The feed is national. Only split lines that can belong to the requested state.
  let cursor = 0;
  while ((cursor = text.indexOf(marker, cursor)) !== -1) {
    const start = text.lastIndexOf("\n", cursor) + 1;
    const end = text.indexOf("\n", cursor);
    const fields = text.slice(start, end < 0 ? text.length : end).trimEnd().split("|");
    cursor = end < 0 ? text.length : end + 1;
    const [issueDate, validDate, , , , kind, , area, code, , , , , category, action, , publisher] = fields;
    if (code !== state) continue;
    const issued = parseUsDate(issueDate);
    const date = parseUsDate(validDate);
    if (fields.length !== 17 || !issued || !date || !area ||
        (kind !== "F" && kind !== "O" && kind !== "Y") || (action !== "Yes" && action !== "No")) {
      throw new Error("Invalid AirNow reporting-area record");
    }
    records.push({ issued, date, kind, area, category, actionDay: action === "Yes", publisher });
  }
  return records;
}
