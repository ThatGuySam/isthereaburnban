// Status wording, colors and hero markup. Pure functions shared by the Worker (HTMLRewriter
// injection) and the browser (client-side lookups), so every surface says the same thing.
import type { BanStatus, CountyStatus, FireWeatherAlert, LookupResult, PlaceStatus, ScopedOrder, StateDirectoryEntry } from "./types";

export type HeroStatus = PlaceStatus | "checking";

export type StatusTheme = {
  status: HeroStatus;
  word: string;
  /** hero background */
  color: string;
  /** text color on that background (WCAG AA for large text or better) */
  text: string;
  /** quiet tone-on-tone color for the small meta line; still 4.5:1 or better on `color` */
  meta: string;
};

// Colors follow the original site, darkened where white text would fail WCAG AA large-text (3:1):
// #35c28c -> #2a9d70 (3.4:1), #9a9a9a -> #767676 (4.5:1). Amber uses dark text (8.6:1).
// Small text can't be white on green or red (3.4:1), so the meta line uses a deep shade of the
// background instead: none 4.7:1, ban 4.7:1, restricted 5.2:1, unknown 8.8:1, checking 4.5:1.
const THEMES: Record<HeroStatus, StatusTheme> = {
  ban: { status: "ban", word: "Yes", color: "#f34f49", text: "#ffffff", meta: "#3a1312" },
  none: { status: "none", word: "Nope", color: "#2a9d70", text: "#ffffff", meta: "#0a261b" },
  restricted: { status: "restricted", word: "Limited", color: "#f5a623", text: "#1a1a1a", meta: "#563a0c" },
  unknown: { status: "unknown", word: "Unsure", color: "#123646", text: "#ffffff", meta: "#d0d7da" },
  depends: { status: "depends", word: "Depends", color: "#123646", text: "#ffffff", meta: "#d0d7da" },
  checking: { status: "checking", word: "Checking", color: "#767676", text: "#ffffff", meta: "#ffffff" },
};

export function statusTheme(status: HeroStatus | string | null | undefined): StatusTheme {
  return THEMES[(status as HeroStatus) in THEMES ? (status as HeroStatus) : "unknown"];
}

/** Inline style for the hero container: sets the CSS custom properties the stylesheet reads. */
export function heroStyle(status: HeroStatus | string): string {
  const t = statusTheme(status);
  return `--bg:${t.color};--fg:${t.text};--meta:${t.meta}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function placeName(cs: Pick<CountyStatus, "county" | "state">): string {
  return `${cs.county}, ${cs.state}`;
}

const GENERIC_BAN_LABEL = /^(county |active )?burn ban$/i;

function negativeReport(cs: CountyStatus): string {
  const place = placeName(cs);
  switch (cs.sourceId ?? cs.state.toLowerCase()) {
    case "fl": return `No county burn ban reported to Florida Forest Service for ${place}`;
    case "in": return `No county burn ban reported to Indiana DHS for ${place}`;
    case "tx": return `No county burn ban reported by Texas A&M Forest Service for ${place}`;
    case "la": return `No parish burn ban reported by Louisiana's Department of Agriculture and Forestry for ${place}`;
    case "ok": return `No county or governor burn ban reported by Oklahoma Forestry Services for ${place}`;
    case "ms": return `No county burn ban listed by the Mississippi Forestry Commission for ${place}`;
    default: return `No burn ban reported for ${place}${cs.sourceName ? ` by ${cs.sourceName}` : ""}`;
  }
}

export function statusSentence(cs: CountyStatus): string {
  const place = placeName(cs);
  switch (cs.status) {
    case "ban": {
      const label = cs.label && !GENERIC_BAN_LABEL.test(cs.label.trim()) ? ` (${cs.label})` : "";
      if (cs.scopeNote === "Unincorporated areas") return `County burn ban in the unincorporated areas of ${place}`;
      return `Burn ban reported for ${place}${label}`;
    }
    case "none":
      return negativeReport(cs);
    case "restricted": {
      const label = cs.label?.trim() || "Burning restrictions";
      if (cs.scope === "part") {
        if (/^Burn ban in /i.test(label)) return label;
        return `${label}${cs.scopeNote && !label.includes(cs.scopeNote) ? ` in ${cs.scopeNote}` : ""}`;
      }
      return `${label} in ${place}`;
    }
    default:
      return `We can't confirm the burn ban status for ${place}`;
  }
}

