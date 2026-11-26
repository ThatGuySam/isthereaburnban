import { countyStatusBulletin, htmlStatusBulletin } from "../lib/county-bulletin";
import { localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { matchHtmlStatus } from "../lib/html";

const ZONE = US_ZONES.Mountain;
const cadence = { kind: "daily", zone: ZONE, hours: [2, 8, 14, 20] } as const;

const WASHINGTON_PERMITS = "https://washingtonutah.gov/burn/permits.php";
export const utWashingtonMunicipalPermits = countyStatusBulletin({
  id: "ut-washington-municipal-permits", state: "UT", county: "Washington",
  stack: "PHP / HTML permit banner", sourceName: "Washington County Interagency Burn Permit Management",
  sourceUrl: WASHINGTON_PERMITS, officialUrl: WASHINGTON_PERMITS,
  scopeNote: "Residential open burning in municipalities served by the interagency permit portal",
  cadence, staleMs: 8 * 3_600_000,
  async read(input, now) {
    const { status, match } = await matchHtmlStatus(input, {
      section: 'div[style="text-align: center"]', blocks: "h1, h2, h3",
      choices: [
        ["closed", /^There are no permits currently open$/im],
        ["open", /^Burn Permit is for today only \(([^)]+)\)$/im],
      ],
    });
    if (status === "open") {
      if (!match[1] || parseUsDate(match[1]) !== localClock(now, ZONE).date) {
        throw new Error("Washington County: permit form does not show today's date");
      }
      return;
    }
    return {
      status: "restricted", label: "Residential burn permits closed",
      note: "The interagency permit portal is closed for residential open burning in its participating municipalities. Check with the county fire warden for unincorporated property or a different type of burn.",
    };
  },
});

const WEBER_DISTRICT = "https://www.weberfiredistrict.com/burning-info";
export const utWeberDistrictBurning = htmlStatusBulletin({
  id: "ut-weber-fire-district-open-burn", state: "UT", county: "Weber",
  stack: "Wix / HTML status panel", sourceName: "Weber Fire District",
  sourceUrl: WEBER_DISTRICT, officialUrl: WEBER_DISTRICT,
  scopeNote: "Residential open burning in the Weber Fire District service area",
  cadence, staleMs: 8 * 3_600_000, maxBytes: 1_800_000,
  section: "main#PAGES_CONTAINER #comp-m48qqymg", blocks: "h2",
  decisions: [
    [/^OPEN BURNING: CLOSED$/im, {
      status: "restricted", label: "Residential open burning closed",
      note: "Weber Fire District lists residential open burning as closed. See the district's separate wildfire restrictions for campfires and other activities.",
    }],
    [/^OPEN BURNING: OPEN$/im],
  ],
});

const MANILA_RESTRICTIONS = "https://manilautah.gov/current-town-restrictions";
export const utManilaFirePits = countyStatusBulletin({
  id: "ut-manila-current-fire-rules", state: "UT", county: "Daggett",
  stack: "Municipal HTML bulletin", sourceName: "Town of Manila",
  sourceUrl: MANILA_RESTRICTIONS, officialUrl: MANILA_RESTRICTIONS,
  scopeNote: "Residential fire pits within Manila town limits",
  cadence: { kind: "daily", zone: ZONE, hours: [8, 20] },
  staleMs: 24 * 3_600_000,
  async read(input, now) {
    const { match } = await matchHtmlStatus(input, {
      section: "main#site_main", blocks: "h1, h2, p",
      choices: [
        ["water-required", /^Current Fire and Firework Restrictions for the Town of Manila\nThe Town of Manila has lifted the Stage 2 fire restrictions, effective ([^.]+)\. Residential fire pits within Town limits are now allowed, provided the property has running water\./im],
      ],
    });
    const since = parseUsDate(match[1] ?? "");
    if (!since || since > localClock(now, ZONE).date) throw new Error("Manila: invalid effective date");
    return {
      since, status: "restricted", label: "Running water required for residential fire pits",
      note: "Manila lifted its Stage 2 restrictions. Its current bulletin allows residential fire pits within town limits if the property has running water.",
    };
  },
});

export const utCountyBulletins = [utWashingtonMunicipalPermits, utWeberDistrictBurning, utManilaFirePits];
