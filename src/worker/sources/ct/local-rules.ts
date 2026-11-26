import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";
import { CT_DAILY_POLL_GROUP, CT_DAILY_POLL_HOURS } from "./fire-danger";

type LocalRule = {
  id: string;
  county: string;
  sourceName: string;
  rule: LocalCalendarRule;
  additionalRules?: readonly LocalCalendarRule[];
};

type EcodeRule = LocalRule & {
  page: string;
  sections: readonly [string, ...string[]];
  digest: string;
};

const ordinances: EcodeRule[] = [
  {
    id: "ridgefield-open-burning", county: "Fairfield", sourceName: "Town of Ridgefield",
    page: "12368289", sections: ["12368291", "12368303"],
    digest: "b8b584cfb358ac79c8163eed278001ad3a720a2048fc080330bf0178b54e28b8",
    rule: {
      scopeNote: "Town of Ridgefield", label: "Ridgefield brush permit and day-of confirmation",
      note: "A brush permit is valid for a single burn. Call the fire department between 10 and 11 a.m. on the day of the burn to confirm conditions. Extinguish the burn by 5 p.m.",
    },
  },
  {
    id: "newington-residential-brush", county: "Hartford", sourceName: "Town of Newington",
    page: "8835073", sections: ["8835062", "8835067", "8835094"],
    digest: "aaf23637740df31e1d2d8319d72340cd2b163b94703a47b13ee11311ef435eee",
    rule: {
      scopeNote: "Town of Newington", label: "Newington residential brush burning prohibited",
      note: "The town prohibits open burning of brush on residential or undeveloped property, subject to exceptions in DEEP regulations and other town code provisions. The town lists separate exceptions for cooking fires and certain recreational fires.",
    },
  },
  {
    id: "milford-open-burning", county: "New Haven", sourceName: "City of Milford",
    page: "14523165", sections: ["14523137", "14523141", "14523160"],
    digest: "b627ac597eab7b32e6d0ad6629f0ca52da0f28f8a3b7e4412f606f43cb4a049c",
    rule: {
      scopeNote: "City of Milford", label: "Milford open-burning certificate and setback",
      note: "Milford requires a certificate for open burning unless an exemption applies, such as qualifying cooking fires and campfires. The ordinance requires 15 feet from buildings, structures and accumulated combustible material.",
    },
  },
  {
    id: "harwinton-open-burning", county: "Litchfield", sourceName: "Town of Harwinton",
    page: "44844383", sections: ["44844355", "44844356", "44844368"],
    digest: "a53505a0aaaef337f6b6a226def33eee1e8b891111dfff87d4695c9703c171b5",
    rule: {
      scopeNote: "Town of Harwinton", label: "Harwinton open-burning permit required",
      note: "The town requires a permit for open-air fires unless a code exemption applies.",
    },
    additionalRules: [{
      scopeNote: "Town of Harwinton", label: "Harwinton seasonal open-burning closure",
      note: "The ordinance bars open burning from 12:01 a.m. June 1 until 11:59 p.m. September 30. Check the ordinance exemptions for your activity.",
      seasons: [["06-01", "09-30"]], hoursByDay: { "06-01": [1, 1440], "09-30": [0, 1439] },
    }],
  },
  {
    id: "winchester-brush-certificates", county: "Litchfield", sourceName: "Town of Winchester",
    page: "37116189", sections: ["37116198"],
    digest: "96c6a03fac46ec981c82f83a3324c6db7936a962200c5ae5ae25f95805d9d925",
    rule: {
      scopeNote: "Town of Winchester", label: "Winchester residential brush certificate and advance notice",
      note: "A certificate is required, and residential brush may be burned only at properties with one or two dwelling units. Certificate holders must call 24 hours before ignition.",
    },
  },
  {
    id: "old-saybrook-open-burning", county: "Middlesex", sourceName: "Town of Old Saybrook",
    page: "8718820", sections: ["8718831", "8718841"],
    digest: "01aadf1574da57fd2f859a55c56ac60a2ca0c299cb9337111bffea0a927cae74",
    rule: {
      scopeNote: "Town of Old Saybrook", label: "Old Saybrook open-burning certificate and daily approval",
      note: "Permitted open burning requires a written certificate for the location and verbal approval from the fire department on the day of burning. Campfires and bonfires require the fire marshal’s permission. Outdoor cooking has a separate exemption.",
    },
  },
  {
    id: "mansfield-open-burning", county: "Tolland", sourceName: "Town of Mansfield",
    page: "11768140", sections: ["11924846", "11924850"],
    digest: "b4fcdd9aaa262be3b7c5552372f60f98e5bf52940342906ad73021d6d2dba15f",
    rule: {
      scopeNote: "Town of Mansfield", label: "Mansfield brush permit and recreational fire limits",
      note: "Residential brush burning requires a permit. Recreational and ceremonial fires exceeding three feet in any dimension require the burning official’s verbal permission.",
    },
  },
  {
    id: "putnam-open-burning", county: "Windham", sourceName: "Town of Putnam",
    page: "47691550", sections: ["47691552", "47691555", "47691556", "47691557", "47691560"],
    digest: "c0699fe8b1c04a77aa889a5766ebcb4b4638a05e12a187d011c6e356c4d938d5",
    rule: {
      scopeNote: "Town of Putnam", label: "Putnam brush permit and day-of approval",
      note: "Residents need a permit and the burning official’s approval on the day of the burn. In the Special Services District, residential open burning additionally requires a lot of at least one acre and a 100-foot setback from wood lines, structures and neighboring property lines.",
    },
  },
];

