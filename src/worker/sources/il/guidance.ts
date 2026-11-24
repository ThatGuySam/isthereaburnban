import { countiesInState } from "../../counties";
import { calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { civicPlusPageText } from "../lib/civicplus";
import { US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const STATE = "IL";
const ZONE = US_ZONES.Central;
const COUNTIES = countiesInState(STATE);
const EPA_PERMITS = "https://epa.illinois.gov/topics/forms/air-permits/open-burning.html";
const RICH_TEXT = ["h2", "h3", "p", "li"] as const;
const LAKE_TITLE = "Open Burning Restrictions in Unincorporated Lake County";

type Page = Response | string;
type Rule = Pick<CalendarRule, "label" | "note" | "scopeNote" | "seasons">;
type Guidance = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  officialUrl?: string;
  stack: string;
  scope: "state" | "part";
  fips?: readonly string[];
  hour: number;
  read: (input: Page) => Promise<string[]>;
  reviewed: string;
  rules: readonly Rule[];
};

function before(text: string[], marker: RegExp) {
  const end = text.findIndex((line) => marker.test(line));
  return end > 0 ? text.slice(0, end) : [];
}

async function readIllinoisEpa(input: Page) {
  const rows = await extractHtmlGrid(input, {
    row: "#faq-whatistheillinoislawonopenburning-faq, #faq-whoregulatesopenburning-faq",
    cell: ".faqQuestion, .cmp-faq__section p:not(.cmp-faq__section__ans)",
  });
  return rows.length === 2 ? rows.flat().map(({ text }) => text).filter(Boolean) : [];
}

async function readCook(input: Page) {
  const row = "main .field--name-body > .field__item";
  const rows = await extractHtmlGrid(input, { row, cell: `${row} > p, ${row} > ul > li` });
  const text = rows.length === 1 ? rows[0].map((block) => block.text) : [];
  return before(text, /^All open burn permit applications and payments /);
}

async function readKane(input: Page) {
  const row = "#ctl00_PlaceHolderMain_ctl02__ControlWrapper_RichHtmlField";
  const rows = await extractHtmlGrid(input, { row, cell: `${row} > h1, ${row} > h3, ${row} > p, ${row} > ul > li` });
  const text = rows.length === 1 ? rows[0].map((block) => block.text).filter(Boolean) : [];
  return before(text, /^Penalties$/);
}

const GUIDANCE = {
  state: {
    id: "il-epa-open-burning",
    sourceName: "Illinois EPA",
    sourceUrl: "https://epa.illinois.gov/topics/air-quality/open-burning/faq.html",
    officialUrl: EPA_PERMITS,
    stack: "Adobe Experience Manager / HTML and calendar",
    scope: "state",
    hour: 0,
    read: readIllinoisEpa,
    reviewed: "8a724ef43913851df20d38b563a67c9b877974bfdcc791719089dad490f04fe3",
    rules: [{
      scopeNote: "Open burning covered by Illinois air-pollution rules",
      label: "Illinois open-burning rules",
      note: "Illinois generally prohibits open burning of refuse. State law and rules provide exceptions for some landscape, agricultural, household and recreational fires. Some activities, including prescribed prairie burns, may require permits. Ask your local fire department, city or county about current orders and additional limits.",
    }],
  },
  cook: {
    id: "il-cook-open-burning-permits",
    sourceName: "Cook County Department of Environment and Sustainability",
    sourceUrl: "https://www.cookcountyil.gov/service/open-burning-permit",
    stack: "Drupal / HTML and calendar",
    scope: "part", fips: ["17031"],
    hour: 1,
    read: readCook,
    reviewed: "1f946b2d8145df87b753e0c592bb78d947e36366caf5483f13e3d1ce753d4e51",
    rules: [{
      scopeNote: "Suburban and unincorporated Cook County",
      label: "Cook County open-burning permits",
      note: "Cook County requires permits for covered burns such as prairie burns, fire training and certain landscape-waste burns in suburban and unincorporated Cook County. Check the county ordinance and any city or village rules for your fire.",
    }],
  },
  kane: {
    id: "il-kane-burning-regulations",
    sourceName: "Kane County Health Department",
    sourceUrl: "https://health.kanecountyil.gov/Pages/Burning-Regulations.aspx",
    stack: "SharePoint / rendered HTML and calendar",
    scope: "part", fips: ["17089"],
    hour: 2,
    read: readKane,
    reviewed: "3f371e432065bd6630f95d30a06f879e1723c5d70fa0c5a3957d184dd0d62bee",
    rules: [{
      scopeNote: "Unincorporated Kane County",
      label: "Kane County brush and landscape-waste limits",
      note: "In unincorporated Kane County, ZIP codes determine where landscape waste may be burned. Covered brush and landscape-waste fires are limited to sunny days from 10 a.m. to 3 p.m. and have wind, siting, size and air-quality restrictions. Check the county's ZIP lists and exemptions.",
    }],
  },
  lake: {
    id: "il-lake-open-burning",
    sourceName: "Lake County",
    sourceUrl: "https://www.lakecountyil.gov/4438/Open-Burning-Restrictions",
    stack: "CivicPlus / HTML and calendar",
    scope: "part", fips: ["17097"],
    hour: 0,
    read: async (input) => before(await civicPlusPageText(input, LAKE_TITLE, RICH_TEXT), /^Ordinance Enforcement$/),
    reviewed: "ff29083bd23f3df61f74a1e803988eacbf1fab9ca7d035bd57266774405016fc",
    rules: [{
      scopeNote: "Unincorporated Lake County",
      label: "Lake County yard-waste limits",
      note: "Unincorporated Lake County prohibits burning leaves, grass and other non-woody yard waste. The woody yard-waste exception is limited to November 1 through March 31 and has additional location, daylight, weather and air-quality conditions. Small recreational wood fires have separate requirements.",
    }, {
      scopeNote: "Woody yard waste in unincorporated Lake County",
      label: "Lake County woody yard-waste season closed",
      note: "The county's ordinary woody yard-waste exception is closed April 1 through October 31. Check the ordinance for separate rules for recreational fires, prescribed burns and authorized disaster debris.",
      seasons: [["04-01", "10-31"]],
    }],
  },
  naperville: {
    id: "il-naperville-open-burning",
    sourceName: "Naperville Fire Department",
    sourceUrl: "https://www.naperville.il.us/471/Open-Burning-Permits",
    stack: "CivicPlus / HTML and calendar",
    scope: "part", fips: ["17043", "17197"],
    hour: 3,
    read: async (input) => before(await civicPlusPageText(input, "Open Burning Permits", RICH_TEXT), /^If you live in unincorporated DuPage County,/),
    reviewed: "7c0be2bd6d41d5b9503e5f4c54a616a2c235111c319995e7c3a5ed19905e9fd2",
    rules: [{
      scopeNote: "City of Naperville",
      label: "Naperville open-burning limits",
      note: "Naperville prohibits burning leaves and similar plant waste. The city may require permits for certain bonfires, campfires and prairie burns. Qualifying cooking fires and fires in commercially built outdoor fireplaces have separate fuel and siting rules.",
    }],
  },
} satisfies Record<string, Guidance>;

type Jurisdiction = keyof typeof GUIDANCE;

export async function parseIllinoisGuidance(input: Page, jurisdiction: Jurisdiction, now: Date) {
  const guidance: Guidance = GUIDANCE[jurisdiction];
  const text = await guidance.read(input);
  if (!text.length || await sha256(text.join("\n")) !== guidance.reviewed) {
    throw new Error(`${guidance.sourceName}: reviewed open-burning guidance changed or is missing`);
  }
  const { fips, id, sourceName, sourceUrl, scope, rules, officialUrl = sourceUrl } = guidance;
  const counties = fips ? COUNTIES.filter((county) => fips.includes(county.fips)) : COUNTIES;
  return rules.flatMap((rule) => calendarStatusRows(
    { ...rule, state: STATE, zone: ZONE, status: "restricted", scope, officialUrl },
    counties, { id, sourceName, sourceUrl }, now,
    { includeTomorrow: true, includeSeasonDates: rule.seasons !== undefined },
  ));
}

function guidanceSource(jurisdiction: Jurisdiction): ActiveSource {
  const { id, sourceName, sourceUrl, scope, stack, hour, officialUrl = sourceUrl }: Guidance = GUIDANCE[jurisdiction];
  return {
    id, state: STATE, sourceName, sourceUrl, officialUrl, scope, stack,
    mode: "positive-only", coverage: "restrictions", recurring: true,
    cadence: { kind: "daily", zone: ZONE, hours: [hour] },
    async fetch({ now }) {
      const reply = await fetchSource(sourceUrl, {
        headers: { accept: "text/html" }, maxBytes: 350_000, maxResponseAgeMs: 24 * 3_600_000,
      });
      if (reply.notModified) throw new Error(`${sourceName}: unexpected 304`);
      return { rows: await parseIllinoisGuidance(reply.response, jurisdiction, now) };
    },
  };
}

export const illinoisGuidanceSources = {
  state: guidanceSource("state"),
  cook: guidanceSource("cook"),
  kane: guidanceSource("kane"),
  lake: guidanceSource("lake"),
  naperville: guidanceSource("naperville"),
};