/** "12 min ago", "3 hr ago", "2 days ago". */
export function relativeTime(iso: string | null | undefined, base: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((base - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** "Nov 3, 2026" in a fixed locale/zone so server and browser agree. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export type RenderOptions = {
  /** epoch ms used for "checked N min ago" (defaults to now) */
  relativeTimeBase?: number;
  lastKnown?: boolean;
};

function timeTag(iso: string, text: string): string {
  return `<time datetime="${escapeHtml(iso)}" data-relative>${escapeHtml(text)}</time>`;
}

function failedCheckText(report: Pick<CountyStatus, "sourceCheckFailed" | "sourceFailedSince" | "lastAttemptedAt">): string {
  const since = report.sourceFailedSince ?? report.lastAttemptedAt;
  if (!report.sourceCheckFailed || !since || !shortDate(since)) return "";
  return `couldn't check since ${shortDate(since)} at ${new Date(since).toISOString().slice(11, 16)} UTC`;
}

/** Hero markup: big word, sentence, and one quiet official-source / checked line. All text escaped. */
export function renderStatusHtml(cs: CountyStatus, opts: RenderOptions = {}): string {
  const theme = statusTheme(opts.lastKnown ? "unknown" : cs.status);
  const base = opts.relativeTimeBase ?? Date.now();
  const official = cs.officialUrl
    ? `<a class="official" href="${escapeHtml(cs.officialUrl)}" target="_blank" rel="noopener">${cs.sourceUrl ? "Official source" : "Official directory"}<span class="sr-only"> (${escapeHtml(cs.sourceName || "official site")}, opens in new tab)</span></a>`
    : "";

  const meta: string[] = [];
  if (official) meta.push(official);
  // A county with no feed (sourceUrl empty) was never "checked"; don't imply it was.
  if (cs.checked && cs.sourceUrl) meta.push(`<span>checked ${timeTag(cs.checked, relativeTime(cs.checked, base))}</span>`);
  const failure = failedCheckText(cs);
  if (failure) meta.push(`<span>${escapeHtml(failure)}</span>`);

  const sentence = opts.lastKnown ? `Last known on ${shortDate(cs.checked)} · ${statusSentence(cs)}` : statusSentence(cs);
  const lines: string[] = [
    `<p class="status-word${theme.word.length > 5 ? " status-word--long" : ""}">${escapeHtml(theme.word)}</p>`,
    `<p class="status-sentence">${escapeHtml(sentence)}</p>`,
  ];
  if (meta.length) lines.push(`<p class="status-meta">${meta.join('<span aria-hidden="true"> · </span>')}</p>`);

  return `<div class="status" data-status="${theme.status}" data-fips="${escapeHtml(cs.fips)}" data-place="${escapeHtml(placeName(cs))}">${lines.join("")}</div>`;
}

// ---------- NWS fire-weather line ----------

/** Alerts still in effect at `now`, one per event name (a county can get the same warning from two offices). */
export function currentAlerts(cs: Pick<CountyStatus, "alerts">, now: number = Date.now()): FireWeatherAlert[] {
  const seen = new Set<string>();
  return (cs.alerts ?? []).filter((a) => {
    const end = a.ends ?? a.expires;
    if (!a.event || (end && !(Date.parse(end) > now)) || seen.has(a.event)) return false;
    seen.add(a.event);
    return true;
  });
}

/** Display the zone explicitly because some states span more than one. */
export function alertUntil(iso: string, state: string, now: number = Date.now()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const timeZone = stateTimeZone(state);
  const time = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).replace(":00", "");
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone });
  return day(t) === day(new Date(now)) ? time : `${t.toLocaleDateString("en-US", { weekday: "short", timeZone })} ${time}`;
}

/** "Red Flag Warning until 8 PM" (uses `ends`, the weather event's end, before the message expiry). */
export function alertText(a: FireWeatherAlert, state: string, now: number = Date.now()): string {
  const end = a.ends ?? a.expires;
  const until = end ? alertUntil(end, state, now) : "";
  return until ? `${a.event} until ${until}` : a.event;
}

/**
 * One quiet line for active NWS fire-weather alerts, linked to the NWS message. Weather is a signal,
 * not a ban, so it never changes the status. The glyph is U+26A0 + VS15 (text style, not emoji).
 */
