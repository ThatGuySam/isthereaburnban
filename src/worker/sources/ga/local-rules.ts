import { countyByName } from "../../counties";
import { calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { reviewedHtmlDigest } from "../lib/html";
import { fetchSource } from "../lib/http";
import { manualPdf } from "../lib/pdf";
import type { ActiveSource } from "../types";

type RuleSite = Pick<CalendarRule, "label" | "note" | "scope" | "scopeNote" | "seasons"> & {
  counties: readonly string[];
  sourceName: string;
  stack: string;
  url: string;
  officialUrl?: string;
  digest: string;
} & ({ kind: "html"; selector: string; startsWith?: string } | { kind: "pdf" | "scan" });

export const GA_LOCAL_RULES = {
  "athens-clarke": {
    counties: ["Clarke"], scope: "part", scopeNote: "Athens-Clarke County Unified Government jurisdiction",
    sourceName: "Athens-Clarke County Fire and Emergency Services", stack: "CivicPlus / FAQ and calendar",
    url: "https://www.accgov.com/m/faq?cat=31", officialUrl: "https://www.accgov.com/FAQ.aspx?QID=150",
    kind: "html", selector: "#question-150 .accordion-text", digest: "d56847181937ed11a7b4f39774ec2cc2b5e16ab505296002583c876f2e2f325e",
    label: "Most open burning prohibited",
    note: "Athens-Clarke County Code chapter 4-4 prohibits most open burning, including burning leaves and brush. Exceptions include cooking fires, certain open-flame equipment and prescribed burning with state authorization.",
  },
  "chatham": {
    counties: ["Chatham"], scope: "part", scopeNote: "Unincorporated Chatham County",
    sourceName: "Chatham County Code Book", stack: "County code PDF / calendar",
    url: "https://cdn.chathamcountyga.gov/Files/ChathamCounty/Code%20Book/Chapter21.PDF",
    officialUrl: "https://chathamcountyga.gov/OurCounty/CodeBook",
    kind: "pdf", digest: "a29efe0af94dbe1b256bb8ad5de87dfe12cfb94c84316435e67eba2c72666712",
    label: "Chatham County open-burning limits",
    note: "Section 21-306 limits open burning within one mile of municipal boundaries or residential subdivisions, with exceptions for listed fires and materials. Covered fires cannot start before 8 a.m. or continue past dark. Check the exceptions and fire service requirements in the county code.",
  },
  "columbus": {
    counties: ["Muscogee"], scope: "part", scopeNote: "City of Columbus",
    sourceName: "Columbus Fire and EMS", stack: "DNN / HTML and calendar",
    url: "https://columbusga.gov/fire/Open-Burning",
    kind: "html", selector: "#dnn_ctr4829_ModuleContent .wysiwyg-container", digest: "7785c7b8aeb3ccb5a433e8a2686b19548244957459bbb51dc5ded1d581648165",
    label: "Columbus open-burning prohibition with exceptions",
    note: "Columbus Code section 13-167.6 generally prohibits open burning, including leaves. Exceptions include qualifying cooking and warming fires, authorized training and certain construction or land-clearing burns with an approved air curtain destructor and permit.",
  },
  "cordele": {
    counties: ["Crisp"], scope: "part", scopeNote: "City of Cordele",
    sourceName: "Cordele Fire Department", stack: "City HTML / municipal permit and calendar",
    url: "https://www.cityofcordele.com/fire-dept-faqs.html",
    kind: "html", selector: "#wsb-element-00000000-0000-0000-0000-000470019285 .txt", digest: "3cac49b995feabb455951bd52b780a3f192df77ab45f8a4bbfb899217cc45806",
    label: "Cordele Fire Department burn permit required",
    note: "Cordele Fire Department directs residents to submit a local permit in person before covered open burning in the city. Contact the department about allowed materials, timing and current conditions.",
  },
  "crawford": {
    counties: ["Crawford"], scope: "part", scopeNote: "Crawford County Fire Department jurisdiction",
    sourceName: "Crawford County Fire Department", stack: "WordPress / Elementor and calendar",
    url: "https://www.crawfordcountyga.org/fire-department/",
    kind: "html", selector: ".elementor-element-fef657f .elementor-flip-box__front .elementor-flip-box__layer__description",
    digest: "9f210a3cc623620b081b1f5c879c4d123854d5372dabb43744fe2424c62107ff",
    label: "Crawford County yard-debris burn permit required",
    note: "Crawford County Fire Department instructs residents to obtain a permit for hand-piled natural vegetation and for burning at small garden spots. Ask the department how to obtain the local permit and about current conditions.",
  },
  "dalton": {
    counties: ["Whitfield"], scope: "part", scopeNote: "City of Dalton",
    sourceName: "Dalton Fire Department", stack: "CivicPlus / HTML and calendar",
    url: "https://www.daltonga.gov/335/Burn-Permits",
    kind: "html", selector: "#divEditorc0c247a1-dd8f-41cc-a881-6395d2455cbd .fr-view", digest: "37a75d400754902c661778d04affad5e5fd7547cf5d73261085563f44601f8d9",
    label: "Dalton fire permits and outdoor burning limits",
    note: "Dalton requires a fire department permit for covered bonfires and large yard-waste piles. Its guidance sets fire danger, wind and smoke-dispersion limits for common outdoor fires and separate rules for smaller fires.",
  },
  "dawson": {
    counties: ["Dawson"], scope: "part", scopeNote: "Dawson County Code Compliance jurisdiction",
    sourceName: "Dawson County Code Compliance", stack: "CivicPlus / FAQ and calendar",
    url: "https://www.dawsoncountyga.gov/m/faq?cat=22", officialUrl: "https://www.dawsoncountyga.gov/FAQ.aspx?QID=113",
    kind: "html", selector: "#question-113 .accordion-text", digest: "a5d0eacaacfa9c39f7ed84c02d7ce08e881483ee2ef06d978e18de57b7317428",
    label: "Dawson County outdoor burn permit and hours",
    note: "Dawson County Code Compliance requires a permit for covered open burning and limits burning of leaves and brush to 10 a.m. through one hour before sunset. Call Dawson County Fire at 706-344-3666 for permit information and check the summer limits.",
  },
  "douglas-city": {
    counties: ["Coffee"], scope: "part", scopeNote: "City of Douglas",
    sourceName: "City of Douglas Fire Department", stack: "CivicPlus / FAQ and calendar",
    url: "https://www.cityofdouglasga.gov/m/faq?cat=14", officialUrl: "https://www.cityofdouglasga.gov/FAQ.aspx?QID=56",
    kind: "html", selector: "#question-56 .accordion-text", digest: "0da5f1e7dad128506dc6816536737481e1ccbfa1ad5953a3c1d8af76763fe3d2",
    label: "Douglas same-day burn permit required",
    note: "The City of Douglas requires a burn permit for covered open burning. Call the city fire department on the day of the burn at 912-384-4815. The city lists exceptions for contained fires such as grills and fire pits.",
  },
  "dublin": {
    counties: ["Laurens"], scope: "part", scopeNote: "Commercial open burning in the City of Dublin",
    sourceName: "Dublin Fire Department", stack: "Municipal CMS / HTML and calendar",
    url: "https://www.cityofdublin.org/departments/commercial-burning-permit-application",
    kind: "html", selector: "#cms-form-step-2 .mb-0", digest: "d24b8ae092557875a45abc29b6a21b9aca5058c222f50a734316972ed8edbdfd",
    label: "Dublin commercial burn permit required",
    note: "Dublin Fire cites City Code section 10-38 in requiring a commercial burn permit. Its application covers land clearing with an air curtain destructor and requires the burning official to consult Georgia Forestry about that day's conditions.",
  },
  "effingham": {
    counties: ["Effingham"], scope: "part", scopeNote: "Effingham County Fire Rescue jurisdiction",
    sourceName: "Effingham County Board of Commissioners", stack: "Municode meeting packet PDF / calendar",
    url: "https://mccmeetingspublic.blob.core.usgovcloudapi.net/effingham-meet-59bc30a480fb4487af8a7524073f37fa/ITEM-Attachment-001-2cb2d040a7154ee7b42621d243b6dcef.pdf",
    officialUrl: "https://www.effinghamcounty.org/393/Approved-County-Ordinances",
    kind: "pdf", digest: "3ef607bd49aeffc0aafe47d8ed2a7c255372be411ef6e97c20a7a131da5bd664",
    label: "Effingham County open-burning hours and land-clearing limits",
    note: "The county's March 2026 amendment limits starting covered burns to daylight and requires fuel additions to stop at least one hour before sunset. Land-clearing burns near occupied structures require an air curtain destructor. Check local and state authorization.",
  },
  "ellijay": {
    counties: ["Gilmer"], scope: "part", scopeNote: "City of Ellijay",
    sourceName: "Ellijay Fire Department", stack: "WordPress / Divi and calendar",
    url: "https://ellijay-ga.gov/departments/fire/", officialUrl: "https://ellijay-ga.gov/departments/fire/#requests",
    kind: "html", selector: ".et_pb_accordion_item_0 .et_pb_toggle_content",
    startsWith: "Contact the Ellijay Fire Department prior", digest: "db75c498159d2e36b8a90d10fbca1d2a15c614377065ca3dde6aa33b76a21fa2",
    label: "Ellijay fire department approval required",
    note: "Ellijay requires Fire Department approval before outdoor burning. City guidelines limit on-site yard debris fires to daylight, specified pile sizes and setbacks, and restrict burning under hazardous weather or air-pollution conditions.",
  },
  "fayette": {
    counties: ["Fayette"], scope: "part", scopeNote: "Fayette County Fire and Emergency Services residential permit area",
    sourceName: "Fayette County Fire and Emergency Services", stack: "Revize / HTML and calendar",
    url: "https://www.fayettecountyga.gov/departments/fire_emergency_services/services/outdoor_burning_permit.php",
    kind: "html", selector: "#post > .module-container > .col-md-12 > ul", startsWith: "When to Burn:", digest: "5bd966f872f8d088be4ddf1ca630641426cbacb4cea66b848e391e7fcc2f1689",
    label: "Fayette County residential burn permit required",
    seasons: [["10-01", "04-30"]],
    note: "Fayette County requires a residential burn permit for covered yard debris from October through April and limits burning to 8 a.m. through sunset. Fire danger, smoke dispersion and weather can prevent the county from issuing a permit.",
  },
  "glynn": {
    counties: ["Glynn"], scope: "part", scopeNote: "Unincorporated Glynn County",
    sourceName: "Glynn County Fire Rescue", stack: "Municode code PDF / calendar",
    url: "https://mcclibrary.blob.core.usgovcloudapi.net/codecontent/13571/341670/2-7%20FIRE%20PROTECTION%20AND%20PREVENTION.pdf",
    officialUrl: "https://www.glynncounty.org/government/departments/fire-rescue",
    kind: "pdf", digest: "dc2da597ff63ea99229e049ec1d84aa1046fe288af0cb81f03477b1fc3618166",
    label: "Glynn County open-burning limits",
    note: "Glynn County Code section 2-7-9 sets conditions on open burning. On-site leaf burning must be at least 25 feet from a structure, and covered land-clearing burns need Fire Marshal approval and an air curtain destructor.",
  },
  "greene-cities": {
    counties: ["Greene"], scope: "part", scopeNote: "Cities of Greensboro and Union Point",
    sourceName: "Greene County Government", stack: "CivicPlus / HTML and calendar",
    url: "https://www.greenecountyga.gov/224/Burn-Permit",
    kind: "html", selector: "#divEditor4639630f-92a2-477d-9817-9c76b7f784dd .fr-view", digest: "f1467ce24c1f9f91e13c984d1537caddb956013e2ebadf02abd2298a816ec0ed",
    label: "Greensboro and Union Point local burn permits",
    note: "Greene County directs residents of Greensboro and Union Point to City Hall for burn permits and their city rules. Greensboro charges a permit fee and limits covered brush burning to at least 1,000 feet from homes.",
  },
  "habersham": {
    counties: ["Habersham"], scope: "part", scopeNote: "Habersham County Emergency Services permit area",
    sourceName: "Habersham County Emergency Services", stack: "ColdFusion / HTML and calendar",
    url: "https://www.habershamga.com/burnpermit.cfm",
    kind: "html", selector: "article.col-lg-12", digest: "49cb62bd31b8b4c2647aa44eaa3f31a2d3bd04126987466d56702e87f0c2f2fb",
    label: "Habersham County burn permit required",
    note: "Habersham County requires permits for covered outdoor fires, including residential yard debris and bonfires. The county lists exceptions such as qualifying cooking and warming fires. Agricultural and machine-piled burns generally go through Georgia Forestry.",
  },
  "hinesville": {
    counties: ["Liberty"], scope: "part", scopeNote: "City of Hinesville",
    sourceName: "Hinesville Fire Department", stack: "CivicPlus / guidance and calendar",
    url: "https://www.cityofhinesville.org/123/Burn-Permits",
    kind: "html", selector: "#moduleContent #page .pageContent .textLayoutStylesOne", startsWith: "Residential Permits", digest: "a8fabb8ebeb9894b5ec5a1de0e1b061e539c4dbca9a600c2e37e64580e689f65",
    label: "Hinesville same-day yard-debris burn permit required",
    note: "Hinesville requires a city fire department permit on the day of a yard-debris burn. The Fire Marshal also lists commercial permit and inspection requirements.",
  },
  "jesup": {
    counties: ["Wayne"], scope: "part", scopeNote: "City of Jesup",
    sourceName: "Jesup Fire Department", stack: "CivicPlus / ordinance PDF and calendar",
    url: "https://www.jesupga.gov/DocumentCenter/View/1114", officialUrl: "https://www.jesupga.gov/155/Fire-Department",
    kind: "pdf", digest: "ac321d6eeb2dce48b1f62d1188c8d761f0f426cc52171e96ee2f33d74a13d49c",
    label: "Jesup open yard-debris burning prohibited",
    note: "Jesup Code section 50.4 prohibits open burning of yard debris and yard waste within the city. The ordinance exempts fires with a valid Georgia Forestry Commission permit and certain training fires. The city can also issue temporary recreational fire bans.",
  },
  "lowndes": {
    counties: ["Lowndes"], scope: "part", scopeNote: "Unincorporated Lowndes County",
    sourceName: "Lowndes County Board of Commissioners", stack: "CivicPlus / scanned ordinance and calendar",
    url: "https://www.lowndescounty.com/DocumentCenter/View/29/Burn-Ordinance",
    officialUrl: "https://www.lowndescounty.com/132/County-Ordinances",
    kind: "scan", digest: "0bf5d2655475ae44c6c5d2702f8b17553eb278c012ea451729a8875f00fe3ed8",
    label: "Lowndes County open burning limited to specified exceptions",
    note: "Lowndes County Code section 9-8.1 generally prohibits open burning outside its listed exceptions. In dense residential zoning districts, qualifying on-site leaf burns are limited to the first and third Saturdays and must be at least 100 feet from other occupied homes.",
  },
  "macon-bibb": {
    counties: ["Bibb"], scope: "county", scopeNote: "Residential yard-debris burning in Macon-Bibb County",
    sourceName: "Macon-Bibb County Fire Department", stack: "WordPress / HTML and calendar",
    url: "https://www.maconbibb.us/fire-department/burn-permit/",
    kind: "html", selector: ".col-sx-12.col-md-7", startsWith: "In accordance with the Macon-Bibb County Ordinance", digest: "635833917c50fe58ab7459f7b511be3d209d510a24b312dbe55f2b3c565a6557",
    label: "Macon-Bibb residential burn permit required",
    seasons: [["10-01", "04-30"]],
    note: "Macon-Bibb County requires a same-day fire department permit to burn residential yard debris during its October through April season. The fire must be out by dark, and the department can revoke permits if weather changes.",
  },
  "pickens": {
    counties: ["Pickens"], scope: "part", scopeNote: "Unincorporated Pickens County",
    sourceName: "Pickens County Fire-Rescue", stack: "CivicPlus / published rule PDF and calendar",
    url: "https://www.pickenscountyga.gov/DocumentCenter/View/219/Burn-Permit-Guidelines-PDF",
    kind: "pdf", digest: "db52e83e618a387ba7d7aff49c7d138afad62e824d316d84dc6cf7e93a4518d0",
    label: "Pickens County bonfire permit and weather limits",
    note: "Unincorporated Pickens County requires a Fire Marshal permit for bonfires over the recreational-fire size. Local guidelines also restrict outdoor burning during designated fire danger and certain wind, low humidity and smoke-dispersion conditions.",
  },
  "richmond": {
    counties: ["Richmond"], scope: "part", scopeNote: "Augusta-Richmond County consolidated government jurisdiction",
    sourceName: "Augusta-Richmond County Code", stack: "CivicPlus / county code PDF and calendar",
    url: "https://www.augustaga.gov/DocumentCenter/View/752/Title3PubSaf?bidId=",
    kind: "pdf", digest: "851e031ce5b8add20c0f36e495396800cf7e77aa09f120e190697ae636dd9a1d",
    label: "Augusta-Richmond residential open-burning limits",
    note: "Section 3-3-6 prohibits outdoor open burning within 100 feet of residential structures. Farther away it limits burning to on-site leaves by residents or activities permitted by Georgia Forestry.",
  },
  "statesboro": {
    counties: ["Bulloch"], scope: "part", scopeNote: "City of Statesboro",
    sourceName: "Statesboro Fire Department", stack: "Revize / HTML and calendar",
    url: "https://www.statesboroga.gov/fire/services/burn_permits.php",
    kind: "html", selector: ".rz-rte-element", digest: "d70ec19c88da2ce7486e92f74eabc96d8dacf7dd0dfcc2aa7fc5c6605bd79dda",
    label: "Statesboro outdoor burn permit required",
    note: "Statesboro requires a Fire Department permit for covered outdoor burning. The city limits yard-debris burning to 10 a.m. through 6 p.m. or sundown, whichever comes first.",
  },
  "sumter": {
    counties: ["Sumter"], scope: "part", scopeNote: "Sumter County Fire and Rescue jurisdiction",
    sourceName: "Sumter County Fire Department", stack: "CivicPlus / ordinance PDF and calendar",
    url: "https://www.sumtercountyga.us/DocumentCenter/View/1549/Sumter-County-Burn-Ordinance?bidId=",
    officialUrl: "https://sumtercountyga.us/159/Fire-Department",
    kind: "pdf", digest: "0c08bef07e448ff6286d7bfd0d43f6f32370235f49334204d11910f74f0a1404",
    label: "Sumter County yard-debris burn permit required",
    note: "Sumter County's posted ordinance requires a local permit for hand-piled natural vegetation. Officials can withhold permits for hazardous conditions. Qualifying cooking fires and screened outdoor fireplaces are exempt.",
  },
  "thomasville": {
    counties: ["Thomas"], scope: "part", scopeNote: "City of Thomasville",
    sourceName: "Thomasville Fire Rescue", stack: "Nimble CMS / HTML and calendar",
    url: "https://thomasville.org/departments/fire-rescue/burn-permits",
    kind: "html", selector: "#layout-row-1 .nimble-widget-content", digest: "fcc0ed97cd598f750403a8f527930601a74312f3ae1f2db27e5054b68458c467",
    label: "Thomasville same-day permit and burn hours",
    note: "Thomasville directs residents to contact Fire Rescue on the day of a covered burn and limits burning to dawn through dusk. City code requires permits for covered land-clearing burns and bonfires.",
  },
  "ware": {
    counties: ["Ware"], scope: "part", scopeNote: "Ware County Fire Rescue residential permit area outside Waycross",
    sourceName: "Ware County Fire Rescue", stack: "Webflow / HTML and calendar",
    url: "https://www.warecountyga.gov/",
    officialUrl: "https://www.warecountyga.gov/department-nodes/public-health-safety",
    kind: "html", selector: "a[title='visit the Burn Permits website']", digest: "2d851e6dcebb9757caed534c1ff01de6368814718e1b9150ca658434ca851e36",
    label: "Ware County yard-debris burn permit required",
    note: "Ware County directs residents to obtain a local permit for covered hand-piled natural vegetation. Waycross has separate city rules. Use the county permit link for availability.",
  },
  "waycross": {
    counties: ["Ware"], scope: "part", scopeNote: "City of Waycross",
    sourceName: "Waycross Fire Department", stack: "CivicPlus / HTML and calendar",
    url: "https://www.waycrossga.gov/182/Fire-Safety",
    kind: "html", selector: "#divEditor8ff29fc9-55c0-456c-b80b-aa3165bb3903 .fr-view", digest: "0b29eda822fc8c07e75acf7c4891b23a1767310ef8447cf0f16e099ab54bef01",
    label: "Waycross open yard-debris burning prohibited",
    note: "Waycross prohibits open burning of leaves, grass, pine straw and other yard debris within city limits. The fire department describes separate rules for covered untreated-wood barrels and recreational fires.",
  },
  "waynesboro": {
    counties: ["Burke"], scope: "part", scopeNote: "City of Waynesboro",
    sourceName: "Waynesboro Fire Department", stack: "CivicPlus / FAQ and calendar",
    url: "https://www.waynesboroga.com/m/faq?cat=19",
    officialUrl: "https://www.waynesboroga.com/FAQ.aspx?QID=67",
    kind: "html", selector: "#question-67 .accordion-text", digest: "599d3df12d0f6581cd47a562c005df13bfdc60805dd126b3a3724ff0521b326f",
    label: "Waynesboro open leaf burning prohibited",
    note: "Waynesboro prohibits open burning of leaves, pine straw, trash and rubbish in city limits. Other areas of Burke County can contact Georgia Forestry about county locations.",
  },
} satisfies Record<string, RuleSite>;

export type LocalRule = keyof typeof GA_LOCAL_RULES;
export const gaLocalRuleKeys = Object.keys(GA_LOCAL_RULES) as LocalRule[];
const ZONE = US_ZONES.Eastern;

function metadata(key: LocalRule) {
  const site: RuleSite = GA_LOCAL_RULES[key];
  return {
    id: `ga-${key}-local-rule`, state: "GA", scope: site.scope,
    stack: site.stack, sourceName: site.sourceName, sourceUrl: site.url, officialUrl: site.officialUrl ?? site.url,
  };
}

export async function parseGaLocalRule(input: Response, now: Date, key: LocalRule) {
  const site: RuleSite = GA_LOCAL_RULES[key];
  let digest: string;
  switch (site.kind) {
    case "pdf": digest = (await manualPdf(input)).sha256; break;
    case "scan": digest = await sha256(await input.arrayBuffer()); break;
    case "html": digest = await reviewedHtmlDigest(input, site.selector, site.startsWith); break;
  }
  if (digest !== site.digest) throw new Error(`${site.sourceName}: reviewed burn rules changed`);
  const meta = metadata(key);
  const counties = site.counties.map((name) => {
    const county = countyByName(meta.state, name);
    if (!county) throw new Error(`Missing Georgia county: ${name}`);
    return county;
  });
  return calendarStatusRows({
    state: meta.state, zone: ZONE, status: "restricted", scope: site.scope, scopeNote: site.scopeNote,
    officialUrl: meta.officialUrl, label: site.label, note: site.note, seasons: site.seasons,
  }, counties, meta, now, { includeTomorrow: true, includeSeasonDates: true });
}

export const gaLocalRuleSources = gaLocalRuleKeys.map((key, index): ActiveSource => {
  const site: RuleSite = GA_LOCAL_RULES[key];
  const meta = metadata(key);
  return {
    ...meta, mode: "positive-only", coverage: "restrictions", recurring: true,
    cadence: { kind: "daily", zone: ZONE, hours: [index % 8] },
    async fetch({ now }) {
      const reply = await fetchSource(meta.sourceUrl, {
        headers: { accept: site.kind === "pdf" ? "application/pdf" : "text/html" },
      });
      if (reply.notModified) throw new Error(`Unexpected ${meta.id} 304`);
      return { rows: await parseGaLocalRule(reply.response, now, key) };
    },
  };
});
