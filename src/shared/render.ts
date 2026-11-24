// Status wording, colors and hero markup. Pure functions shared by the Worker (HTMLRewriter
// injection) and the browser (client-side lookups), so every surface says the same thing.
import type { BanStatus, CountyStatus, FireWeatherAlert, StateDirectoryEntry } from "./types";

export type HeroStatus = BanStatus | "checking";

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
  restricted: { status: "restricted", word: "Sort of", color: "#f5a623", text: "#1a1a1a", meta: "#563a0c" },
  unknown: { status: "unknown", word: "Not sure", color: "#123646", text: "#ffffff", meta: "#d0d7da" },
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
  /** link to the county page ("More about Tulsa County") */
  link?: string;
  /** extra quiet line under the sentence, e.g. "Closest match for 74199" */
  note?: string;
};

function timeTag(iso: string, text: string): string {
  return `<time datetime="${escapeHtml(iso)}" data-relative>${escapeHtml(text)}</time>`;
}

/** Hero markup: big word, sentence, and one quiet official-source / checked line. All text escaped. */
export function renderStatusHtml(cs: CountyStatus, opts: RenderOptions = {}): string {
  const theme = statusTheme(cs.status);
  const base = opts.relativeTimeBase ?? Date.now();
  const official = cs.officialUrl
    ? `<a class="official" href="${escapeHtml(cs.officialUrl)}" target="_blank" rel="noopener">Official source<span class="sr-only"> (${escapeHtml(cs.sourceName || "official site")}, opens in new tab)</span></a>`
    : "";

  const meta: string[] = [];
  if (official) meta.push(official);
  // A county with no feed (sourceUrl empty) was never "checked"; don't imply it was.
  if (cs.checked && cs.sourceUrl) meta.push(`<span>checked ${timeTag(cs.checked, relativeTime(cs.checked, base))}</span>`);
  if ((cs.status === "ban" || cs.status === "restricted") && cs.since) {
    meta.push(`<span>since <time datetime="${escapeHtml(cs.since)}">${escapeHtml(shortDate(cs.since))}</time></span>`);
  }
  if (cs.expires) meta.push(`<span>until <time datetime="${escapeHtml(cs.expires)}">${escapeHtml(shortDate(cs.expires))}</time></span>`);
  const weather = renderAlertLineHtml(cs, base);

  const lines: string[] = [
    `<p class="status-word${theme.word.length > 5 ? " status-word--long" : ""}">${escapeHtml(theme.word)}</p>`,
    `<p class="status-sentence">${escapeHtml(statusSentence(cs))}</p>`,
  ];
  if (meta.length) lines.push(`<p class="status-meta">${meta.join('<span aria-hidden="true"> · </span>')}</p>`);
  if (weather) lines.push(weather);
  if (opts.note) lines.push(`<p class="status-note">${escapeHtml(opts.note)}</p>`);
  if (cs.note) lines.push(`<p class="status-note">${escapeHtml(cs.note)}</p>`);
  if (opts.link) lines.push(`<p class="status-more"><a href="${escapeHtml(opts.link)}">More about ${escapeHtml(cs.county)}</a></p>`);

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

/** "8 PM" on the county's clock, or "Tue 8 PM" when that's not today there. */
export function alertUntil(iso: string, state: string, now: number = Date.now()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const timeZone = stateTimeZone(state);
  const time = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }).replace(":00", "");
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

/** Static "Checking" markup used as the prerendered fallback. */
export function renderCheckingHtml(place?: string): string {
  const sentence = place ? `Looking up burn bans for ${place}…` : "Looking up burn bans near you…";
  return `<div class="status" data-status="checking"><p class="status-word status-word--long">Checking</p><p class="status-sentence">${escapeHtml(sentence)}</p></div>`;
}

/** A county we have no live status for: "Not sure" plus the state's official link. Never "none". */
export function unknownStatus(
  county: { fips: string; state: string; name: string },
  entry: Pick<StateDirectoryEntry, "publisher" | "officialUrl"> | undefined,
  checked: string,
): CountyStatus {
  return {
    fips: county.fips,
    state: county.state,
    county: county.name,
    status: "unknown",
    label: "Not tracked",
    since: null,
    expires: null,
    sourceUpdated: null,
    checked,
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

/** "Nov 23, 2026" on the state's calendar. */
export function localDate(iso: string | null | undefined, state: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: stateTimeZone(state) });
}

const SHORT_ANSWER: Record<string, string> = { ban: "Yes", none: "No", restricted: "Restrictions only" };

/** True when the source actually vouched for this status (a fetched feed, not a directory fallback). */
function vouched(cs: CountyStatus): boolean {
  return cs.status !== "unknown" && Boolean(cs.sourceUrl);
}

/**
 * Title and meta description that answer the question, for one or more counties (a city can span several).
 * Returns null when we can't vouch for an answer, so the page keeps its plain question title.
 */
export function answerMeta(question: string, list: CountyStatus[], cityName?: string): { title: string; description: string } | null {
  if (!list.length || !list.every(vouched)) return null;
  const first = list[0];
  const same = list.every((c) => c.status === first.status);
  const asOf = localDate(first.checked, first.state);
  const answer = same ? SHORT_ANSWER[first.status] : "It depends on the county";
  const title = `${question} ${answer} — as of ${asOf}`;
  const ALL: Record<string, string> = { none: "None of them has an active burn ban.", ban: "All of them are under a burn ban.", restricted: "All of them have burning restrictions." };
  let body: string;
  if (list.length === 1) body = `${cityName ? `${cityName} is in ${placeName(first)}. ` : ""}${statusSentence(first)}.`;
  else {
    const names = list.map((c) => c.county);
    const joined = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    body = `${cityName ?? "This place"} spans ${list.length} counties: ${joined}. ${same ? ALL[first.status] : list.map((c) => `${statusSentence(c)}.`).join(" ")}`;
  }
  const description = `${body} Checked ${asOf} with ${first.sourceName}. Confirm with the official source before you burn.`;
  return { title, description };
}

/** One-line status for lists ("Nope: There is no burn ban active for Wagoner County, OK."). */
export function renderStatusLine(cs: CountyStatus): string {
  const theme = statusTheme(cs.status);
  return `<strong class="status-dot status-dot--${theme.status}">${escapeHtml(theme.word)}</strong> ${escapeHtml(statusSentence(cs))}.`;
}