export function renderAlertLineHtml(cs: Pick<CountyStatus, "alerts" | "state">, now: number = Date.now()): string {
  const alerts = currentAlerts(cs, now);
  if (!alerts.length) return "";
  const items = alerts.map((a) => {
    const text = escapeHtml(alertText(a, cs.state, now));
    return a.url
      ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${text}<span class="sr-only"> (National Weather Service, opens in new tab)</span></a>`
      : `<span>${text}</span>`;
  });
  return `<p class="status-alert"><span aria-hidden="true">\u26A0\uFE0E </span>${items.join('<span aria-hidden="true"> · </span>')}</p>`;
}

export function renderAskHtml(): string {
  return '<div class="status" data-status="checking"><p class="status-word status-word--long">Where?</p><p class="status-sentence">Is there a burn ban near you?</p></div>';
}

/** Static "Checking" markup used as the prerendered fallback. */
export function renderCheckingHtml(place?: string): string {
  const sentence = place ? `Looking up burn bans for ${place}…` : "Looking up burn bans near you…";
  return `<div class="status" data-status="checking"><p class="status-word status-word--long">Checking…</p><p class="status-sentence">${escapeHtml(sentence)}</p></div>`;
}

/** A county with no confirmed report can still link to an official directory. */
export function unknownStatus(
  county: { fips: string; state: string; name: string },
  entry: Pick<StateDirectoryEntry, "publisher" | "officialUrl"> | undefined,
): CountyStatus {
  return {
    fips: county.fips,
    state: county.state,
    county: county.name,
    status: "unknown",
    label: "No confirmed report",
    since: null,
    expires: null,
    sourceUpdated: null,
    checked: null,
    firstSeenAt: null,
    statusChangedAt: null,
    sourceName: entry?.publisher ?? "",
    sourceUrl: "",
    officialUrl: entry?.officialUrl ?? "",
  };
}

// ---------- Answers for titles, descriptions and lists (server-injected, so agents get them without JS) ----------

// Main time zone per state, so "as of" dates match the reader's calendar day (UTC runs a day ahead every evening).
const PACIFIC = new Set(["CA", "WA", "OR", "NV"]);
const MOUNTAIN = new Set(["MT", "WY", "CO", "NM", "UT", "ID"]);
const CENTRAL = new Set(["TX", "OK", "KS", "NE", "SD", "ND", "MN", "IA", "MO", "AR", "LA", "MS", "AL", "TN", "WI", "IL"]);

export function stateTimeZone(state: string): string {
  if (state === "AK") return "America/Anchorage";
  if (state === "HI") return "Pacific/Honolulu";
  if (state === "AZ") return "America/Phoenix";
  if (PACIFIC.has(state)) return "America/Los_Angeles";
  if (MOUNTAIN.has(state)) return "America/Denver";
  if (CENTRAL.has(state)) return "America/Chicago";
  return "America/New_York";
}

export function placeStatus(list: Pick<CountyStatus, "status">[]): PlaceStatus {
  const first = list[0]?.status;
  return first === undefined ? "unknown" : list.every((c) => c.status === first) ? first : "depends";
}

export function locationConfirmation(result: LookupResult): string {
  const match = result.matchedZip ? `ZIP ${result.query.zip} uses ZIP ${result.matchedZip} as a substitute. ` : "";
  return `${match}${result.approximationReason ?? "The location is approximate."} Confirm your county.`;
}

export const DEPENDS_SENTENCE = "Depends on your county";

export function renderCityHtml(list: (CountyStatus & { url?: string })[], city: string, localRulesUrl?: string, now = Date.now()): string {
  if (!list.length) return renderCheckingHtml(city);
  const local = localRulesUrl
    ? `<p class="status-meta"><a href="${escapeHtml(localRulesUrl)}" target="_blank" rel="noopener">City fire rules</a></p>` : "";
  if (list.length === 1) return renderStatusHtml(list[0], { relativeTimeBase: now }) + local;

  const status = placeStatus(list);
  const theme = statusTheme(status);
  const message = status === "depends" ? DEPENDS_SENTENCE : `County reports for ${city}`;
  const items = list.map((row) => {
    const official = row.officialUrl
      ? `<a href="${escapeHtml(row.officialUrl)}" target="_blank" rel="noopener">${row.sourceUrl ? "Official source" : "Official directory"}</a>` : "";
    const checked = row.sourceUrl && row.checked ? `<span>checked ${timeTag(row.checked, relativeTime(row.checked, now))}</span>` : "";
    const details = row.url ? `<a href="${escapeHtml(row.url)}">County details</a>` : "";
    const failure = failedCheckText(row);
    const meta = [official, checked, failure && `<span>${escapeHtml(failure)}</span>`, details].filter(Boolean).join('<span aria-hidden="true"> · </span>');
    return `<li><strong>${escapeHtml(statusTheme(row.status).word)}</strong> · ${escapeHtml(statusSentence(row))}.${meta ? ` <span class="status-meta">${meta}</span>` : ""}</li>`;
  }).join("");
  return `<div class="status" data-status="${status}">
    <p class="status-word${theme.word.length > 5 ? " status-word--long" : ""}">${escapeHtml(theme.word)}</p>
    <p class="status-sentence">${escapeHtml(message)}</p>
    <ul class="city-reports">${items}</ul>${local}
  </div>`;
}

const SHORT_ANSWER: Record<PlaceStatus, string> = {
  ban: "Ban reported", none: "No burn ban reported", restricted: "Restrictions reported",
  unknown: "Status unconfirmed", depends: DEPENDS_SENTENCE,
};

export function answerMeta(question: string, list: CountyStatus[], cityName?: string): { title: string; description: string } | null {
  if (!list.length) return null;
  const status = placeStatus(list);
  const answer = cityName && status !== "depends" ? `County reports · ${SHORT_ANSWER[status]}` : SHORT_ANSWER[status];
  const body = list.map((c) => `${statusSentence(c)}.`).join(" ");
  return {
    title: `${question} ${answer}`,
    description: `${body}${cityName ? " Check the city fire authority for rules inside city limits." : ""}`,
  };
}

type ReportDates = Pick<CountyStatus, "since" | "expires" | "checked" | "sourceUpdated" |
  "lastAttemptedAt" | "firstSeenAt" | "statusChangedAt" | "validFrom" | "validUntil">;

function renderReportDates(report: ReportDates): string {
  const dates = [
    ["Effective", report.since], ["Through", report.expires],
    ["Publisher report date", report.sourceUpdated],
    ["First recorded", report.firstSeenAt], ["Published status changed", report.statusChangedAt],
    ["Last successful check", report.checked],
    ["Latest check attempt", report.lastAttemptedAt !== report.checked ? report.lastAttemptedAt : null],
    ["Decision starts", report.validFrom !== report.since ? report.validFrom : null],
    ["Decision valid until", report.validUntil],
  ];
  const items = dates.map(([label, value]) => {
    if (!value) return "";
    const day = shortDate(value);
    if (!day) return "";
    const stamp = value.includes("T") ? `${day} at ${new Date(value).toISOString().slice(11, 16)} UTC` : day;
    return `<div><dt>${escapeHtml(label)}</dt><dd><time datetime="${escapeHtml(value)}">${escapeHtml(stamp)}</time></dd></div>`;
  }).join("");
  return items ? `<dl class="report-dates">${items}</dl>` : "";
}

function renderOrder(order: ScopedOrder): string {
  const source = order.officialUrl ? `<a href="${escapeHtml(order.officialUrl)}" target="_blank" rel="noopener">${escapeHtml(order.sourceName)}</a>` : escapeHtml(order.sourceName);
  const failure = failedCheckText(order);
  return `<li><strong>${escapeHtml(order.label)}</strong><p>${escapeHtml(order.scopeNote)}</p>
    ${order.note ? `<p>${escapeHtml(order.note)}</p>` : ""}${failure ? `<p>${escapeHtml(failure)}</p>` : ""}<p>${source}</p>${renderReportDates(order)}</li>`;
}

export function renderReportDetailsHtml(row: CountyStatus, now = Date.now()): string {
  const broader = row.countywide;
  const countywide = broader ? `<p>${escapeHtml(statusSentence({ ...row, ...broader, scope: "county", scopeNote: undefined }))}.
    ${broader.officialUrl ? `<a href="${escapeHtml(broader.officialUrl)}" target="_blank" rel="noopener">County reporting source</a>` : ""}</p>` : "";
  const orders = row.orders?.filter((order) => order.status === "ban" || order.status === "restricted");
  return `<div class="report-details">
    ${row.scopeNote ? `<p>${escapeHtml(row.scopeNote)}</p>` : ""}
    ${row.note ? `<p>${escapeHtml(row.note)}</p>` : ""}
    ${countywide}
    ${failedCheckText(row) ? `<p>${escapeHtml(failedCheckText(row))}</p>` : ""}
    ${renderReportDates(row)}
    ${orders?.length ? `<h3>Reported orders and rules</h3><ul class="report-orders">${orders.map(renderOrder).join("")}</ul>` : ""}
    ${renderAlertLineHtml(row, now)}
  </div>`;
}
