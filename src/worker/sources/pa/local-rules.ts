import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";
import { paMunicipalCodes } from "./municipal-codes";

type LocalRule = LocalCalendarRule & {
  id: string;
  county: string;
  scope: "part" | "county";
  publisher: string;
  stack: string;
  url: string;
  officialUrl?: string;
  review: LocalCalendarEvidence;
};

const localRules: readonly LocalRule[] = [
  {
    id: "allegheny-open-burning", county: "Allegheny", scope: "county", publisher: "Allegheny County Health Department",
    stack: "OpenCities HTML",
    url: "https://www.alleghenycounty.us/Services/Health-Department/Air-Quality/Resident-Information/Open-Burning",
    review: {
      kind: "html", selector: "#main-content .oc-wysiwyg-container-panel", startsWith: "Fast Facts About Open Burning in Allegheny County",
      digest: "a55a89b57227e479a609047c37c138a079f379e9ade43f6ea079e4fe6cc3bb32",
    },
    label: "Open burning requires a permit or must meet county limits",
    scopeNote: "Countywide outdoor fires under Health Department Article XXI § 2105.50",
    note: "The Health Department requires an open-burning permit or compliance with the clean-fuel, size, setback and other conditions in Article XXI. Air Quality Action Days and Mon Valley watches or warnings have additional rules.",
  },
  {
    id: "bedford-borough-burning", county: "Bedford", scope: "part", publisher: "Bedford Borough",
    stack: "WordPress HTML",
    url: "https://www.bedboro.com/burning/",
    review: {
      kind: "html", selector: ".pbs-main-wrapper",
      digest: "e78c91937921384250038dd7d223e308b001495cc561153d3819e2a7ef4910fb",
    },
    label: "Outdoor vegetation burning limited to designated days",
    scopeNote: "Bedford Borough",
    note: "The borough limits burning of eligible vegetation to the first and third Wednesday and the second and fourth Saturday of each month, 8 a.m. to 6 p.m. Qualifying small cooking, ceremonial and recreational fires follow separate rules.",
  },
  {
    id: "altoona-burn-permit", county: "Blair", scope: "part", publisher: "Altoona Fire Department",
    stack: "Kentico HTML",
    url: "https://www.altoonapa.gov/departments/fire/guide-to-recreational-fires",
    review: {
      kind: "html", selector: "#mainContent .fr-view", startsWith: "Guide to Recreational Fires in the City of Altoona limits",
      digest: "614351cdfe56c0f9c1650d11597dc9bdb4ea4094fd2d200589d3a2033dcec3c5",
    },
    label: "Fire Department permit required for covered outdoor fires",
    scopeNote: "City of Altoona",
    note: "The Fire Department requires a permit for outdoor fires outside the qualifying recreational-fire and portable outdoor fireplace categories. Contact the city's Fire Inspector about bonfires or brush burning.",
  },
  {
    id: "butler-township-burning", county: "Butler", scope: "part", publisher: "Butler Township",
    stack: "WordPress / Elementor HTML",
    url: "https://butlertwp.org/fire/burning-regulations/",
    review: {
      kind: "html", selector: ".elementor-element-531f1767 .elementor-widget-container",
      digest: "f082cc76603e00a8e316e26d49996a406e7224df2b8e50544f8fdb7a6a435cad",
    },
    label: "Seasonal and weekly limits on yard-waste burning",
    scopeNote: "Butler Township",
    note: "Codified Ordinance § 231-16 confines covered yard-waste burning to specified months, days and hours and limits fuel, setbacks and supervision. Consult the township's schedule and separate rules for recreational fires.",
  },
  {
    id: "harris-township-burning", county: "Centre", scope: "part", publisher: "Harris Township",
    stack: "WordPress HTML",
    url: "https://harristownship.org/open-burning-regulations/",
    review: {
      kind: "html", selector: ".post-7133 .entry-content",
      digest: "948c2825b81ec9d594f9f42b4cdb5c2656d01cc00ddd85b1b6c60cec84d8017f",
    },
    label: "Yard-waste burning requires advance notification",
    scopeNote: "Harris Township",
    note: "The township requires residents to notify Centre County Dispatch before burning yard waste and limits those fires to daylight and the other conditions on its official page.",
  },
  {
    id: "lock-haven-burning", county: "Clinton", scope: "part", publisher: "City of Lock Haven",
    stack: "Municipal HTML",
    url: "https://www.lockhavenpa.gov/residents/open-burning",
    review: {
      kind: "html", selector: "#main article.article",
      digest: "c13aaff7a0b73b75bfba7cb0dd108cb6f58ed35a84a6438208d181619b578dcf",
    },
    label: "City code prohibits burning leaves and refuse",
    scopeNote: "City of Lock Haven",
    note: "The city prohibits burning leaves, garbage and other specified waste under Code § 340-11. Qualifying recreational fires follow separate fire-code requirements.",
  },
  {
    id: "west-kittanning-burning", county: "Armstrong", scope: "part", publisher: "West Kittanning Borough",
    stack: "WordPress / Elementor HTML",
    url: "https://westkittanningpa.com/resident-information/",
    review: {
      kind: "html", selector: ".elementor-element-0db2dc8 .elementor-text-editor",
      digest: "f2a937a0c3c6156037c9491edafa0cf2f213b5c7ff71cf53d0b77668df46fab7",
    },
    label: "Outdoor burning limited to qualifying recreational fires",
    scopeNote: "West Kittanning Borough",
    note: "The borough permits only qualifying recreational burning during the prescribed hours. It prohibits burning leaves, grass, treated wood and other materials listed in its guidance and prohibits burn barrels.",
  },
  {
    id: "hermitage-burn-permit", county: "Mercer", scope: "part", publisher: "City of Hermitage",
    stack: "CivicPlus HTML",
    url: "https://www.hermitage.net/179/Burning-Regulations",
    review: {
      kind: "html", selector: "[id=\"divEditorebe9cdc3-0475-49b5-a76b-379540404c3a\"] .fr-view",
      digest: "818b253d86f909be7b951e8823314e8c3773cd411adf42c11be06a371727eb22",
    },
    label: "Permit required for covered burning",
    scopeNote: "City of Hermitage",
    note: "The city requires a permit for covered fires. It publishes separate conditions for household burning during designated hours and for qualifying cooking and recreational fires.",
  },
  {
    id: "oil-city-burn-permit", county: "Venango", scope: "part", publisher: "Oil City Fire Department",
    stack: "Municipal HTML",
    url: "https://www.oilcity.org/departments/fire",
    review: {
      kind: "html", selector: ".section > .wrapper",
      digest: "b306d638e9cf3d664670442947421b404b20b8bf640274111b55301ff7a18d4f",
    },
    label: "Fire Prevention Permit required for covered open burning",
    scopeNote: "City of Oil City",
    note: "The Fire Department requires a permit and site inspection for covered open burning. Its published guidance lists separate requirements for qualifying recreational cooking fires.",
  },
  {
    id: "somerset-borough-burning", county: "Somerset", scope: "part", publisher: "Somerset Borough",
    stack: "Municipal HTML",
    url: "https://www.somersetborough.com/faq.html#burn",
    review: {
      kind: "html", selector: "p", startsWith: "Because grass fires can be easily caused by burning,",
      digest: "e273d84622e3d36c2b60f4c80ad08b391d3d2d0174b4351bf2002e6107ba0402",
    },
    label: "Outside burning limited to cooking fires",
    scopeNote: "Somerset Borough",
    note: "The borough prohibits burning leaves, wood and yard waste outdoors and identifies cooking fires as the permitted exception.",
  },
  {
    id: "meadville-burning", county: "Crawford", scope: "part", publisher: "City of Meadville",
    stack: "Revize PDF",
    url: "https://cms2.revize.com/revize/meadvillepa/Document_Center/Fire/Burning_Ordinance.pdf?t=202404181223440",
    review: { kind: "pdf", digest: "4353fe9c592d0a60d2e2499089cd44357dcc9d663106594e92c09a32b3234077" },
    label: "Open burning prohibited and bonfires require a permit",
    scopeNote: "City of Meadville",
    note: "The city's 2017 Outdoor Burning Ordinance prohibits covered open burning. It regulates recreational fires separately and requires advance permission for bonfires.",
  },
  {
    id: "north-lebanon-burning", county: "Lebanon", scope: "part", publisher: "North Lebanon Township",
    stack: "WordPress PDF",
    url: "https://northlebanontwppa.gov/wp-content/uploads/2026/09/NLT-Ordinance_Ch-7-Fire-Prevention-and-Fire-Protection_Part-2-Open-Burning.pdf",
    officialUrl: "https://northlebanontwppa.gov/open-burning/",
    review: { kind: "pdf", digest: "fb1b4c66c746d2c82b56d7cb8eaea62ccb3ae186618b7215bb1f5fdfddc6549b" },
    label: "Open burning limited by township ordinance",
    scopeNote: "North Lebanon Township",
    note: "Township Code Chapter 7, Part 2 and the township's guidance limit covered open burning by zoning district, container, fuel and schedule. Qualifying recreational fires and barbecues have separate conditions.",
  },
  {
    id: "philadelphia-open-fires", county: "Philadelphia", scope: "county", publisher: "Philadelphia Air Management Services",
    stack: "Philadelphia Air Management PDF",
    url: "https://www.phila.gov/media/20190205124637/AMS-Regulation-I-II-III-Combined-__-2_5_19.pdf",
    officialUrl: "https://www.phila.gov/documents/air-management-guidelines-and-regulations/",
    review: { kind: "pdf", digest: "9643a2c8d34d206249faa819f9c9495a45f7340b4b75cf5a340c4cbf704cb59b" },
    label: "City Air Management Code restricts open fires",
    scopeNote: "City and County of Philadelphia, open fires covered by § 3-202",
    note: "Philadelphia's Air Management Code § 3-202 prohibits open fires used to burn leaves, grass, waste, other specified combustible material or salvage. It exempts outdoor home cooking and provides for limited emergency exceptions.",
  },
  {
    id: "honesdale-burning", county: "Wayne", scope: "part", publisher: "Honesdale Borough",
    stack: "General Code / eCode360 PDF",
    url: "https://ecode360.com/HO1505/laws/LF2487570.pdf",
    review: { kind: "pdf", digest: "8b3f353797e6f60558d4e8b5cae0d938fc735f22965e0441ed413f5b59abb4be" },
    label: "Outdoor burning limited by borough ordinance",
    scopeNote: "Honesdale Borough",
    note: "Ordinance No. 732 generally prohibits open burning, including yard waste. It replaced the previous leaf-burning schedule and lists exceptions, including qualifying cooking, recreational and ceremonial fires.",
  },
  {
    id: "tunkhannock-burning", county: "Wyoming", scope: "part", publisher: "Tunkhannock Borough",
    stack: "WordPress PDF",
    url: "https://tunkboro.gov/wp-content/uploads/2023/03/94-3-Burning-Ordinance.pdf",
    review: { kind: "pdf", digest: "04447f8d838f4672fc24e343c6c62b63661373e10f5a3d8c9b12e04bb5fefccc" },
    label: "Open burning of leaves and other yard debris prohibited",
    scopeNote: "Tunkhannock Borough",
    note: "Ordinance No. 1994-3 prohibits burning leaves, trimmings, clippings and other listed materials. Its exceptions for specified paper materials have separate limits, including Tuesday, Thursday or Saturday from 9 a.m. to 5 p.m. when conditions permit.",
  },
  {
    id: "port-royal-burning", county: "Juniata", scope: "part", publisher: "Port Royal Borough",
    stack: "WordPress PDF",
    url: "https://portroyalborough.org/document/ordinance-august-2nd-2023/",
    officialUrl: "https://portroyalborough.org/ordinances/",
    review: { kind: "pdf", digest: "4591f7d41c0c7df34faea3bd116bad587f04374a6e86d19a6c6a00626fee9a18" },
    label: "Open burning generally prohibited and special events require a permit",
    scopeNote: "Port Royal Borough",
    note: "Port Royal Code Chapter 7, Part 1 generally prohibits open burning. It allows qualifying cooking and recreational fires on private residential property and requires a permit for covered special events.",
  },
];

const municipalRules = paMunicipalCodes.map(({ chapter, sections, digest, publisher, ...rule }): LocalRule => ({
  ...rule, publisher, scope: "part", scopeNote: publisher, stack: "General Code / eCode360 HTML",
  url: `https://ecode360.com/${chapter}`, officialUrl: `https://ecode360.com/${chapter}#${sections[0]}`,
  review: {
    kind: "html-blocks", section: "body", blocks: sections.map((id) => `.content[id="${id}_content"]`).join(", "), digest,
  },
}));

export const paLocalBurningRules = [...localRules, ...municipalRules].map((entry, index) => {
  const { id, county, scope, publisher, stack, url, officialUrl = url, review, ...rule } = entry;
  const { fips, name } = countyByName("PA", county)!;
  const checked = reviewedLocalCalendar({
    publisher: { id: `pa-${id}`, state: "PA", scope, stack, sourceName: publisher, sourceUrl: url, officialUrl },
    counties: [{ fips, name }],
    rule, review, zone: US_ZONES.Eastern, hour: (index + 1) % 24, standing: true,
  });
  return {
    ...checked,
    source: { ...checked.source, reportingFips: [fips] },
    fixture: `${id}.${review.kind === "pdf" ? "pdf" : "html"}`,
  };
});
