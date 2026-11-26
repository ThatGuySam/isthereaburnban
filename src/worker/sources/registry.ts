import { ADAPTERS } from "../adapters";
import { akDnrPermitZones } from "./ak/permits";
import { akDecWinterBurning, akDnrFireSeason } from "./ak/seasonal";
import { alAdemOpenBurning, alJeffersonOpenBurning } from "./al/air-rules";
import { alCahabaBurning } from "./al/cahaba";
import { arGarlandAlerts, arHotSpringsAlerts, arNashvilleAlerts } from "./ar/county-alerts";
import {
  arBaxterStatus, arConwayStatus, arLittleRiverStatus, arLonokeStatus,
  arMillerStatus, arPulaskiStatus, arSalemStatus, arUnionStatus, arVanBurenStatus,
} from "./ar/county-status";
import { arFaulknerCountyOrders } from "./ar/faulkner";
import { arLocalRules } from "./ar/local-rules";
import { azAreaASummer } from "./az/area-a";
import { azGrandCanyonFire } from "./az/grand-canyon";
import { azPimaWildfire } from "./az/pima";
import { caCountySources } from "./ca/county-sources";
import { pfirs } from "./ca/pfirs";
import { coArapahoeFire, coBoulderFire, coDouglasFire, coElPasoFire, coEstesFire, coLarimerFire } from "./co/county-status";
import { coDenverAir } from "./co/denver-air";
import { coLocalBurningRules } from "./co/local-rules";
import { coLocalFireSources } from "./co/local-status";
import { ctDeepFireDanger } from "./ct/fire-danger";
import { dcOpenBurning } from "./dc/open-burning";
import { dcRockCreekFireRules } from "./dc/rock-creek";
import { deActionDays } from "./de/air-quality";
import { deOpenBurning } from "./de/open-burning";
import { flMiamiDadeResidentialBurning } from "./fl/miami-dade-burning";
import { gaEpdNonSummer, gaEpdSummer } from "./ga/epd";
import { gaGwinnett } from "./ga/gwinnett";
import { gaHinesvilleClosure } from "./ga/hinesville";
import { gaLocalRuleSources } from "./ga/local-rules";
import { gaPermitCalendars } from "./ga/permit-calendar";
import { hiCabNoBurnPeriods } from "./hi/no-burn-periods";
import { hiCabOpenBurning } from "./hi/open-burning";
import { iaCountyBulletins } from "./ia/county-status";
import { iaLocalCalendars } from "./ia/local-rules";
import { idCountyBulletins } from "./id/county-status";
import { idIdlStages } from "./id/idl-stages";
import { idKootenaiAir } from "./id/kootenai-air";
import { idCountyCalendars } from "./id/local-rules";
import { idSeasonal } from "./id/seasonal";
import { ilCrawfordCountyOrders } from "./il/crawford";
import { illinoisGuidanceSources } from "./il/guidance";
import { inIdemResidentialBurning } from "./in/residential-burning";
import { ksDickinsonDistricts } from "./ks/dickinson";
import { ksAprilBurning, ksFranklinPermits, ksOpenBurning } from "./ks/open-burning";
import { kyForestryCountyBans } from "./ky/county-bans";
import { kySeasonal } from "./ky/seasonal";
import { maAirAdvisories } from "./ma/air-advisories";
import { maOpenBurning } from "./ma/open-burning";
import { mdSummerAir } from "./md/summer-air";
import { mdDnrWoodland } from "./md/woodland";
import { meOpenBurningPermits } from "./me/open-burning";
import { meTownPermitHolds } from "./me/town-permits";
import { miCivicPlusNotices } from "./mi/civicplus-notices";
import { miAtlasFireStatus, miGrandTraverseMetroStatus, miPortSanilacFireStatus, miStJosephFireStatus } from "./mi/live-permits";
import { miLocalNotices } from "./mi/local-notices";
import { miLocalRules } from "./mi/local-rules";
import { miPermits } from "./mi/permits";
import { miChesterfieldBurnStatus } from "./mi/chesterfield";
import { miEastLansingFireNotices } from "./mi/east-lansing-news";
import { miScopedBurnRules } from "./mi/scoped-burn-rules";
import { miTownshipBulletins } from "./mi/township-bulletins";
import { mnLocalCalendars } from "./mn/local-rules";
import { mnOlmstedOrders } from "./mn/olmsted";
import { mnRestrictions } from "./mn/restrictions";
import { moCapeGirardeau } from "./mo/cape-girardeau";
import { moLakeOzark } from "./mo/lake-ozark";
import { moLocalCalendars } from "./mo/local-rules";
import { moMountainView } from "./mo/mountain-view";
import { moShowMeFireBans } from "./mo/show-me-fire";
import { moYardWaste } from "./mo/yard-waste";
import { mtDeqFall } from "./mt/deq-fall";
import { mtDnrcRestrictions } from "./mt/dnrc";
import { mtGallatinOpenBurning } from "./mt/gallatin";
import { mtMissoulaSeasons } from "./mt/missoula";
import { ncAirHours } from "./nc/air-hours";
import { ncForestOrders } from "./nc/forest-orders";
import { ncPermits } from "./nc/permits";
import { ndDesRestrictions } from "./nd/restrictions";
import { neLincolnLancasterAir } from "./ne/lincoln-air";
import { neOpenBurningLaw } from "./ne/open-burning";
import { nhOpenBurningPermits } from "./nh/open-burning";
import { nhTownHallRoad } from "./nh/town-hall-road";
import { njRestrictions } from "./nj/restrictions";
import { nmAngelFirePermits } from "./nm/angel-fire";
import { nmBernalilloOpenBurning, nmOpenBurning } from "./nm/open-burning";
import { nmStateParks } from "./nm/state-parks";
import { nvTmfpdPileBurning } from "./nv/tmfpd";
import { nvUsfsSpringMountains } from "./nv/usfs";
import { nwsFireWeather } from "./nws/alerts";
import { nyDecBrushBurning } from "./ny/dec-brush-burning";
import { nyNycBarbecuing } from "./ny/nyc-barbecuing";
import { ohSeasonal } from "./oh/seasonal";
import { orLrapaHeating, orLrapaOutdoor } from "./or/lrapa";
import { orOdfPublicUse } from "./or/odf";
import { orWillametteBackyard } from "./or/willamette";
import { paDepAirBasins } from "./pa/air-basins";
import { paCarbonMunicipalStatus } from "./pa/carbon";
import { paCarrollValley } from "./pa/carroll-valley";
import { paLocalBurningRules } from "./pa/local-rules";
import { paPikeWebCad } from "./pa/pike-webcad";
import { paStateForestSpring } from "./pa/seasonal";
import { riDemForest, riDemParks } from "./ri/dem-rules";
import { riTownSources } from "./ri/town-rules";
import { scAirQuality } from "./sc/air-quality";
import { scfcDebris } from "./sc/debris";
import { sdBlmFireRestrictions } from "./sd/blm";
import { sdCountyBulletins } from "./sd/county-status";
import { sdLocalBurnRules } from "./sd/local-rules";
import { sdBlackHillsPileBurning } from "./sd/pile-burning";
import { tnAirQualityPermitHolds } from "./tn/air-quality";
import { tnGatlinburgPermitNotices } from "./tn/gatlinburg";
import { tnHamiltonDailyBurning } from "./tn/hamilton";
import { tnLocalCalendars } from "./tn/local-rules";
import { tnForestryPermitHolds } from "./tn/permit-holds";
import { tnSeasonalBurnPermits } from "./tn/seasonal";
import { tnTullahomaDailyBurning } from "./tn/tullahoma";
import { txArcherCountyIssuer, txBexarCountyIssuer } from "./tx/county-issuers";
import type { ActiveSource, Source } from "./types";
import { utFfslFireOrders } from "./ut/orders";
import { utClosedFireSeason } from "./ut/seasonal";
import { vaBrunswickBurnBan } from "./va/brunswick";
import { vaLocalCalendars } from "./va/local-rules";
import { vaNottowayBurnBan } from "./va/nottoway";
import { vaRapidanAlerts } from "./va/rapidan";
import { vaSeasonal } from "./va/seasonal";
import { vaShenandoahAlerts } from "./va/shenandoah";
import { vtFprRestrictions } from "./vt/fpr";
import { vtFranklinBurning } from "./vt/franklin";
import { vtOpenBurningPermits } from "./vt/permits";
import { waEcologyAir } from "./wa/ecology-air";
import { waKingFireSafety } from "./wa/king-fire-safety";
import { waPugetSoundAir } from "./wa/puget-sound";
import { wiLocalRules } from "./wi/local-rules";
import { wiMenomoneeNotices, wiVernonNotices } from "./wi/local-notices";
import { wiLocalStatuses } from "./wi/local-status";
import { wiPermits } from "./wi/permits";
import { wvForestryFireSeason } from "./wv/seasonal";
import { wyCountyOrders } from "./wy/county-orders";
import { wyStateLands } from "./wy/state-lands";