type CivicPlusRule = LocalRule & { url: string; title: string; digest: string };
const permitPages: CivicPlusRule[] = [
  {
    id: "trumbull-open-burning", county: "Fairfield", sourceName: "Trumbull Fire Marshal",
    url: "https://www.trumbull-ct.gov/167/Open-Burn-Permits", title: "Open Burn Permits",
    digest: "a28dbac053bc8a24deea5764c5fd4470bb63431ea83a83ed5b0fd4f0830a3507",
    rule: {
      scopeNote: "Town of Trumbull", label: "Trumbull brush burning requires a permit and inspection",
      note: "The Fire Marshal inspects the site before issuing a permit. Only brush up to three inches in diameter may be burned under this permit.",
    },
  },
  {
    id: "north-stonington-brush-permits", county: "New London", sourceName: "North Stonington Fire Marshal",
    url: "https://www.northstoningtonct.gov/217/Burning-Permit-Information", title: "Burning Permit Information",
    digest: "28747960c0c4535917aceffbe132f8f1ef132c902ab2f5a96cbaf5e09e09705e",
    rule: {
      scopeNote: "Town of North Stonington", label: "North Stonington residential brush permit required",
      note: "Residential brush burning requires a permit. The Fire Marshal’s office inspects the site and brush piles before issuing permits.",
    },
    additionalRules: [{
      scopeNote: "Town of North Stonington", label: "North Stonington brush permit issuance paused",
      note: "The town says it does not issue brush permits between June 15 and September 15. Confirm permit availability on the two boundary dates with the Fire Marshal.",
      seasons: [["06-16", "09-14"]],
    }],
  },
];

function localRuleSource(
  { id, county, sourceName, rule, additionalRules }: LocalRule,
  { stack, sourceUrl, officialUrl = sourceUrl, review, hour }: {
    stack: string; sourceUrl: string; officialUrl?: string; review: LocalCalendarEvidence; hour: number;
  },
) {
  const mapped = countyByName("CT", county);
  if (!mapped) throw new Error(`Unmapped Connecticut county: ${county}`);
  const entry = reviewedLocalCalendar({
    publisher: { id: `ct-${id}`, state: "CT", scope: "part", stack, sourceName, sourceUrl, officialUrl },
    counties: [mapped], rule, additionalRules, review, zone: US_ZONES.Eastern, hour,
  });
  return {
    ...entry,
    source: { ...entry.source, reportingFips: [mapped.fips], pollGroup: CT_DAILY_POLL_GROUP },
    fixture: `${id}-2026-11-26.html`,
  };
}

export const ctLocalRules = [
  ...ordinances.map(({ page, sections, digest, ...local }, index) => {
    const sourceUrl = `https://ecode360.com/${page}`;
    const hour = CT_DAILY_POLL_HOURS[index % CT_DAILY_POLL_HOURS.length];
    return localRuleSource(local, {
      stack: "eCode360 / HTML", sourceUrl, officialUrl: `${sourceUrl}#${sections[0]}`,
      review: { kind: "html-ecode360", sections, digest }, hour,
    });
  }),
  ...permitPages.map(({ url, title, digest, ...local }) => localRuleSource(local, {
    stack: "CivicPlus / HTML", sourceUrl: url, review: { kind: "html-civicplus", title, digest }, hour: CT_DAILY_POLL_HOURS[0],
  })),
];
