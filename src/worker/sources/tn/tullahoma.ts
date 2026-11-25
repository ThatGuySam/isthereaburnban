import type { CountyStatus } from "../../../shared/types";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";
import { cleanText, decodeEntities, extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const PAGE = "https://www.tullahomatn.gov/departments/fire_department/burn_permit.php";
const FORM = "https://docs.google.com/forms/d/1kl_Ymy4gxW6CJl_UlfeWz_WJJoD_t19MfXSLvyxTEGw/viewform?embedded=true";
const ZONE = US_ZONES.Central;
const META = {
  id: "tn-tullahoma-daily-burn-permits", state: "TN", scope: "part", stack: "Revize HTML / Google Forms",
  sourceName: "Tullahoma Fire Department", sourceUrl: PAGE, officialUrl: PAGE,
} as const;
const PAGE_RULE = "If you do not see a form displayed on this page, burning is not allowed for the day.";
const CLOSED_MESSAGE = "The City of Tullahoma is not accepting burn permit requests at this time due to weather conditions that make open burning unsafe.";
const COUNTY_AREAS = [
  { fips: "47031", county: "Coffee County" },
  { fips: "47051", county: "Franklin County" },
];

export async function parseTullahomaPermitPage(input: Response | string): Promise<"embed" | "closed"> {
  let panels = 0;
  let completePanels = 0;
  let text = "";
  const frames: (string | null)[] = [];
  const rewriter = new HTMLRewriter()
    .on("script, style, template, noscript", { element(element) { element.remove(); } })
    .on("#post", {
      element(element) {
        panels++;
        element.onEndTag(() => { completePanels++; });
      },
      text(chunk) { text += chunk.text; },
    })
    .on("#post iframe", {
      element(element) {
        if (element.hasAttribute("hidden") || /display\s*:\s*none/i.test(element.getAttribute("style") ?? "")) {
          throw new Error("Tullahoma: permit embed visibility changed");
        }
        frames.push(element.getAttribute("src"));
      },
    });
  const response = rewriter.transform(typeof input === "string" ? new Response(input) : input);
  await response.body?.pipeTo(new WritableStream({ write() {} }));
  const overview = cleanText(decodeEntities(text));
  if (panels !== 1 || completePanels !== 1 || !overview.includes(PAGE_RULE) || !overview.includes("You may not begin burning until 9 am") ||
      !overview.includes("Your fire must be completely extinguished by 4 pm") ||
      frames.length > 1 || (frames.length && frames[0] !== FORM)) {
    throw new Error("Tullahoma: unrecognized permit page or embedded form");
  }
  return frames.length ? "embed" : "closed";
}

export async function parseTullahomaForm(input: Response | string): Promise<"open" | "weather-hold"> {
  const html = typeof input === "string" ? input : await input.text();
  const [rows, ...extra] = await extractHtmlGrid(html, {
    row: "body", cell: "[role=heading][aria-level='1'], .UatU5d",
  });
  if (extra.length || !rows?.some(({ text }) => text === "Burn Permit")) {
    throw new Error("Tullahoma: invalid Google Forms title");
  }
  const messages = rows.filter(({ className }) => className.split(/\s+/).includes("UatU5d"));
  if (messages.length === 1 && messages[0].text.startsWith(CLOSED_MESSAGE)) return "weather-hold";
  if (messages.length) throw new Error("Tullahoma: unrecognized permit form closure");
  let requestForms = 0;
  const rewriter = new HTMLRewriter().on("form[action]", {
    element(element) {
      const action = new URL(element.getAttribute("action") ?? "", FORM);
      if (action.origin === "https://docs.google.com" && /^\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?[\w-]+\/formResponse$/.test(action.pathname)) {
        requestForms++;
      }
    },
  });
  await rewriter.transform(new Response(html)).body?.pipeTo(new WritableStream({ write() {} }));
  if (requestForms !== 1) throw new Error("Tullahoma: missing active permit request form");
  return "open";
}

export function tullahomaRows(decision: "open" | "closed" | "weather-hold", now: Date): CountyStatus[] {
  const { date } = localClock(now, ZONE);
  const note = {
    open: "The city displays a permit request form. Eligible burns require a permit, may start at 9 a.m. Central and must be out by 4 p.m. Central.",
    closed: "The fire department omitted the daily form, which its permit page identifies as a no-burn day for covered fires.",
    "weather-hold": "The city's permit form says it has stopped accepting burn permit requests because weather makes open burning unsafe.",
  }[decision];
  const label = decision === "open" ? "Tullahoma permit and daily burn hours" : "Tullahoma burn permit requests suspended";
  return COUNTY_AREAS.map((county) => ({
    ...localDayWindow(date, ZONE), ...county, state: META.state, scope: META.scope,
    scopeNote: "Residential burning under the City of Tullahoma permit program", status: "restricted",
    label, note, checked: now.toISOString(), sourceUpdated: null, since: date, expires: date,
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: PAGE, officialUrl: PAGE,
  }));
}

export const tnTullahomaDailyBurning: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: ZONE, hours: [8, 10, 13, 16] },
  async fetch({ now }) {
    const options = { headers: { accept: "text/html" }, maxBytes: 350_000, maxResponseAgeMs: 2 * 3_600_000 };
    const page = await fetchSource(PAGE, options);
    if (page.notModified) throw new Error("Unexpected Tullahoma permit page 304");
    const displayed = await parseTullahomaPermitPage(page.response);
    if (displayed === "closed") return { rows: tullahomaRows(displayed, now) };
    const form = await fetchSource(FORM, options);
    if (form.notModified) throw new Error("Unexpected Tullahoma permit form 304");
    return { rows: tullahomaRows(await parseTullahomaForm(form.response), now) };
  },
};