/** The scheduled publishers and known manual sources. Candidates stay in the research inventory. */
export const SOURCES: readonly Source[] = [
  ...ADAPTERS.map((adapter) => ({
    id: adapter.id, state: adapter.state, mode: adapter.mode,
    sourceName: adapter.sourceName, sourceUrl: adapter.sourceUrl, officialUrl: adapter.officialUrl,
    keepRowLinks: adapter.keepRowLinks,
    scope: "county" as const, coverage: "live" as const,
    stack: adapter.id === "ms" ? "WordPress / Ninja Tables" : adapter.id === "tx" ? "ArcGIS / UTF-16 text" : "ArcGIS",
    cadence: { kind: "hourly" } as const,
    async fetch({ now }) {
      return { rows: await adapter.fetch(now) };
    },
  } satisfies ActiveSource)),
  txArcherCountyIssuer,
  txBexarCountyIssuer,
  nwsFireWeather,
  ...iaCountyBulletins.map(({ source }) => source),
  ...iaLocalCalendars.map(({ source }) => source),
  flMiamiDadeResidentialBurning,
  inIdemResidentialBurning,
  pfirs,
  ...caCountySources,
  miPermits,
  miChesterfieldBurnStatus,
  miEastLansingFireNotices,
  ...miTownshipBulletins.map(({ source }) => source),
  ...miScopedBurnRules.map(({ source }) => source),
  miAtlasFireStatus,
  miGrandTraverseMetroStatus,
  miPortSanilacFireStatus,
  miStJosephFireStatus,
  ...miCivicPlusNotices.map(({ source }) => source),
  ...miLocalNotices,
  ...miLocalRules.map(({ source }) => source),
  njRestrictions,
  wiPermits,
  ...wiLocalStatuses.map(({ source }) => source),
  ...wiLocalRules.map(({ source }) => source),
  wiVernonNotices,
  wiMenomoneeNotices,
  mnRestrictions,
  mnOlmstedOrders,
  ...mnLocalCalendars.map(({ source }) => source),
  ohSeasonal,
  gaGwinnett,
  gaEpdSummer,
  gaEpdNonSummer,
  gaHinesvilleClosure,
  ...gaPermitCalendars,
  ...gaLocalRuleSources,
  azPimaWildfire,
  azGrandCanyonFire,
  azAreaASummer,
  waEcologyAir,
  waPugetSoundAir,
  waKingFireSafety,
  coArapahoeFire,
  coBoulderFire,
  coDouglasFire,
  coElPasoFire,
  coEstesFire,
  coLarimerFire,
  coDenverAir,
  ...coLocalFireSources,
  ...coLocalBurningRules.map(({ source }) => source),
  orLrapaOutdoor,
  orLrapaHeating,
  orWillametteBackyard,
  orOdfPublicUse,
  kyForestryCountyBans,
  kySeasonal,
  paDepAirBasins,
  paCarbonMunicipalStatus,
  paCarrollValley,
  ...paLocalBurningRules.map(({ source }) => source),
  paPikeWebCad,
  paStateForestSpring,
  idIdlStages,
  idKootenaiAir,
  idSeasonal,
  ...idCountyBulletins.map(({ source }) => source),
  ...idCountyCalendars.map(({ source }) => source),
  akDnrPermitZones,
  akDnrFireSeason,
  alJeffersonOpenBurning,
  alAdemOpenBurning,
  arFaulknerCountyOrders,
  arBaxterStatus,
  arConwayStatus,
  arGarlandAlerts,
  arHotSpringsAlerts,
  arLittleRiverStatus,
  arLonokeStatus,
  arMillerStatus,
  arNashvilleAlerts,
  arPulaskiStatus,
  arSalemStatus,
  arUnionStatus,
  arVanBurenStatus,
  ...arLocalRules.map(({ source }) => source),
  akDecWinterBurning,
  utFfslFireOrders,
  utClosedFireSeason,
  mtDeqFall,
  mtDnrcRestrictions,
  mtGallatinOpenBurning,
  mtMissoulaSeasons,
  wyCountyOrders,
  wyStateLands,
  ndDesRestrictions,
  nvTmfpdPileBurning,
  nvUsfsSpringMountains,
  ...scfcDebris,
  scAirQuality,
  ncForestOrders,
  ncAirHours,
  ncPermits,
  moShowMeFireBans,
  moYardWaste,
  moCapeGirardeau,
  moLakeOzark,
  moMountainView,
  ...moLocalCalendars.map(({ source }) => source),
  tnForestryPermitHolds,
  tnHamiltonDailyBurning,
  tnAirQualityPermitHolds,
  tnGatlinburgPermitNotices,
  tnTullahomaDailyBurning,
  ...tnLocalCalendars.map(({ source }) => source),
  tnSeasonalBurnPermits,
  nyDecBrushBurning,
  nyNycBarbecuing,
  vaSeasonal,
  vaRapidanAlerts,
  vaShenandoahAlerts,
  vaBrunswickBurnBan,
  vaNottowayBurnBan,
  ...vaLocalCalendars.map(({ source }) => source),
  wvForestryFireSeason,
  mdDnrWoodland,
  mdSummerAir,
  vtFprRestrictions,
  vtFranklinBurning,
  vtOpenBurningPermits,
  nmStateParks,
  nmAngelFirePermits,
  nmOpenBurning,
  nmBernalilloOpenBurning,
  deOpenBurning,
  deActionDays,
  maAirAdvisories,
  meTownPermitHolds,
  meOpenBurningPermits,
  maOpenBurning,
  ctDeepFireDanger,
  ...Object.values(illinoisGuidanceSources),
  ilCrawfordCountyOrders,
  ksOpenBurning,
  ksAprilBurning,
  ksFranklinPermits,
  ksDickinsonDistricts,
  alCahabaBurning,
  nhOpenBurningPermits,
  nhTownHallRoad,
  neOpenBurningLaw,
  neLincolnLancasterAir,
  riDemForest,
  riDemParks,
  ...Object.values(riTownSources),
  sdBlackHillsPileBurning,
  sdBlmFireRestrictions,
  ...sdCountyBulletins.map(({ source }) => source),
  ...sdLocalBurnRules.map(({ source }) => source),
  hiCabNoBurnPeriods,
  hiCabOpenBurning,
  dcOpenBurning,
  dcRockCreekFireRules,
  {
    id: "dc-emergency-orders", state: "DC", scope: "state", stack: "AlertDC / RSS",
    mode: "manual", cadence: null, sourceName: "DC Homeland Security and Emergency Management Agency",
    sourceUrl: "https://trainingtrack.hsema.dc.gov/NRss/RssFeed/AlertDCList/rss",
    officialUrl: "https://hsema.dc.gov/featured-content/alert-dc-emap",
    error: "Recent notifications do not provide a complete register of effective emergency orders. Confirm any temporary burn orders with the Fire Marshal.",
  },
  {
    id: "dc-nps-rock-creek-fire-alerts", state: "DC", scope: "part", stack: "NPS CommonSpot / public JSON embed",
    mode: "manual", cadence: null, sourceName: "National Park Service, Rock Creek Park",
    sourceUrl: "https://www.nps.gov/rocr/park-alerts-rocr.json",
    officialUrl: "https://www.nps.gov/rocr/planyourvisit/conditions.htm",
    error: "The current embed provides park alerts. A local fire-order example and its geography and effective dates still need review before automation.",
  },
  {
    id: "hi-hawaii-county-emergency-orders", state: "HI", scope: "part", stack: "Granicus Vision / HTML and signed orders",
    mode: "manual", cadence: null, sourceName: "County of Hawaiʻi Civil Defense Agency",
    sourceUrl: "https://www.hawaiicounty.gov/our-county/county-news",
    officialUrl: "https://hawaii-county-civil-defense-agency-hawaiicountygis.hub.arcgis.com/",
    error: "County news returns HTTP 403 to direct requests. Civil Defense posts local notices and the mayor issues geographically scoped orders.",
  },
  {
    id: "hi-maui-emergency-orders", state: "HI", scope: "part", stack: "CivicPlus / HTML and signed PDFs",
    mode: "manual", cadence: null, sourceName: "Maui County Mayor's Office",
    sourceUrl: "https://www.mauicounty.gov/2006/Declarations",
    officialUrl: "https://www.mauicounty.gov/2006/Declarations",
    error: "The mayor’s proclamation index can return HTTP 403. The council’s public copy can lag the signed orders.",
  },
  {
    id: "sd-meade-county-orders", state: "SD", scope: "county", stack: "Squarespace / notices and signed images",
    mode: "manual", cadence: null, sourceName: "Meade County Commission",
    sourceUrl: "https://www.meadecounty.org/public-notices?format=json",
    officialUrl: "https://www.meadecounty.org/public-notices",
    error: "The August order is an image. The public notices do not corroborate the reported November 10 rescission, and the official minutes portal returned HTTP 403. Ask the county for current orders.",
  },
  {
    id: "sd-fall-river-county-orders", state: "SD", scope: "part", stack: "WordPress / HTML and signed PDFs",
    mode: "manual", cadence: null, sourceName: "Fall River County Emergency Management",
    sourceUrl: "https://fallrivercountysd.gov/tag/burn-ban/",
    officialUrl: "https://fallrivercountysd.gov/emergency-management/",
    error: "County notices, WordPress REST and the ordinance in the May 7 minutes returned Cloudflare HTTP 403. Confirm the rules and current fire-danger trigger with the county.",
  },
  {
    id: "ri-dem-temporary-fire-orders", state: "RI", scope: "part", stack: "Drupal / HTML notices and RSS",
    mode: "manual", cadence: null, sourceName: "Rhode Island DEM",
    sourceUrl: "https://dem.ri.gov/press-releases",
    officialUrl: "https://dem.ri.gov/ri-wildfire-danger-status",
    error: "DEM publishes individual orders and general wildfire guidance. Ask the land manager for current fire restrictions at a specific site.",
  },
  {
    id: "ne-governor-burn-orders", state: "NE", scope: "state", stack: "IIS / HTML index and signed PDFs",
    mode: "manual", cadence: null, sourceName: "Nebraska Governor's Office and State Publications",
    sourceUrl: "https://govdocs.nebraska.gov/docs/pilot/pubs/eoindex.html",
    officialUrl: "https://govdocs.nebraska.gov/docs/pilot/pubs/eoindex.html",
    error: "The March 2026 statewide permit suspension was rescinded April 2. Check the signed orders for any later suspension, its geographic boundaries and expiration.",
  },
  {
    id: "ne-mccook-fire-alerts", state: "NE", scope: "part", stack: "CivicPlus Alert Center / HTML and RSS",
    mode: "manual", cadence: null, sourceName: "City of McCook Fire Department",
    sourceUrl: "https://cityofmccook.com/AlertCenter.aspx?CID=Fire-Department-8",
    officialUrl: "https://cityofmccook.com/AlertCenter.aspx?AID=FIREOUTDOOR-BURNING-BAN-72",
    error: "The April 2 city alert remains listed. Its PDF returned 404 and the RSS feed had no matching alert. Confirm current McCook restrictions with the fire department.",
  },
  {
    id: "ne-waverly-fire-orders", state: "NE", scope: "part", stack: "SOCS / HTML notices",
    mode: "manual", cadence: null, sourceName: "City of Waverly Fire & Rescue",
    sourceUrl: "https://www.citywaverly.com/vnotifier/?group_id=933&page=listmessages",
    officialUrl: "https://www.citywaverly.com/vnews/display.v/SEC/Fire/Rescue%7CBurn%20Permit%3E%3EBurn%20Ban%20Information",
    error: "The October harvest suspension has no verified end date. Ask Waverly Fire & Rescue for current permits and any weather-triggered hold.",
  },
  {
    id: "ne-omaha-burn-permits", state: "NE", scope: "part", stack: "WordPress / HTML",
    mode: "manual", cadence: null, sourceName: "Omaha Public Works and Omaha Fire Department",
    sourceUrl: "https://publicworks.omaha.gov/permit/burn-permits/",
    officialUrl: "https://fire.omaha.gov/burnpolicy/",
    error: "Direct requests returned Akamai HTTP 403. Omaha publishes standing city rules. Ask Omaha Fire or Air Quality Control about current permit availability.",
  },
  {
    id: "ne-bennet-burn-permits", state: "NE", scope: "part", stack: "HTML / embedded Google Forms",
    mode: "manual", cadence: null, sourceName: "Bennet Rural Fire Protection District",
    sourceUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeidNdJ_epJaKKgO_ARKQZeboErRIZbLhDyLZUKOJHbEgpJyA/viewform?embedded=true",
    officialUrl: "https://bennetne.gov/bennet-rural-fire-district",
    error: "The district policy page returned HTTP 511. Its public form lists dates applicants can request. Check with the district for current restrictions and wait for permit approval.",
  },
  {
    id: "nh-forestry-emergency-orders", state: "NH", scope: "part", stack: "Drupal / email and social updates",
    mode: "manual", cadence: null, sourceName: "New Hampshire Division of Forests and Lands",
    sourceUrl: "https://www.nhdfl.dncr.nh.gov/forest-protection/daily-fire-danger",
    officialUrl: "https://www.nhdfl.dncr.nh.gov/forest-protection/daily-fire-danger",
    error: "Direct requests returned Akamai HTTP 403. Fire danger is advisory. Ask the local forest fire warden about current orders and permit suspensions.",
  },
  {
    id: "al-forestry-orders", state: "AL", scope: "state", stack: "ASP.NET WebForms / HTML and WordPress notices",
    mode: "manual", cadence: null, sourceName: "Alabama Forestry Commission",
    sourceUrl: "https://www.forestry.alabama.gov/Pages/Fire/BurnRestrictions.aspx",
    officialUrl: "https://www.forestry.alabama.gov/Pages/Fire/BurnRestrictions.aspx",
    error: "Forestry publishes definitions and individual notices. Call 800-392-5679 about current wildfire alerts, emergency orders and prescribed-burning permits.",
  },
  {
    id: "ks-kdhe-flint-hills", state: "KS", scope: "county", stack: "CivicPlus / HTML and PDF",
    mode: "manual", cadence: null, sourceName: "Kansas Department of Health and Environment",
    sourceUrl: "https://www.kdhe.ks.gov/508/Flint-Hills-Smoke-Management-Plan-Develo",
    officialUrl: "https://www.kdhe.ks.gov/508/Flint-Hills-Smoke-Management-Plan-Develo",
    error: "Direct requests returned a Cloudflare HTTP 403 challenge. The Kansas Forest Service publishes the April rule and its county list.",
  },
  {
    id: "ks-reno-controlled-burning", state: "KS", scope: "part", stack: "HTML / Cloudflare",
    mode: "manual", cadence: null, sourceName: "Reno County Emergency Management",
    sourceUrl: "https://www.renocountyks.gov/controlled-burn-guidelines",
    officialUrl: "https://www.renocountyks.gov/controlled-burn-guidelines",
    error: "Direct requests returned a Cloudflare HTTP 403 challenge. Ask Reno County Emergency Management or the local fire authority about permits and current restrictions.",
  },
  {
    id: "ks-coffey-burn-orders", state: "KS", scope: "county", stack: "CivicPlus / AlertCenter and RSS",
    mode: "manual", cadence: null, sourceName: "Coffey County Fire District No. 1",
    sourceUrl: "https://www.coffeycountyks.org/AlertCenter.aspx",
    officialUrl: "https://www.coffeycountyks.org/182/Burn-Ban-Information",
    error: "The online alert feed did not confirm the November 17 order or a lift. Call county dispatch at 620-364-2123 for current status.",
  },
  {
    id: "il-mchenry-open-burning", state: "IL", scope: "part", stack: "Granicus / Vision HTML",
    mode: "manual", cadence: null, sourceName: "McHenry County Department of Health",
    sourceUrl: "https://www.mchenrycountyil.gov/departments/health-department/environmental-health/public-health-nuisance/open-burning-of-landscape-waste",
    officialUrl: "https://www.mchenrycountyil.gov/departments/health-department/environmental-health/public-health-nuisance/open-burning-of-landscape-waste",
    error: "Direct requests returned Akamai HTTP 403. Ask the county or your fire district about the landscape-waste ordinance and emergency orders.",
  },
  {
    id: "il-hamilton-ema-orders", state: "IL", scope: "county", stack: "Facebook / individual notice",
    mode: "manual", cadence: null, sourceName: "Hamilton County Emergency Management Agency",
    sourceUrl: "https://www.facebook.com/hamiltoncoema/",
    officialUrl: "https://www.hamiltoncountyil.gov/departments/emergency-management",
    error: "The September 7 order was posted on Facebook. Ask the county EMA to verify its current status.",
  },
  {
    id: "ma-mass-gov-open-burning", state: "MA", scope: "state", stack: "Drupal / HTML",
    mode: "manual", cadence: null, sourceName: "Massachusetts Department of Fire Services and MassDEP",
    sourceUrl: "https://www.mass.gov/info-details/open-burning-safety",
    officialUrl: "https://www.mass.gov/info-details/open-burning-safety",
    error: "The Mass.gov guidance returned HTTP 403 during verification. Check with the local fire department for current permits and orders, and with MassDEP for air-quality closures.",
  },
  {
    id: "de-fire-marshal-orders", state: "DE", scope: "state", stack: "WordPress / REST news search",
    mode: "manual", cadence: null, sourceName: "Delaware State Fire Marshal",
    sourceUrl: "https://news.delaware.gov/wp-json/wp/v2/posts?categories=2738&search=burning%20ban&per_page=100&_fields=id,date,link,title",
    officialUrl: "https://news.delaware.gov/category/state-fire-marshal/",
    error: "The newsroom posts individual orders and lifts. Ask the Fire Marshal or local fire authority about current orders at the burn location.",
  },
  {
    id: "nm-swcg-fire-restrictions", state: "NM", scope: "part", stack: "WordPress / ArcGIS Dashboard and WebMap",
    mode: "manual", cadence: null, sourceName: "New Mexico Forestry Division and Southwest Coordinating Group",
    sourceUrl: "https://nifc.maps.arcgis.com/apps/dashboards/aa9ff369dd414b74b69b696b40a1d057",
    officialUrl: "https://www.emnrd.nm.gov/sfd/find-current-fire-restrictions/",
    error: "Forestry rows retain undated notes and some federal map stages have been rescinded. Confirm the order and any lift with the agency, tribe or local fire authority.",
  },
  {
    id: "nm-bernalillo-daily-air", state: "NM", scope: "part", stack: "Plone / HTML daily report",
    mode: "manual", cadence: null, sourceName: "Albuquerque–Bernalillo County Air Quality Program",
    sourceUrl: "https://www.cabq.gov/airquality/todays-status",
    officialUrl: "https://www.cabq.gov/airquality/burn-no-burn/burn-restrictions",
    error: "The latest page can carry a prior day's wood-burning decision. Check the date or call 505-768-2876 for the current air-quality decision.",
  },
  {
    id: "md-dnr-emergency-orders", state: "MD", scope: "state", stack: "WordPress / REST search", mode: "manual", cadence: null,
    sourceName: "Maryland Department of Natural Resources",
    sourceUrl: "https://news.maryland.gov/dnr/wp-json/wp/v2/posts?search=burn%20ban&per_page=100&_fields=date%2Clink%2Ctitle%2Cslug",
    officialUrl: "https://news.maryland.gov/dnr/?s=burn+ban",
    error: "DNR publishes orders and lifts as news announcements. Confirm the effective dates, jurisdiction and any later extension or lift.",
  },
  {
    id: "md-worcester-fire-marshal", state: "MD", scope: "county", stack: "Drupal / HTML news archive", mode: "manual", cadence: null,
    sourceName: "Worcester County Fire Marshal",
    sourceUrl: "https://worcestermd.gov/departments/fmo/fmo-news",
    officialUrl: "https://worcestermd.gov/departments/fmo/fmo-news",
    error: "The Fire Marshal posts individual orders and lifts. Check the latest notice or contact the Fire Marshal for current status.",
  },
  {
    id: "wv-governor-fire-orders", state: "WV", scope: "state", stack: "Drupal / HTML news archive", mode: "manual", cadence: null,
    sourceName: "West Virginia Governor's Office",
    sourceUrl: "https://governor.wv.gov/allnews/all",
    officialUrl: "https://governor.wv.gov/allnews/all",
    error: "The news archive has announcements but no authoritative current fire order list. Check signed orders with the Secretary of State or Division of Forestry.",
  },
  {
    id: "va-dof-local-burn-bans", state: "VA", scope: "part", stack: "WordPress / HTML and REST", mode: "manual", cadence: null,
    sourceName: "Virginia Department of Forestry",
    sourceUrl: "https://www.dof.virginia.gov/wp-json/wp/v2/posts?search=burn%20ban",
    officialUrl: "https://www.dof.virginia.gov/wildland-prescribed-fire/fire-laws/local-burn-bans/",
    error: "DOF refers current local orders to local fire officials. The WordPress REST search returned HTTP 403 during verification.",
  },
  {
    id: "ny-governor-fire-proclamations", state: "NY", scope: "state", stack: "Drupal HTML / signed PDFs", mode: "manual", cadence: null,
    sourceName: "New York Governor's Office",
    sourceUrl: "https://www.governor.ny.gov/news?search_api_fulltext=burn%20ban",
    officialUrl: "https://www.governor.ny.gov/news",
    error: "The pressroom search omits known orders. Check the Governor's announcements and signed proclamations for current areas, dates and exceptions.",
  },
  {
    id: "ny-ulster-local-orders", state: "NY", scope: "part", stack: "Granicus OpenCities / HTML and PDF", mode: "manual", cadence: null,
    sourceName: "Ulster County Emergency Services",
    sourceUrl: "https://www.ulstercountyny.gov/Departments/Emergency-Services/Burn-Bans",
    officialUrl: "https://www.ulstercountyny.gov/Departments/Emergency-Services/Burn-Bans",
    error: "The page had an empty order area with no dated status on November 24, 2026. Ask the local issuer about current orders and their boundaries.",
  },
  {
    id: "ny-nyc-parks-barbecuing", state: "NY", scope: "part", stack: "HTML / CloudFront", mode: "manual", cadence: null,
    sourceName: "NYC Parks",
    sourceUrl: "https://www.nycgovparks.org/facilities/barbecue",
    officialUrl: "https://www.nycgovparks.org/facilities/barbecue",
    error: "The designated barbecuing area directory returned CloudFront HTTP 403 on November 24, 2026. Check NYC Parks or NYC 311 for the site.",
  },
  {
    id: "tn-commissioner-burn-bans", state: "TN", scope: "part", stack: "Adobe AEM / ArcGIS Dashboard", mode: "manual", cadence: null,
    sourceName: "Tennessee Division of Forestry",
    sourceUrl: "https://services.arcgis.com/lvPBAGXeSupVUvx2/ArcGIS/rest/services/Burn_Ban_WFL1/FeatureServer/0",
    officialUrl: "https://www.tn.gov/tnwildlandfire/prevention/safe-debris-burning/burn-bans.html",
    error: "The dashboard layer last changed county data in March 2024. Confirm current orders with the Division of Forestry or local fire officials.",
  },
  {
    id: "tn-rutherford-fire-marshal", state: "TN", scope: "part", stack: "GovOffice / HTML notices", mode: "manual", cadence: null,
    sourceName: "Rutherford County Fire Marshal",
    sourceUrl: "https://rutherfordcountytn.gov/index.asp?MODE=LIST&SEC=%7B763D13EF-A556-49BB-B17F-430551ED58A0%7D&Type=B_PR",
    officialUrl: "https://rutherfordcountytn.gov/fire-marshal",
    error: "The archived October 2023 and August 2024 orders were lifted. Ask the Fire Marshal about current restrictions in unincorporated Rutherford County.",
  },
  {
    id: "tn-shelby-open-burning", state: "TN", scope: "part", stack: "CivicPlus / HTML and PDF", mode: "manual", cadence: null,
    sourceName: "Shelby County Health Department",
    sourceUrl: "https://www.shelbycountytn.gov/DocumentCenter/View/883/open_burn_rules",
    officialUrl: "https://www.shelbytnhealth.com/176/Open-Burning-Land-Clearing-Contractors",
    error: "The county PDF returned Cloudflare 403. The Health Department explains standing local rules and exceptions. Ask about current restrictions for your address.",
  },
  {
    id: "mo-sema-daily-brief", state: "MO", scope: "county", stack: "PDF map", mode: "manual", cadence: null,
    sourceName: "Missouri State Emergency Management Agency",
    sourceUrl: "https://sema.dps.mo.gov/newspubs/docs/dailybriefs.pdf",
    officialUrl: "https://sema.dps.mo.gov/newspubs/docs/dailybriefs.pdf",
    error: "SEMA republishes the Show Me Fire map as an image. Check the brief date and ask the local authority for the signed order.",
  },
  {
    id: "mo-dfs-reported-orders", state: "MO", scope: "county", stack: "PHP / XLSX", mode: "manual", cadence: null,
    sourceName: "Missouri Division of Fire Safety",
    sourceUrl: "https://dfs.dps.mo.gov/programs/resources/county-burn-bans.php",
    officialUrl: "https://dfs.dps.mo.gov/programs/resources/county-burn-bans.php",
    error: "The linked September 16 workbook is a dated list of reports and inquiries. Confirm enactments, lifts and their boundaries with the local issuer.",
  },
  {
    id: "nc-air-quality-action-days", state: "NC", scope: "part", stack: "WordPress / PHP + KML", mode: "manual", cadence: null,
    sourceName: "N.C. Division of Air Quality and Forsyth County Environmental Assistance and Protection",
    sourceUrl: "https://airquality.climate.ncsu.edu/",
    officialUrl: "https://airquality.climate.ncsu.edu/discussion/",
    error: "The daily forecast map gives burn-ban flags without hours. Check the forecast discussion or local air-quality advisory for applicable counties and hours.",
  },
  {
    id: "sc-scfc-issued-orders", state: "SC", scope: "part", stack: "WordPress / PDF", mode: "manual", cadence: null,
    sourceName: "South Carolina Forestry Commission",
    sourceUrl: "https://www.scfc.gov/news-releases/",
    officialUrl: "https://www.scfc.gov/protection/fire-burning/fire-resources/bans-alerts/",
    error: "Read the dated advisories and lifts to confirm which unincorporated areas and activities the latest order covers.",
  },
  {
    id: "sc-horry-county-orders", state: "SC", scope: "part", stack: "Umbraco / HTML notices", mode: "manual", cadence: null,
    sourceName: "Horry County Fire Rescue",
    sourceUrl: "https://www.horrycountysc.gov/news/public-safety",
    officialUrl: "https://www.horrycountysc.gov/departments/fire-rescue/open-burning/",
    error: "The county posts orders and lifts for unincorporated Horry County. The archive has no current status field.",
  },
  {
    id: "ar-forestry-county-bans", state: "AR", scope: "county", stack: "ASP.NET Core / AgTools HTML",
    mode: "manual", cadence: null, sourceName: "Arkansas Forestry Division",
    sourceUrl: "https://mip.agri.arkansas.gov/agtools/Forestry/Fire_Info/Burn_Bans",
    officialUrl: "https://agriculture.arkansas.gov/forests/",
    error: "The AgTools server omits a TLS intermediate certificate. Check the Forestry map and the county judge for the signed order and area covered.",
  },
  {
    id: "ar-benton-county-burn-bans", state: "AR", scope: "county", stack: "WordPress / Cloudflare",
    mode: "manual", cadence: null, sourceName: "Benton County Fire Marshal",
    sourceUrl: "https://bentoncountyar.gov/fire-marshal/burn-ban-information/",
    officialUrl: "https://bentoncountyar.gov/fire-marshal/burn-ban-information/",
    error: "The Fire Marshal's burn-ban information returned a Cloudflare challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "ar-benton-county-cencom-burn-status", state: "AR", scope: "part", stack: "IIS / PHP JSON",
    mode: "manual", cadence: null, sourceName: "Benton County Emergency Communications",
    sourceUrl: "https://gis.bentoncountyar.gov/controlledburn/getStatus.php",
    officialUrl: "https://gis.bentoncountyar.gov/controlledburn/",
    error: "The status endpoint works in curl. The local Worker repeatedly received a TLS connection reset. The portal covers participating dispatch districts.",
  },
  {
    id: "nv-interagency-fire-restrictions", state: "NV", scope: "part", stack: "ArcGIS FeatureServer / Squarespace order index",
    mode: "manual", cadence: null, sourceName: "Nevada Fire Info interagency partners",
    sourceUrl: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Nevada_Fire_Restrictions_Public_View/FeatureServer/0",
    officialUrl: "https://www.nevadafireinfo.org/restrictions",
    error: "The ArcGIS map still showed Stage 1 for the Winnemucca District after its October 31, 2026 rescission. Check orders and rescissions with the land manager.",
  },
  {
    id: "nd-cass-county-order", state: "ND", scope: "part", stack: "Granicus / Vision HTML and PDF", mode: "manual", cadence: null,
    sourceName: "Cass County Emergency Management",
    sourceUrl: "https://www.casscountynd.gov/Home/Components/News/News/2647/16?seldept=18&selectview=0",
    officialUrl: "https://nddesgis.nd.gov/server/rest/services/Hosted/WebEOC_Burn_Restriciions_Publish/FeatureServer/0/31/attachments/82",
    error: "The county notice and PDF returned Akamai 403 on 2026-11-24. DES hosts a copy of the signed county declaration.",
  },
  {
    id: "ut-blm-campfire-orders", state: "UT", scope: "part", stack: "Drupal / PDF orders", mode: "manual", cadence: null,
    sourceName: "Bureau of Land Management Utah",
    sourceUrl: "https://www.blm.gov/utah/fire",
    officialUrl: "https://www.blm.gov/utah/fire",
    error: "Utah Fire Info lists a Salt Lake Field Office Stage 1 order that the BLM district page omits. Verify the order with BLM.",
  },
  {
    id: "ak-dec-air-advisories", state: "AK", scope: "part", stack: "ASP.NET MVC / HTML and PDF", mode: "manual", cadence: null,
    sourceName: "Alaska Department of Environmental Conservation",
    sourceUrl: "https://dec.alaska.gov/Applications/Air/airtoolsweb/advisories/",
    officialUrl: "https://dec.alaska.gov/Applications/Air/airtoolsweb/advisories/",
    error: "The alert table and North Pole Stage 2 notice returned a DataDome challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "ak-anchorage-fire-safety", state: "AK", scope: "part", stack: "Revize / HTML and image", mode: "manual", cadence: null,
    sourceName: "Anchorage Fire Department",
    sourceUrl: "https://www.muni.org/departments/fire/wildfire_home/is_today_a_burn_day.php",
    officialUrl: "https://www.muni.org/departments/fire/wildfire_home/is_today_a_burn_day.php",
    error: "A reusable image shows the municipal recreational-fire decision, with no decision timestamp. Check the page or call 907-267-5020.",
  },
  {
    id: "id-deq-outdoor-map", state: "ID", scope: "part", stack: "ASP.NET MVC / GeoJSON", mode: "manual", cadence: null,
    sourceName: "Idaho Department of Environmental Quality",
    sourceUrl: "https://www2.deq.idaho.gov/air/AQIPublic/Map/Forecast",
    officialUrl: "https://www2.deq.idaho.gov/air/AQIPublic/Map/OutdoorBurn",
    error: "The 9.5 MB county feed has no decision timestamp. The map's displayed update time tracks the page request.",
  },
  {
    id: "pa-dcnr-county-bans", state: "PA", scope: "county", stack: "Adobe AEM / PDF map", mode: "manual", cadence: null,
    sourceName: "Pennsylvania DCNR Bureau of Forestry",
    sourceUrl: "https://elibrary.dcnr.pa.gov/PDFProvider.ashx?action=PDFStream&docID=8921989&docName=County+Burn+Bans&nativeExt=pdf",
    officialUrl: "https://www.pa.gov/agencies/dcnr/programs-and-services/community-outreach-and-development/wildfire/burn-bans",
    error: "The map viewed on November 24 was dated November 1. County bans are marked by map color and require review.",
  },
  {
    id: "ky-louisville-open-burning", state: "KY", scope: "part", stack: "HTML / Cloudflare", mode: "manual", cadence: null,
    sourceName: "Louisville Metro Air Pollution Control District",
    sourceUrl: "https://louisvilleky.gov/government/air-pollution-control-district/open-burning-louisville",
    officialUrl: "https://louisvilleky.gov/government/air-pollution-control-district/open-burning-louisville",
    error: "The metro burning and burn-plan guidance returned a Cloudflare challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "or-odf-edit-view", state: "OR", scope: "part", stack: "ArcGIS FeatureServer", mode: "manual", cadence: null,
    sourceName: "Oregon Department of Forestry",
    sourceUrl: "https://gis.odf.oregon.gov/odfags/rest/services/Hosted/Fire_Restriction_Edit_View/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json",
    officialUrl: "https://gisapps.odf.oregon.gov/firerestrictions/pfr.html",
    error: "The edit view in the map config returned ArcGIS error 499 Token Required on 2026-11-24. The map reads a separate public view.",
  },
  {
    id: "or-hillsboro-open-burning", state: "OR", scope: "part", stack: "Granicus / Vision HTML", mode: "manual", cadence: null,
    sourceName: "City of Hillsboro Fire & Rescue",
    sourceUrl: "https://www.hillsboro-oregon.gov/our-city/departments/fire/community-risk-reduction/burning-and-air-quality",
    officialUrl: "https://www.hillsboro-oregon.gov/our-city/departments/fire/community-risk-reduction/burning-and-air-quality",
    error: "The city burning rules and summer burn-ban notice returned HTTP 403 Access Denied on 2026-11-24.",
  },
  {
    id: "co-dfpc-fire", state: "CO", scope: "part", stack: "Drupal / HTML directory", mode: "manual", cadence: null,
    sourceName: "Colorado Division of Fire Prevention and Control",
    sourceUrl: "https://dfpc.colorado.gov/firerestriction",
    officialUrl: "https://dfpc.colorado.gov/firerestriction",
    error: "The directory returned CloudFront HTTP 403 on 2026-11-24. It directs users to local fire authorities and federal land managers.",
  },
  {
    id: "co-rocky-mountain-fire", state: "CO", scope: "part", stack: "ArcGIS Dashboard / WebMap", mode: "manual", cadence: null,
    sourceName: "Rocky Mountain Area Coordination Center",
    sourceUrl: "https://www.arcgis.com/sharing/rest/content/items/f0a56c48c00a4adfa7ceadba4fbdebe9/data?f=json",
    officialUrl: "https://www.arcgis.com/apps/dashboards/407bde860acc492bb53c972275bfbd33",
    error: "Colorado county boundaries carry no order status. The dashboard includes separate land-manager layers and Wyoming county orders.",
  },
  {
    id: "co-sable-altura", state: "CO", scope: "part", stack: "WordPress REST / Popup Maker", mode: "manual", cadence: null,
    sourceName: "Sable Altura Fire Protection District",
    sourceUrl: "https://sablealturafire.org/wp-json/wp/v2/popups/3229",
    officialUrl: "https://sablealturafire.org/fireprevention/",
    error: "The district's Arapahoe County Stage 1 text appears next to older no-ban artwork. Confirm the order with the district.",
  },
  {
    id: "wa-dnr-fdra", state: "WA", scope: "part", stack: "ArcGIS MapServer", mode: "manual", cadence: null,
    sourceName: "Washington DNR",
    sourceUrl: "https://gis.dnr.wa.gov/site3/rest/services/Public_Wildfire/WADNR_PUBLIC_WD_WildfireDanger/MapServer/1",
    officialUrl: "https://dnr.wa.gov/wildfire-resources/outdoor-burning/burn-restrictions",
    error: "Fire danger polygons do not establish order boundaries. Code 4 carries free-text exceptions and this layer exposes no report edit date.",
  },
  {
    id: "wa-everett-fire", state: "WA", scope: "part", stack: "CivicPlus / HTML", mode: "manual", cadence: null,
    sourceName: "Everett Fire Department",
    sourceUrl: "https://www.everettwa.gov/2332/Outdoor-Burning",
    officialUrl: "https://www.everettwa.gov/2332/Outdoor-Burning",
    error: "The outdoor burning page returned a Cloudflare challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "wa-south-county-fire", state: "WA", scope: "part", stack: "Granicus / Vision HTML", mode: "manual", cadence: null,
    sourceName: "South County Fire Regional Fire Authority",
    sourceUrl: "https://www.southsnofire.org/about-us/divisions/fire-marshal/burn-bans-and-regulations",
    officialUrl: "https://www.southsnofire.org/about-us/divisions/fire-marshal/burn-bans-and-regulations",
    error: "The burn bans and regulations page returned Akamai Access Denied (HTTP 403) on 2026-11-24.",
  },
  {
    id: "az-dffm-trust-lands", state: "AZ", scope: "part", stack: "ArcGIS FeatureServer", mode: "manual", cadence: null,
    sourceName: "Arizona Department of Forestry and Fire Management",
    sourceUrl: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/AZ_DFFM_Fire_Restrictions_2_view/FeatureServer/0",
    officialUrl: "https://dffm.az.gov/newsroom/fire-restrictions",
    error: "The layer retains stages superseded by DFFM's July 2026 rescission. The agency's fire restrictions page returned a Cloudflare challenge.",
  },
  {
    id: "az-coconino-emergency-management", state: "AZ", scope: "part", stack: "CivicPlus / HTML", mode: "manual", cadence: null,
    sourceName: "Coconino County Emergency Management",
    sourceUrl: "https://www.coconino.az.gov/2595/Fire-Restriction-Information",
    officialUrl: "https://www.coconino.az.gov/2595/Fire-Restriction-Information",
    error: "The county fire restrictions page returned a Cloudflare challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "ga-gfc-viewer", state: "GA", scope: "part", stack: "fiResponse / JSON", mode: "manual", cadence: null,
    sourceName: "Georgia Forestry Commission",
    sourceUrl: "https://georgiafc.firesponse.com/burn-permit/api/burnrestriction/all/public?levels=PUBLIC&levels=PRIVATE_PUBLIC",
    officialUrl: "https://georgiafc.firesponse.com/public/",
    error: "Public map summary provides area labels without dates or order types. The restriction type catalog returned HTTP 401.",
  },
  {
    id: "me-burn-permit-portal", state: "ME", scope: "part", stack: "State permit portal / HTML form", mode: "manual", cadence: null,
    sourceName: "Maine Forest Service Open Burn Permit System",
    sourceUrl: "https://apps1.web.maine.gov/burnpermit/public/index.html",
    officialUrl: "https://apps1.web.maine.gov/burnpermit/public/index.html",
    error: "Permit decisions depend on the selected town and burn type. The public landing page and municipality picker carry no dated decision list.",
  },
  {
    id: "ca-calfire", state: "CA", scope: "part", stack: "Sitecore / HTML table", mode: "manual", cadence: null,
    sourceName: "CAL FIRE", sourceUrl: "https://burnpermit.fire.ca.gov/current-burn-status/",
    officialUrl: "https://burnpermit.fire.ca.gov/current-burn-status/",
    error: "Akamai Access Denied (HTTP 403) from the verification host on 2026-11-23.",
  },
];
