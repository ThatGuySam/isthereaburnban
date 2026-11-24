import type { CountyStatus } from "../../../shared/types";
import { countiesInState, countyByName } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const SPRING = CALENDAR_RULES.NY;
const FIRE_TOWNS = CALENDAR_RULES.NY_FIRE_TOWNS;
const COUNTIES = countiesInState(SPRING.state);
const META = {
  id: "ny-dec-brush-burning", state: SPRING.state, scope: SPRING.scope, stack: "Drupal HTML / statute and calendar",
  sourceName: "New York State Department of Environmental Conservation",
  sourceUrl: SPRING.officialUrl, officialUrl: SPRING.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// Pin the reviewed brush and agricultural clauses and the Fire Town permit section.
const BRUSH_HASH = "86e437fa2f170b75eeb0439089e4848b77ed82c60787bdd1807c8313cc9d090f";
const FIRE_TOWNS_HASH = "ac1f6cf76f3eb62dd2a68d973987db99131fa6d0dbd91297ed7cbe9cce827b3e";
const TOWN_NAMES: Readonly<Record<string, string>> = {
  Altamont: "Tupper Lake", Ausable: "Au Sable", Belmont: "Bellmont", Grieg: "Greig", Luzerne: "Lake Luzerne",
};

// County and town names from the pinned Fire Town section.
const REVIEWED_FIRE_TOWNS = [
  "Clinton County, the towns of Altona, Ausable, Black Brook, Dannemora, Ellenburg and Saranac;",
  "Delaware County, the towns of Andes, Colchester, Hancock and Middletown;",
  "Essex County, all towns",
  "Franklin County, the towns of Altamont, Belmont, Brighton, Duane, Franklin, Harrietstown, Santa Clara and Waverly;",
  "Fulton County, the towns of Bleecker, Caroga, Mayfield, Northampton and Stratford;",
  "Greene County, the towns of Hunter, Jewett, Lexington and Windham;",
  "Hamilton County, all towns;",
  "Herkimer County, the towns of Ohio, Russia, Salisbury and Webb;",
  "Lewis County, the towns of Croghan, Diana, Grieg, Lyonsdale and Watson;",
  "Oneida County, the towns of Forestport and Remsen;",
  "Saratoga County, the towns of Corinth, Day, Edinburg and Hadley;",
  "Saint Lawrence County, the towns of Clare, Clifton, Colton, Fine, Hopkinton, Parishville, Piercefield and Pitcairn;",
  "Sullivan County, the towns of Neversink and Rockland;",
  "Ulster County, the towns of Denning, Gardiner, Hardenburgh, Olive, Rochester, Shandaken, Shawangunk, Wawarsing and Woodstock;",
  "Warren County, the towns of Bolton, Chester, Hague, Horicon, Johnsburgh, Lake George, Luzerne, Queensbury, Stoney Creek, Thurman and Warrensburg;",
  "Washington County, the towns of Dresden, Fort Ann and Putnam.",
];

export async function parseDecBrushBurning({ blocks }: HtmlParts, now: Date): Promise<CountyStatus[]> {
  const brush = blockAfterHeading(blocks, /^What Can I Burn\?$/)
    .filter(({ tag, text }) => tag === "li" && text.startsWith("For most of the year,"));
  const agricultural = blockAfterHeading(blocks, /^Burning on Agricultural Lands$/)
    .filter(({ tag, text }) => tag === "p" && text.startsWith("Open fires are allowed on contiguous agricultural land"));
  const fireTowns = blockAfterHeading(blocks, /^Adirondack and Catskills Park Locations$/)
    .filter(({ tag }) => tag === "p" || tag === "li");
  const [brushHash, fireTownsHash] = await Promise.all([
    sha256([...brush, ...agricultural].map(({ text }) => text).join("\n")),
    sha256(fireTowns.map(({ text }) => text).join("\n")),
  ]);
  if (brushHash !== BRUSH_HASH || fireTownsHash !== FIRE_TOWNS_HASH) {
    throw new Error("NY DEC: the brush-burning rules or Fire Town permit list changed or are missing");
  }

  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  const places = REVIEWED_FIRE_TOWNS.flatMap((text) => {
    const entry = /^(.+ County), (all towns|the towns of .+?)[;.]?$/.exec(text);
    const rawCounty = entry?.[1];
    const county = rawCounty && countyByName(SPRING.state, rawCounty.replace(/^Saint Lawrence/, "St. Lawrence"));
    if (!entry || !county) throw new Error(`NY DEC: unrecognized Fire Town geography: ${text}`);
    if (entry[2] === "all towns") return [{ ...county, scopeNote: `All towns in ${county.name}` }];
    return entry[2].slice("the towns of ".length).split(/, | and /)
      .map((town) => ({ ...county, scopeNote: `Town of ${TOWN_NAMES[town] ?? town}` }));
  });
  const options = { includeTomorrow: true };
  return [
    ...calendarStatusRows(SPRING, COUNTIES, META, now, options),
    ...calendarStatusRows(FIRE_TOWNS, places, META, now, options),
  ];
}

export const nyDecBrushBurning: ActiveSource = {
  ...META, recurring: true, pinnedRows, keepRowLinks: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: SPRING.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 256_000 });
    if (reply.notModified) throw new Error("Unexpected NY DEC brush-burning page 304");
    return { rows: await parseDecBrushBurning(await extractHtml(reply.response), now) };
  },
};
