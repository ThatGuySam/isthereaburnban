import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";
import type { ActiveSource } from "../types";

type Rule = LocalCalendarRule & Pick<ActiveSource, "sourceName" | "stack" | "sourceUrl"> & {
  id: string;
  county: string;
  officialUrl?: string;
  fixture: string;
  review: LocalCalendarEvidence;
};

const rules: readonly Rule[] = [
  {
    id: "fargo-bonfires", county: "Cass", sourceName: "Fargo Fire Department", stack: "City CMS / HTML",
    sourceUrl: "https://fargond.gov/city-government/departments/fire/safety-prevention/recreational-fires",
    scopeNote: "City of Fargo",
    label: "Fire Department permit required for bonfires",
    note: "Fargo requires a permit for bonfires. Small campfires and fire pits have separate rules. The city also prohibits open burning during specified fire danger ratings and Red Flag Warnings.",
    fixture: "fargo-bonfires.html",
    review: { kind: "html", selector: "p", startsWith: "Bonfires are not considered",
      digest: "e731d9d39f42ad1413f54361edd0f3897a20d6f6b7a680a1ef053faf83c8a792" },
  },
  {
    id: "bismarck-open-burning", county: "Burleigh", sourceName: "City of Bismarck", stack: "CivicPlus DocumentCenter / PDF",
    sourceUrl: "https://www.bismarcknd.gov/127/Title-4---Building-Ordinance",
    scopeNote: "City of Bismarck",
    label: "Open-burning permit required for covered fires",
    note: "Bismarck Code Title 4, Chapter 7 amends IFC §307.1.1 to require a permit for covered open burning. Recreational fires and portable outdoor fireplaces have separate provisions.",
    fixture: "bismarck-fire-code.pdf",
    review: { kind: "pdf", digest: "778f2cef9ee69a66b51956702dd8ec38e875aad53ee48f3b960342d4a9be527c" },
  },
  {
    id: "mandan-open-burning", county: "Morton", sourceName: "City of Mandan", stack: "GovOffice / HTML",
    sourceUrl: "https://www.cityofmandan.com/index.asp?SEC=2AA674C6-2C58-4C1D-82C7-A93C3FB4AE27",
    scopeNote: "City of Mandan",
    label: "Open burning prohibited except in portable outdoor fireplaces",
    note: "Mandan's fire code prohibits open burning within city limits except in portable outdoor fireplaces. The city publishes separate requirements for their use.",
    fixture: "mandan-open-burning.html",
    review: { kind: "html", selector: "div.summary > p", startsWith: "The City of Mandan prohibits any open burning",
      digest: "c060d085662440c3065907fecb71170f8a313f8d98a520cab0bf30ce1e4ded7c" },
  },
  {
    id: "valley-city-open-burning", county: "Barnes", sourceName: "Valley City Fire Department", stack: "WordPress / PDF",
    sourceUrl: "https://www.valleycity.us/wp-content/uploads/2022/02/Fire-Pit-Guidelines-2017.pdf",
    officialUrl: "https://www.valleycity.us/vcfd/",
    scopeNote: "City of Valley City",
    label: "Fire Chief permit required for open burning outside a qualifying container",
    note: "Valley City requires a Fire Chief permit for open burning outside a compliant fire pit or container. Check city rules for size, materials, weather and fire-ban restrictions.",
    fixture: "valley-city-fire-pits.pdf",
    review: { kind: "pdf", digest: "608e0e1114574e4d96d1dff89f4d6c066cc6c099d604600df8e3bfd1cd95b726" },
  },
  {
    id: "jamestown-open-burning", county: "Stutsman", sourceName: "City of Jamestown", stack: "CivicPlus DocumentCenter / PDF",
    sourceUrl: "https://www.jamestownnd.gov/DocumentCenter/View/1876/Article-III-Chapter-15-Ordinance-1623-Fire-Code-Protection-May-4-2026-PDF",
    officialUrl: "https://www.jamestownnd.gov/213/City-Ordinances",
    scopeNote: "City of Jamestown",
    label: "Fire Department permit required for covered ceremonial and group fires",
    note: "Ordinance 1623 requires a Fire Department permit for bonfires or campfires for ceremonial and group activities. Cookfires in approved fireplaces or grills are exempt from that provision.",
    fixture: "jamestown-fire-code.pdf",
    review: { kind: "pdf", digest: "f16fa9d31e381c1112fda5c7b6155ab6d998b5b45b0a6f7256e79c9ded2d81db" },
  },
  {
    id: "mayville-open-burning", county: "Traill", sourceName: "City of Mayville", stack: "WordPress / HTML",
    sourceUrl: "https://www.mayvilleportland.com/live-work/citizens-handbook/mayville/",
    scopeNote: "City of Mayville",
    label: "City permit required for open burning",
    note: "Mayville's citizens' handbook requires a permit for covered open burning within city limits. Check with the city for permit conditions and rules for recreational fire pits.",
    fixture: "mayville-open-burning.html",
    review: { kind: "html", selector: "strong", startsWith: "OPEN BURNING IS PROHIBITED",
      digest: "ffe9af574648609190c86d430d9c751b71662c44e648e4a682b439bc215419d8" },
  },
  {
    id: "edgeley-refuse", county: "LaMoure", sourceName: "City of Edgeley", stack: "Municipal Impact / PDF",
    sourceUrl: "https://edgeley.com/documents/560/Edgeley_ND_City_Ordinances.pdf",
    scopeNote: "City of Edgeley",
    label: "Burning garbage or refuse is prohibited",
    note: "Edgeley Code §4.0303 prohibits burning garbage or other refuse in the city, in the open or in a container.",
    fixture: "edgeley-ordinances.pdf",
    review: { kind: "pdf", digest: "6b752652abec52ab2bb5556ed257ee6220ded2cb72e45adda08f228e1ecae4cb" },
  },
  {
    id: "und-open-burning", county: "Grand Forks", sourceName: "University of North Dakota Office of Safety", stack: "Modern Campus / HTML",
    sourceUrl: "https://campus.und.edu/safety/public-safety/fire-safety.html",
    scopeNote: "University of North Dakota's Grand Forks campus",
    label: "Campus approval required for covered outdoor fires",
    note: "The university requires Office of Safety and City Fire Marshal approval plus a city permit for large fires, including bonfires and brush fires, on campus. The Office of Safety handles recreational-fire permits for smaller fires.",
    fixture: "und-open-burning.html",
    review: { kind: "html", selector: "div.accordion__panel", startsWith: "Large fires such as bonfires",
      digest: "2794308b61d0d30285cb567a54069104919e1ffcdecdd6a9df76de727b5432d4" },
  },
  {
    id: "turtle-mountain-permits", county: "Rolette", sourceName: "Turtle Mountain Band of Chippewa Indians", stack: "Open Law Library / published HTML export",
    sourceUrl: "https://raw.githubusercontent.com/tmchippewa/law-html/HEAD/us/nsn/tmchippewa/council/code/26.20.100/index.html",
    officialUrl: "https://law.tmchippewa.com/us/nsn/tmchippewa/council/code/26.20.100",
    scopeNote: "Turtle Mountain Band of Chippewa Indians jurisdiction in Rolette County",
    label: "Permit or burn authorization required near covered wildlands",
    note: "Tribal Code §26.20.100 requires a permit or approved prescribed-fire plan and authorization for covered fires on or near forest, brush or grass-covered lands under tribal jurisdiction. The code lists exemptions and when permits may be suspended.",
    fixture: "turtle-mountain-permits.html",
    review: { kind: "html", selector: "article.content > div.tuf-authenticate", startsWith: "26.20.100 Burning Permits",
      digest: "48bd70cfec5d83ad658a1d261c20b77bd7820c4c2ad62950a72a8454de4891df" },
  },
  {
    id: "williston-open-burning", county: "Williams", sourceName: "City of Williston", stack: "eCode360 / HTML",
    sourceUrl: "https://ecode360.com/36553225",
    scopeNote: "City of Williston",
    label: "Recreational burning of litter, trash and garbage is prohibited",
    note: "Williston Code §8-6 bars burning litter, trash or garbage in recreational fires. It also prohibits open fires that are hazardous, unattended or cause objectionable smoke or odors.",
    fixture: "williston-open-burning.html",
    review: { kind: "html-ecode360", sections: ["36553225"],
      digest: "3c5de38692de7bf7cb69f60e6ef173a0c6505aace6bac38eb68a9dbfd631deaf" },
  },
  {
    id: "cavalier-controlled-burns", county: "Cavalier", sourceName: "Cavalier County Emergency Management", stack: "WordPress / HTML",
    sourceUrl: "https://cavaliercountyem.com/burn-procedures/",
    scopeNote: "Controlled open burning under Cavalier County's procedure",
    label: "Dispatch notification for controlled open burning",
    note: "Cavalier County Emergency Management directs people to notify its public safety answering point before a controlled open burn and again after it is extinguished. Check current restrictions before burning.",
    fixture: "cavalier-controlled-burns.html",
    review: { kind: "html", selector: ".entry-content ol li > div", startsWith: "Contact the Cavalier County Public Safety Answering Point",
      digest: "b9a8ac27548a1841a2fa609f205a8b791e021dc12e53a9b69271cd6b60b9072d" },
  },
  {
    id: "lisbon-fire-warden", county: "Ransom", sourceName: "City of Lisbon", stack: "WordPress / HTML",
    sourceUrl: "https://cityoflisbon.net/2018/08/21/chapter-13-fire-protection-prevention/",
    scopeNote: "Streets, alleys and vacant lots in the City of Lisbon",
    label: "Fire Warden permission required for covered outdoor burning",
    note: "Lisbon Code §13-204 requires Fire Warden permission to burn covered materials in streets, alleys or vacant lots. The Fire Warden can publish seasonal general permits for qualifying burns.",
    fixture: "lisbon-fire-warden.html",
    review: { kind: "html", selector: "p", startsWith: "13-204. FIRE IN STREETS OR ALLEYS.",
      digest: "d83c6d3fcb584e0899cfdd9f63367fe7b480f6284416ee87db1d0e3820146c01" },
  },
  {
    id: "devils-lake-fire-permits", county: "Ramsey", sourceName: "Devils Lake Fire Department", stack: "City CMS / HTML",
    sourceUrl: "https://www.dvlnd.com/departments/fire-department/fire-safety-and-education/p/item/2600/recreational-fires",
    scopeNote: "City of Devils Lake",
    label: "Fire Department permit required outside recreational-fire limits",
    note: "Devils Lake requires a Fire Department permit for fires above its recreational size limits or for uses outside its recreational-fire rules. Check the city page for the limits and permitted fuels.",
    fixture: "devils-lake-fire-permits.html",
    review: { kind: "html", selector: "p", startsWith: "A recreational fire is an outdoor fire, where",
      digest: "440c189c1fde2ecc78a92eeffc578ebbf45f39d7a9e71e76313f6497d52f3b98" },
  },
  {
    id: "forman-fire-permits", county: "Sargent", sourceName: "City of Forman", stack: "Municipal Impact / PDF",
    sourceUrl: "https://formannd.com/documents/203/Forman_City_Ordinances_indexed.pdf",
    officialUrl: "https://formannd.com/ordinances",
    scopeNote: "City of Forman",
    label: "Written permit required for exposed fires in specified locations",
    note: "Forman Code §4.0203 requires written Fire Chief permission for bonfires or exposed fires on pavement, on oiled streets or within 25 feet of buildings. The rule also requires an approved container and safeguards.",
    fixture: "forman-fire-code.pdf",
    review: { kind: "pdf", digest: "b3d464c38899288f1e6d3e0cc5dfca9b2ead3e12d450f9da72fc6de6dd8e25d0" },
  },
  {
    id: "cando-fire-permits", county: "Towner", sourceName: "City of Cando", stack: "Wix / PDF",
    sourceUrl: "https://www.cityofcando.com/_files/ugd/efb9f3_d8358c01649e493bad928e967954c378.pdf",
    officialUrl: "https://www.cityofcando.com/ordinances",
    scopeNote: "City of Cando",
    label: "Written permit required for bonfires and other exposed fires",
    note: "Cando Code §4.0303 requires a written permit from the Fire Chief or Police Chief for bonfires and other exposed fires. §4.0305 covers approval of burn containers.",
    fixture: "cando-fire-code.pdf",
    review: { kind: "pdf", digest: "36680ee577ee5c0bde460ffb498f0c24d66e1571f039f347e291cfe74c459b1f" },
  },
];

export const ndLocalBurningRules = rules.map(({ id, county: name, stack, sourceName, sourceUrl, officialUrl, review, fixture, ...rule }) => {
  const county = countyByName("ND", name);
  if (!county) throw new Error(`Unknown North Dakota rule county: ${name}`);
  const { source, parse } = reviewedLocalCalendar({
    publisher: { id: `nd-${id}`, state: "ND", scope: "part", stack, sourceName, sourceUrl, officialUrl: officialUrl ?? sourceUrl },
    counties: [county], rule, review, zone: US_ZONES.Central, hour: 6, standing: true,
  });
  const pollGroup = review.kind === "pdf" ? "nd-standing-pdfs" : "nd-standing-html";
  return { source: { ...source, pollGroup, reportingFips: [county.fips] }, parse, fixture };
});
