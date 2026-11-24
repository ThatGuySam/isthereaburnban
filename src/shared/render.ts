// Status wording, colors and hero markup. Pure functions shared by the Worker (HTMLRewriter
// injection) and the browser (client-side lookups), so every surface says the same thing.
import type { BanStatus, CountyStatus, StateDirectoryEntry } from "./types";

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

export function statusSentence(cs: CountyStatus): string {
  const place = placeName(cs);
  switch (cs.status) {
    case "ban": {
      const label = cs.label && !GENERIC_BAN_LABEL.test(cs.label.trim()) ? ` (${cs.label})` : "";
      return `There is a ban in effect for ${place}${label}`;
    }
    case "none":
      return `There is no burn ban active for ${place}`;
    case "restricted": {
      const label = cs.label?.trim() || "Burning restrictions";
      return `${label} in ${place}. There is no full ban, but some burning is limited`;
    }
    default:
      return `We can't confirm burn bans in ${place} yet — check the official source`;
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

  const lines: string[] = [
    `<p class="status-word${theme.word.length > 5 ? " status-word--long" : ""}">${escapeHtml(theme.word)}</p>`,
    `<p class="status-sentence">${escapeHtml(statusSentence(cs))}</p>`,
  ];
  if (meta.length) lines.push(`<p class="status-meta">${meta.join('<span aria-hidden="true"> · </span>')}</p>`);
  if (opts.note) lines.push(`<p class="status-note">${escapeHtml(opts.note)}</p>`);
  if (cs.note) lines.push(`<p class="status-note">${escapeHtml(cs.note)}</p>`);
  if (opts.link) lines.push(`<p class="status-more"><a href="${escapeHtml(opts.link)}">More about ${escapeHtml(cs.county)}</a></p>`);

  return `<div class="status" data-status="${theme.status}" data-fips="${escapeHtml(cs.fips)}" data-place="${escapeHtml(placeName(cs))}">${lines.join("")}</div>`;
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
