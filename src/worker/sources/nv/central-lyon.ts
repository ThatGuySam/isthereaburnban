import { beforeYouBurnArea } from "../lib/before-you-burn";
import { countyStatusBulletin } from "../lib/county-bulletin";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";

const zone = US_ZONES.Pacific;
const area = {
  id: 499,
  name: "Central Lyon Fire Protection District",
  agency: "Central Lyon County Fire Protection District",
  description: "This application allows only residence of Silver Springs, Stagecoach, Mark Twain (Lyon County), Dayton, Mound House, and Silver City permission to burn. All others must contact their local fire districts including residents of Fernley (North Lyon Fire), Mason Valley Fire, Smith Valley Fire, Mark Twain (Storey County Fire).",
};
const url = "https://beforeyouburn.com/a/central-lyon-fire/areas";

export const nvCentralLyonBurnStatus = countyStatusBulletin({
  id: "nv-central-lyon-burn-status",
  state: "NV",
  county: "Lyon",
  stack: "Before You Burn / HTML",
  sourceName: area.agency,
  sourceUrl: url,
  officialUrl: url,
  scopeNote: "Residential debris burning in Central Lyon Fire District's published burn zone",
  cadence: { kind: "daily", zone, hours: [6, 9, 12, 15, 18] },
  pollGroup: "nv-daily-burn-status",
  staleMs: 4 * 60 * 60_000,
  maxBytes: 160_000,
  async read(input, now) {
    const { status, today } = await beforeYouBurnArea(input, area);
    if (status === "Call Local Agency" && /^Call Local Agency(?:\.|$)/.test(today)) return;

    const date = localClock(now, zone).date;
    const window = localDayWindow(date, zone);
    if (status === "Open" && /^Open(?:\. Burn season through [A-Z][a-z]{2} \d{1,2})?$/.test(today)) {
      return {
        ...window,
        status: "restricted",
        label: "Central Lyon residential debris burning open with permit",
        note: "The published zone is open for the current local day. A district permit is required. Check your address and current conditions with Central Lyon Fire before burning.",
      };
    }
    if (status === "Closed" && /^Closed(?:\. Burn season opens [A-Z][a-z]{2} \d{1,2})?$/.test(today)) {
      return {
        ...window,
        status: "ban",
        label: "Central Lyon residential debris burning closed",
        note: "The district's published burn zone is closed for the current local day. Other Lyon County fire districts issue their own decisions.",
      };
    }
    throw new Error("Central Lyon: unrecognized or contradictory burn status");
  },
});
