import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { nationalFixture, snapshotBenchmarks, timings } from "./snapshot-benchmark";
import { SOURCES } from "../src/worker/sources/registry";
import type { CountyStatus } from "../src/shared/types";
import { ADAPTERS } from "../src/worker/adapters";
import { parse as parseFl } from "../src/worker/adapters/fl";
import { parse as parseIa } from "../src/worker/adapters/ia";
import { parse as parseIn } from "../src/worker/adapters/in";
import { parse as parseLa } from "../src/worker/adapters/la";
import { parse as parseMs } from "../src/worker/adapters/ms";
import { parse as parseOk } from "../src/worker/adapters/ok";
import { parse as parseTx, parseTxt } from "../src/worker/adapters/tx";
import { COUNTIES } from "../src/worker/counties";
import { parseAlaskaPermitZones } from "../src/worker/sources/ak/permits";
import { akDecWinterBurning, parseAlaskaFireSeason, parseAlaskaWinterBurning } from "../src/worker/sources/ak/seasonal";
import { arFaulknerCountyOrders, parseFaulknerBan } from "../src/worker/sources/ar/faulkner";
import { parseArizonaAreaA } from "../src/worker/sources/az/area-a";
import { azGrandCanyonFire, parseGrandCanyonFire } from "../src/worker/sources/az/grand-canyon";
import { azPimaWildfire, parsePimaWildfire } from "../src/worker/sources/az/pima";
import { parsePfirs, pfirs } from "../src/worker/sources/ca/pfirs";
import {
  coArapahoeFire, coBoulderFire, coDouglasFire, coElPasoFire, coEstesFire, coLarimerFire,
  parseArapahoeFire, parseBoulderFire, parseDouglasFire, parseElPasoFire, parseEstesFire, parseLarimerFire,
} from "../src/worker/sources/co/county-status";
import { coDenverAir, parseDenverAir } from "../src/worker/sources/co/denver-air";
import { ctDeepFireDanger, parseCtFireDanger } from "../src/worker/sources/ct/fire-danger";
import { deActionDays, parseDeActionDays } from "../src/worker/sources/de/air-quality";
import { deOpenBurning, parseDeOpenBurning } from "../src/worker/sources/de/open-burning";
import { gaEpdNonSummer, parseEpdSeasonal } from "../src/worker/sources/ga/epd";
import { parseGwinnett } from "../src/worker/sources/ga/gwinnett";
import { hinesvilleFormLink, parseHinesvilleClosure } from "../src/worker/sources/ga/hinesville";
import { GA_LOCAL_RULES, gaLocalRuleKeys, gaLocalRuleSources, parseGaLocalRule } from "../src/worker/sources/ga/local-rules";
import { parsePermitCalendar } from "../src/worker/sources/ga/permit-calendar";
import { iaCountyBulletins } from "../src/worker/sources/ia/county-status";
import { iaLocalCalendars } from "../src/worker/sources/ia/local-rules";
import { idIdlStages, parseIdlStages } from "../src/worker/sources/id/idl-stages";
import { idKootenaiAir, parseKootenaiAir } from "../src/worker/sources/id/kootenai-air";
import { idSeasonal, parseIdahoSeasonal } from "../src/worker/sources/id/seasonal";
import { ilCrawfordCountyOrders, parseCrawfordCountyOrders } from "../src/worker/sources/il/crawford";
import { illinoisGuidanceSources, parseIllinoisGuidance } from "../src/worker/sources/il/guidance";
import { ksDickinsonDistricts, parseDickinsonDistricts } from "../src/worker/sources/ks/dickinson";
import { ksAprilBurning, ksFranklinPermits, ksOpenBurning, parseFranklinPermits, parseKansasApril, parseKansasOpenBurning } from "../src/worker/sources/ks/open-burning";
import { alAdemOpenBurning, alJeffersonOpenBurning, parseAdemOpenBurning, parseJeffersonOpenBurning } from "../src/worker/sources/al/air-rules";
import { alCahabaBurning, parseCahabaBurning } from "../src/worker/sources/al/cahaba";
import { kyForestryCountyBans, parseKentuckyCountyBans } from "../src/worker/sources/ky/county-bans";
import { kySeasonal, parseKentuckySeasonal } from "../src/worker/sources/ky/seasonal";
import { arcgisRows, codedDomains, dataLastEditDate, findOperationalLayers } from "../src/worker/sources/lib/arcgis";
import { webFormsPost } from "../src/worker/sources/lib/aspnet";
import { activeRule, CALENDAR_RULES } from "../src/worker/sources/lib/calendar";
import { civicPlusNotices } from "../src/worker/sources/lib/civicplus";
import { decodeFeed, parseCsv, parseFeed, parseJson } from "../src/worker/sources/lib/feeds";
import { blockAfterHeading, extractHtml, parseHtml } from "../src/worker/sources/lib/html";
import { BlockedError, fetchSource } from "../src/worker/sources/lib/http";
import { manualPdf } from "../src/worker/sources/lib/pdf";
import { sharePointListItems } from "../src/worker/sources/lib/sharepoint";
import { parseNinjaRows, parseWpItems } from "../src/worker/sources/lib/wordpress";
import { maAirAdvisories, parseMassDepAdvisories } from "../src/worker/sources/ma/air-advisories";
import { maOpenBurning, parseMaOpenBurning } from "../src/worker/sources/ma/open-burning";
import { mergeSources, type SourceInput } from "../src/worker/sources/merge";
import { mdSummerAir, parseMdSummerAir } from "../src/worker/sources/md/summer-air";
import { mdDnrWoodland, parseMdWoodland } from "../src/worker/sources/md/woodland";
import { meOpenBurningPermits, parseMaineOpenBurning } from "../src/worker/sources/me/open-burning";
import { meTownPermitHolds, parseMaineTownPermits } from "../src/worker/sources/me/town-permits";
import { miPermits, parseMichiganPermits } from "../src/worker/sources/mi/permits";
import { mnRestrictions, parseMinnesotaRestrictions } from "../src/worker/sources/mn/restrictions";
import { moCapeGirardeau, parseCapeGirardeauDay } from "../src/worker/sources/mo/cape-girardeau";
import { moLakeOzark, parseLakeOzarkDay } from "../src/worker/sources/mo/lake-ozark";
import { moLocalCalendars } from "../src/worker/sources/mo/local-rules";
import { moMountainView, parseMountainViewAlerts } from "../src/worker/sources/mo/mountain-view";
import { moShowMeFireBans, parseShowMeFireBans } from "../src/worker/sources/mo/show-me-fire";
import { moYardWaste, parseMoYardWaste } from "../src/worker/sources/mo/yard-waste";
import { mtDeqFall, parseDeqFall } from "../src/worker/sources/mt/deq-fall";
import { mtDnrcRestrictions, parseDnrcRestrictions } from "../src/worker/sources/mt/dnrc";
import { parseGallatin } from "../src/worker/sources/mt/gallatin";
import { mtMissoulaSeasons, parseMissoulaSeasons } from "../src/worker/sources/mt/missoula";
import { ncAirHours, parseNcAirHours } from "../src/worker/sources/nc/air-hours";
import { applyNcOrders, ncForestOrders, parseNcNewsroom, parseNcOrder } from "../src/worker/sources/nc/forest-orders";
import { ncPermits, parseNcPermits } from "../src/worker/sources/nc/permits";
import { njRestrictions, parseNjRestrictions } from "../src/worker/sources/nj/restrictions";
import { nmAngelFirePermits, parseAngelFirePermits } from "../src/worker/sources/nm/angel-fire";
import { nmBernalilloOpenBurning, nmOpenBurning, parseNmOpenBurning } from "../src/worker/sources/nm/open-burning";
import { nmStateParks, parseNmStateParks } from "../src/worker/sources/nm/state-parks";
import { nvTmfpdPileBurning, parseTmfpdPileBurning } from "../src/worker/sources/nv/tmfpd";
import { nvUsfsSpringMountains, parseSpringMountainsOrder } from "../src/worker/sources/nv/usfs";
import { nwsFireWeather, parseNwsAlerts } from "../src/worker/sources/nws/alerts";
import { nyDecBrushBurning, parseDecBrushBurning } from "../src/worker/sources/ny/dec-brush-burning";
import { nyNycBarbecuing, parseNycBarbecuing } from "../src/worker/sources/ny/nyc-barbecuing";
import { ohSeasonal, parseOhioSeasonal } from "../src/worker/sources/oh/seasonal";
import { orLrapaHeating, orLrapaOutdoor, parseLrapaHeating, parseLrapaOutdoor } from "../src/worker/sources/or/lrapa";
import { orOdfPublicUse, parseOdfPublicUse } from "../src/worker/sources/or/odf";
import { orWillametteBackyard, parseWillametteBackyard } from "../src/worker/sources/or/willamette";
import { paCarrollValley, parseCarrollValley } from "../src/worker/sources/pa/carroll-valley";
import { paStateForestSpring, parsePaStateForestSpring } from "../src/worker/sources/pa/seasonal";
import { parseScAirQuality, scAirQuality } from "../src/worker/sources/sc/air-quality";
import { parseScfcDebris } from "../src/worker/sources/sc/debris";
import { parseSdBlmRestrictions, sdBlmFireRestrictions } from "../src/worker/sources/sd/blm";
import { parseBlackHillsPileBurning, sdBlackHillsPileBurning } from "../src/worker/sources/sd/pile-burning";
import { hiCabNoBurnPeriods, parseHiNoBurnPeriods } from "../src/worker/sources/hi/no-burn-periods";
import { hiCabOpenBurning, parseHiOpenBurning } from "../src/worker/sources/hi/open-burning";
import { dcOpenBurning, parseDcOpenBurning } from "../src/worker/sources/dc/open-burning";
import { dcRockCreekFireRules, parseRockCreekFireRules } from "../src/worker/sources/dc/rock-creek";
import { parseTennesseeAirQuality, tnAirQualityPermitHolds } from "../src/worker/sources/tn/air-quality";
import { latestGatlinburgNotice, parseGatlinburgPermitNotice, tnGatlinburgPermitNotices } from "../src/worker/sources/tn/gatlinburg";
import { parseHamiltonBurnDecision, tnHamiltonDailyBurning } from "../src/worker/sources/tn/hamilton";
import { tnLocalCalendars } from "../src/worker/sources/tn/local-rules";
import { parseTennesseePermitHolds, parseTennesseePermitRoster, tnForestryPermitHolds } from "../src/worker/sources/tn/permit-holds";
import { parseTennesseePermitSeason, tnSeasonalBurnPermits } from "../src/worker/sources/tn/seasonal";
import { parseTullahomaForm, parseTullahomaPermitPage, tnTullahomaDailyBurning, tullahomaRows } from "../src/worker/sources/tn/tullahoma";
import { parseUtahOrders, utFfslFireOrders } from "../src/worker/sources/ut/orders";
import { parseUtahSeasonal, utClosedFireSeason } from "../src/worker/sources/ut/seasonal";
import { parseBrunswickNotices, vaBrunswickBurnBan } from "../src/worker/sources/va/brunswick";
import { vaLocalCalendars } from "../src/worker/sources/va/local-rules";
import { parseNottowayNews, vaNottowayBurnBan } from "../src/worker/sources/va/nottoway";
import { parseRapidanAlerts, vaRapidanAlerts } from "../src/worker/sources/va/rapidan";
import { parseVirginiaSeasonal, vaSeasonal } from "../src/worker/sources/va/seasonal";
import { parseShenandoahAlerts, vaShenandoahAlerts } from "../src/worker/sources/va/shenandoah";
import { parseFprSituation, vtFprRestrictions } from "../src/worker/sources/vt/fpr";
import { parseFranklinBurning, vtFranklinBurning } from "../src/worker/sources/vt/franklin";
import { parseVermontPermits, vtOpenBurningPermits } from "../src/worker/sources/vt/permits";
import { parseWestVirginiaSeasonal, wvForestryFireSeason } from "../src/worker/sources/wv/seasonal";
import { parseEcologyAir, waEcologyAir } from "../src/worker/sources/wa/ecology-air";
import { parseKingFireSafety, waKingFireSafety } from "../src/worker/sources/wa/king-fire-safety";
import { parsePugetSound, waPugetSoundAir } from "../src/worker/sources/wa/puget-sound";
import { parseWisconsinPermits, wiPermits } from "../src/worker/sources/wi/permits";
import { parseWyomingCountyOrders, wyCountyOrders } from "../src/worker/sources/wy/county-orders";
import { parseWyomingStateLands, wyStateLands } from "../src/worker/sources/wy/state-lands";
import { ndDesRestrictions, parseNdRestrictions } from "../src/worker/sources/nd/restrictions";
import { neLincolnLancasterAir, parseNeLincolnAir } from "../src/worker/sources/ne/lincoln-air";
import { neOpenBurningLaw, parseNeOpenBurning } from "../src/worker/sources/ne/open-burning";
import { nhOpenBurningPermits, parseNhOpenBurning } from "../src/worker/sources/nh/open-burning";
import { nhTownHallRoad, parseTownHallRoad } from "../src/worker/sources/nh/town-hall-road";
import { parseRiDemRule, riDemForest, riDemParks } from "../src/worker/sources/ri/dem-rules";
import { parseRiTownRule, riTownSources } from "../src/worker/sources/ri/town-rules";

const sourceUrl = new URL("../src/worker/sources/", import.meta.url);
const from = (path: string) => readFileSync(new URL(path, sourceUrl));
const utf8 = (path: string) => from(path).toString("utf8");
const fixture = (name: string) => utf8(`lib/fixtures/${name}`);
const adapter = (name: string) => utf8(`../adapters/fixtures/${name}.json`);
const raw = (path: string) => Uint8Array.from(from(path)).buffer;
const now = new Date("2026-11-24T05:00:52Z");
const checked = now.toISOString();
const [ok, tx, fl, ind, la, ms, ia] = ["ok", "tx", "fl", "in", "la", "ms", "ia"].map(adapter);
const txText = raw("../adapters/fixtures/tx.txt");
const pfirsHtml = utf8("ca/fixtures/pfirs.html");
const miMap = utf8("mi/fixtures/permits-2026-11-24.json");
const njDivisions = utf8("nj/fixtures/divisions-2026-11-24.json");
const njCounties = utf8("nj/fixtures/counties-2026-11-24.json");
const wiPermitsJson = utf8("wi/fixtures/permits-2026-11-24.json");
const mnRestrictionsJson = utf8("mn/fixtures/restrictions-2026-11-24.json");
const nwsLive = utf8("nws/fixtures/active-2026-11-24.json");
const nwsArchive = utf8("nws/fixtures/archive-2026-11-18-to-19.json");
const nwsCaptured = new Date("2026-11-24T07:42:59Z");
const vtCaptured = new Date("2026-11-24T13:40:27Z");
const vtSituation = utf8("vt/fixtures/fpr-situation-2026-11-24.html");
const vtFranklin = utf8("vt/fixtures/franklin-home-2026-11-24.html");
const vtStatute = utf8("vt/fixtures/statute-2645-2026-11-24.html");
const parseVtFpr = async () => parseFprSituation(await extractHtml(vtSituation, { blockLinks: true }), vtCaptured, () => {
  throw new Error("Unexpected linked FPR order in current situation fixture");
});
const parseVtFranklin = async () => parseFranklinBurning(await extractHtml(vtFranklin), vtCaptured);
const parseVtPermits = async () => parseVermontPermits(await extractHtml(vtStatute), vtCaptured);
const nmCaptured = new Date("2026-11-24T14:00:00Z");
const nmParksHtml = utf8("nm/fixtures/state-parks-2026-11-24.html");
const nmAngelHtml = utf8("nm/fixtures/angel-fire-2026-11-24.html");
const nmStateCode = raw("nm/fixtures/open-burning-nmac-2026-11-24.html");
const nmBernalilloCode = raw("nm/fixtures/bernalillo-open-burning-nmac-2026-11-24.html");
const parseNmParksFixture = () => parseNmStateParks(nmParksHtml, nmCaptured);
const parseNmAngelFixture = () => parseAngelFirePermits(nmAngelHtml, nmCaptured);
const parseNmStateCodeFixture = () => parseNmOpenBurning(nmStateCode, "state", nmCaptured);
const parseNmBernalilloCodeFixture = () => parseNmOpenBurning(nmBernalilloCode, "bernalillo", nmCaptured);
const deCaptured = new Date("2026-11-24T14:16:32Z");
const deGuidance = utf8("de/fixtures/dnrec-open-burning-2026-11-24.json");
const deAirNow = utf8("de/fixtures/airnow-2026-11-24.dat");
const deActionDay = utf8("de/fixtures/airnow-2026-07-16.dat");
const parseDeGuidance = () => parseDeOpenBurning(JSON.parse(deGuidance), deCaptured);
const parseDeCurrentAir = () => parseDeActionDays(deAirNow, deCaptured);
const parseDeArchivedAir = () => parseDeActionDays(deActionDay, new Date("2026-07-17T15:00:00Z"));
const maCaptured = new Date("2026-11-24T14:38:39Z");
const maGuidance = utf8("ma/fixtures/woburn-open-burning-2026-11-24.json");
const parseMaGuidance = (at = maCaptured) => parseMaOpenBurning(JSON.parse(maGuidance), at);
const maAdvisories = gunzipSync(from("ma/fixtures/massdep-open-burning-2026-11-24.xml.gz")).toString("utf8");
const parseMaAdvisories = (at: Date) => parseMassDepAdvisories(maAdvisories, at);
const meCaptured = new Date("2026-11-24T15:02:56Z");
const meClasses = utf8("me/fixtures/class-days-2026-11-24.json");
const meStatute = utf8("me/fixtures/open-burning-2026-11-24.html");
const parseMeClasses = () => parseMaineTownPermits(meClasses, meCaptured);
const parseMeStatute = () => parseMaineOpenBurning(meStatute, meCaptured);
const ctCaptured = new Date("2026-11-24T15:15:32Z");
const ctReport = utf8("ct/fixtures/fire-danger-2026-11-24.html");
const parseCtFireDangerFixture = () => parseCtFireDanger(ctReport, ctCaptured);
const ilCaptured = new Date("2026-11-24T15:37:59Z");
const ilCrawford = utf8("il/fixtures/wtye-crawford-2026-11-24.json");
const parseIlCrawford = (at = ilCaptured) => parseCrawfordCountyOrders(JSON.parse(ilCrawford), at);
const ilJobs = ([
  ["IL EPA open-burning FAQ and calendar", "state", "epa-faq"],
  ["IL Cook County permits", "cook", "cook-permit"],
  ["IL Kane County burning rules", "kane", "kane-rules"],
  ["IL Lake County yard waste and calendar", "lake", "lake-rules"],
  ["IL Naperville burning rules", "naperville", "naperville-rules"],
] as const).map(([name, jurisdiction, file]) => {
  const html = utf8(`il/fixtures/${file}-2026-11-24.html`);
  return [name, illinoisGuidanceSources[jurisdiction], (at = ilCaptured) => parseIllinoisGuidance(html, jurisdiction, at)] as const;
});
const ksCaptured = new Date("2026-11-24T15:52:01Z");
const ksDistrictLayer = utf8("ks/fixtures/dickinson-layer-2026-11-24.json");
const ksDistricts = utf8("ks/fixtures/dickinson-districts-2026-11-24.json");
const ksStateHtml = utf8("ks/fixtures/joco-regulations-2026-11-24.html");
const ksAprilHtml = utf8("ks/fixtures/ksfire-april-2026-11-24.html");
const ksFranklinHtml = utf8("ks/fixtures/franklin-permits-2026-11-24.html");
const parseKsDistricts = () => parseDickinsonDistricts(JSON.parse(ksDistrictLayer), JSON.parse(ksDistricts), ksCaptured);
const parseKsState = () => parseKansasOpenBurning(ksStateHtml, ksCaptured);
const parseKsApril = (at = ksCaptured) => parseKansasApril(ksAprilHtml, at);
const parseKsFranklin = () => parseFranklinPermits(ksFranklinHtml, ksCaptured);
const alCaptured = new Date("2026-11-24T16:03:46Z");
const alCahabaHtml = utf8("al/fixtures/cahaba-valley-2026-11-24.html");
const alJeffersonHtml = utf8("al/fixtures/jefferson-health-2026-11-24.html");
const parseAlAdem = (at = alCaptured) => parseAdemOpenBurning(alCahabaHtml, at);
const parseAlJefferson = () => parseJeffersonOpenBurning(alJeffersonHtml, alCaptured);
const parseAlCahaba = () => parseCahabaBurning(alCahabaHtml, alCaptured, "Tue, 24 Nov 2026 16:03:45 GMT");

const nhCaptured = new Date("2026-11-24T16:20:16Z");
const nhStatute = utf8("nh/fixtures/rsa-227-l-17-2026-11-24.html");
const nhForestAlerts = utf8("nh/fixtures/usfs-alerts-2026-11-24.html");
const nhRoadOrder = utf8("nh/fixtures/usfs-town-hall-road-2026-11-24.html");
const parseNhStatuteFixture = () => parseNhOpenBurning(nhStatute, nhCaptured);
const parseNhForestFixture = () => parseTownHallRoad(nhForestAlerts, async () => nhRoadOrder, nhCaptured);

const neStatuteCaptured = new Date("2026-11-24T16:31:48Z");
const neLincolnCaptured = new Date("2026-11-24T16:32:38Z");
const neStatute = utf8("ne/fixtures/statute-81-520-01-2026-11-24.html");
const neLincolnAir = utf8("ne/fixtures/lincoln-air-2026-11-24.html");
const parseNeStatuteFixture = () => parseNeOpenBurning(neStatute, neStatuteCaptured);
const parseNeLincolnFixture = () => parseNeLincolnAir(neLincolnAir, neLincolnCaptured);

const riCaptured = new Date("2026-11-24T16:46:44Z");
const riSpring = new Date("2027-04-01T14:00:00Z");
const riFixture = (name: string) => utf8(`ri/fixtures/${name}-2026-11-24.html`);
const riForest = riFixture("rules-forest");
const riParks = riFixture("rules-parks");
const riNarragansett = riFixture("narragansett");
const riNorthKingstown = riFixture("northkingstown");
const riSouthKingstown = riFixture("southkingstown");
const riJobs = [
  ["RI DEM forest-fire rules", riDemForest, (at: Date) => parseRiDemRule(riForest, at, "forest")],
  ["RI DEM state park fire rules", riDemParks, (at: Date) => parseRiDemRule(riParks, at, "parks")],
  ["RI Narragansett CivicPlus rules", riTownSources.narragansett, (at: Date) => parseRiTownRule(riNarragansett, at, "narragansett")],
  ["RI North Kingstown CivicPlus rules", riTownSources.northkingstown, (at: Date) => parseRiTownRule(riNorthKingstown, at, "northkingstown")],
  ["RI South Kingstown CivicPlus rules", riTownSources.southkingstown, (at: Date) => parseRiTownRule(riSouthKingstown, at, "southkingstown")],
] as const;

const sdCaptured = new Date("2026-11-24T17:04:00Z");
const sdPermitHtml = utf8("sd/fixtures/pile-burning-2026-11-24.html");
const sdBlmHtml = utf8("sd/fixtures/blm-current-2026-11-24.html");
const sdBlmOrder = raw("sd/fixtures/blm-stage1-2026-10-01.pdf");
const parseSdPermitFixture = async () => parseBlackHillsPileBurning(await extractHtml(sdPermitHtml), sdCaptured);
const parseSdBlmFixture = () => parseSdBlmRestrictions(sdBlmHtml, sdCaptured, async () => new Response(sdBlmOrder));

const hiCaptured = new Date("2026-11-24T17:14:33Z");
const hiCabNotice = utf8("hi/fixtures/cab-no-burn-2026-11-24.html");
const hiCabRules = utf8("hi/fixtures/cab-open-burning-2026-11-24.html");
const parseHiNoticeFixture = async () => parseHiNoBurnPeriods(await extractHtml(hiCabNotice), hiCaptured);
const parseHiRulesFixture = () => parseHiOpenBurning(hiCabRules, hiCaptured);

const dcCaptured = new Date("2026-11-24T17:31:00Z");
const dcChapter = utf8("dc/fixtures/dcregs-chapter-6-2026-11-24.html");
const dcRule = raw("dc/fixtures/dcregs-section-604-2026-11-24.doc");
const dcPark = utf8("dc/fixtures/rock-creek-compendium-2026-11-24.html");
const parseDcRuleFixture = () => parseDcOpenBurning(dcChapter, dcCaptured, async () => new Response(dcRule));
const parseDcParkFixture = () => parseRockCreekFireRules(dcPark, dcCaptured);

const parseNwsLive = () => parseNwsAlerts(JSON.parse(nwsLive), nwsCaptured);
const parseNwsArchive = () => parseNwsAlerts(JSON.parse(nwsArchive), new Date("2026-11-18T20:00Z"), { archive: true });
const nyDecHtml = utf8("ny/fixtures/dec-open-burning-2026-11-24.html");
const nyNycHtml = utf8("ny/fixtures/nyc-311-barbecuing-2026-11-24.html");
const parseNyDecFixture = async () => parseDecBrushBurning(await extractHtml(nyDecHtml), now);
const parseNyNycFixture = async () => parseNycBarbecuing(await extractHtml(nyNycHtml), now);
const vaStatute = utf8("va/fixtures/section-10.1-1142-2026-11-24.html");
const vaRapidanHtml = utf8("va/fixtures/rapidan-wma-2026-11-24.html");
const vaParkJson = utf8("va/fixtures/shen-park-alerts-2026-11-24.json");
const vaBrunswickHtml = utf8("va/fixtures/brunswick-public-notices-2026-11-24.html");
const parseVaBrunswickFixture = () => parseBrunswickNotices(vaBrunswickHtml, now);
const vaNottowayHtml = utf8("va/fixtures/nottoway-news-2026-11-24.html");
const parseVaNottowayFixture = () => parseNottowayNews(vaNottowayHtml, now);
const vaLocalFixtures = vaLocalCalendars.map(({ id, kind, source, parse }) => {
  const body = raw(`va/fixtures/rule-${id}-2026-11-24.${kind}`);
  return { source, parse: () => parse(new Response(body), now) };
});
const vaSpring = new Date("2027-02-15T05:00:00Z");
const parseVaStatuteFixture = async (at: Date) => parseVirginiaSeasonal(await extractHtml(vaStatute), at);
const parseVaRapidanFixture = async () => parseRapidanAlerts(await extractHtml(vaRapidanHtml), now);
const parseVaParkFixture = () => parseShenandoahAlerts(JSON.parse(vaParkJson), now);
const wvForestryJson = utf8("wv/fixtures/forestry-fire-laws-2026-11-24.json");
const wvDaytime = new Date("2026-11-24T13:16:05Z");
const parseWvForestryFixture = () => parseWestVirginiaSeasonal(JSON.parse(wvForestryJson), wvDaytime);
const mdWoodlandHtml = utf8("md/fixtures/dnr-woodland-2026-11-24.html");
const mdComarHtml = utf8("md/fixtures/comar-26.11.07.03-2026-11-24.html");
const mdSummer = new Date("2027-06-01T04:00:00Z");
const parseMdWoodlandFixture = async () => parseMdWoodland(await extractHtml(mdWoodlandHtml), now);
const parseMdSummerFixture = async (at: Date) => parseMdSummerAir(await extractHtml(mdComarHtml), at);
const ohStatute = utf8("oh/fixtures/section-1503.18-2026-11-24.html");
const gaGwinnettHtml = utf8("ga/fixtures/gwinnett-2026-11-24.html");
const gaSummerHtml = utf8("ga/fixtures/epd-summer-2026-11-24.html");
const gaNonSummerHtml = utf8("ga/fixtures/epd-non-summer-2026-11-24.html");
const gaHinesvillePage = utf8("ga/fixtures/hinesville-permit-page-2026-11-24.html");
const gaHinesvilleForm = utf8("ga/fixtures/hinesville-closed-form-2026-11-24.html");
const gaPermitCalendar = utf8("ga/fixtures/permit-habersham-closed-2026-11-24.json");
const gaPermitDay = new Date("2026-11-18T19:00:00Z");
const gaRuleJobs = gaLocalRuleKeys.map((key, index) => {
  const site = GA_LOCAL_RULES[key];
  const name = key === "hinesville" ? "hinesville-permit-page" : `rule-${key}`;
  const path = `ga/fixtures/${name}-2026-11-24`;
  const body = site.kind === "scan" ? new Uint8Array(gunzipSync(raw(path + ".html.gz"))) : raw(`${path}.${site.kind}`);
  return {
    source: gaLocalRuleSources[index],
    parse: () => parseGaLocalRule(new Response(body), now, key),
  };
});
const azPimaHtml = utf8("az/fixtures/pima-wildfire-2026-11-24.html");
const azGrandCanyonHtml = utf8("az/fixtures/grand-canyon-fire-2026-11-24.html");
const azStatute = utf8("az/fixtures/section-49-501-2026-11-24.html");
const waEcologyHtml = utf8("wa/fixtures/ecology-burn-bans-2026-11-24.html");
const waPugetHtml = utf8("wa/fixtures/puget-status-2026-11-24.html");
const waKingHtml = utf8("wa/fixtures/king-fire-safety-2026-11-24.html");
const michigan = fixture("michigan-form.html");
const kentucky = fixture("kentucky-list.html");
const placer = fixture("placer-newsflash.html");
const akamai = fixture("akamai.html");
const faulkner = fixture("faulkner-search.json");
const layer = fixture("alaska-layer.json");
const dashboard = fixture("fl-dashboard.json");
const webmap = fixture("fl-webmap.json");
const csv = fixture("wisconsin.csv");
const json = fixture("wisconsin.json");
const rss = raw("lib/fixtures/texas-rss.xml");
const pdf = raw("lib/fixtures/faulkner-rescind.pdf");
const parseCaFixture = () => parsePfirs(parseHtml(pfirsHtml), now);
const parseMiFixture = () => parseMichiganPermits(JSON.parse(miMap), now);
const parseNjFixture = () => parseNjRestrictions(JSON.parse(njDivisions), JSON.parse(njCounties), now);
const parseWiFixture = () => parseWisconsinPermits(wiPermitsJson, now);
const parseMnFixture = () => parseMinnesotaRestrictions(mnRestrictionsJson, now);
const parseOhFixture = () => parseOhioSeasonal(parseHtml(ohStatute), now);
const gwinnettDecisionDay = new Date("2026-11-23T16:00:00Z");
const summerDay = new Date("2026-07-01T14:00:00Z");
const parseGwinnettFixture = async () => parseGwinnett(await extractHtml(gaGwinnettHtml), gwinnettDecisionDay);
const parseGaSummerFixture = async () => parseEpdSeasonal(await extractHtml(gaSummerHtml), summerDay, "summer");
const parseGaNonSummerFixture = async () => parseEpdSeasonal(await extractHtml(gaNonSummerHtml), now, "nonSummer");
const parseAzPimaFixture = async () => parsePimaWildfire(await extractHtml(azPimaHtml), now);
const parseAzGrandCanyonFixture = async () => parseGrandCanyonFire(await extractHtml(azGrandCanyonHtml), now);
const parseAzAreaAFixture = async () => parseArizonaAreaA(await extractHtml(azStatute), summerDay);
const parseWaEcologyFixture = () => parseEcologyAir(waEcologyHtml, now);
const parseWaPugetFixture = () => parsePugetSound(waPugetHtml, now);
const parseWaKingFixture = async () => parseKingFireSafety(await extractHtml(waKingHtml), now);
const kyList = utf8("ky/fixtures/county-burn-bans-2026-11-24.json");
const kyStatute = raw("ky/fixtures/krs-149.400-2026-11-24.pdf");
const kyCaptured = new Date("2026-11-24T07:31:07Z");
const parseKyListFixture = () => parseKentuckyCountyBans(JSON.parse(kyList), kyCaptured);
const parseKyStatuteFixture = () => parseKentuckySeasonal(new Response(kyStatute), kyCaptured);
const paNews = utf8("pa/fixtures/carroll-valley-news-2026-11-24.html");
const paStatute = utf8("pa/fixtures/state-forest-fires-2026-11-24.html");
const paCaptured = new Date("2026-11-24T08:11:00Z");
const paSpringDay = new Date("2026-05-25T15:00:00Z");
const parsePaNewsFixture = () => parseCarrollValley(paNews, paCaptured);
const parsePaStatuteFixture = (time = paSpringDay) => extractHtml(paStatute).then((parts) => parsePaStateForestSpring(parts, time));
const idCaptured = new Date("2026-11-24T08:32:00Z");
const idLayer = utf8("id/fixtures/idl-layer-2026-11-24.json");
const idZones = utf8("id/fixtures/idl-zones-2026-11-24.json");
const idForecast = utf8("id/fixtures/deq-coeur-dalene-2026-11-24.html");
const idStatute = utf8("id/fixtures/section-38-115-2026-11-24.html");
const parseIdlFixture = () => parseIdlStages(JSON.parse(idLayer), arcgisRows(JSON.parse(idZones), { requireComplete: true }), idCaptured);
const parseIdForecastFixture = () => parseKootenaiAir(idForecast, idCaptured);
const parseIdStatuteFixture = (time = summerDay) => parseIdahoSeasonal(idStatute, time);
const utCaptured = new Date("2026-11-24T09:10:16Z");
const utLayer = utf8("ut/fixtures/layer-2026-11-24.json");
const utOrders = utf8("ut/fixtures/orders-2026-11-24.json");
const utStatute = utf8("ut/fixtures/code-index-2026-11-24.html");
const parseUtOrders = () => parseUtahOrders(JSON.parse(utLayer), JSON.parse(utOrders), utCaptured);
const parseUtStatute = (time = summerDay) => parseUtahSeasonal(utStatute, time);
const mtCaptured = new Date("2026-11-24T09:25:38Z");
const mtDeq = utf8("mt/fixtures/deq-fall-2026-11-24.json");
const mtDnrcLayer = utf8("mt/fixtures/dnrc-layer-2026-11-24.json");
const mtDnrcOrders = utf8("mt/fixtures/dnrc-orders-2026-11-24.json");
const mtGallatin = utf8("mt/fixtures/gallatin-2026-11-24.html");
const mtMissoula = utf8("mt/fixtures/missoula-2026-11-24.html");
const parseMtDeq = () => parseDeqFall(JSON.parse(mtDeq), mtCaptured);
const parseMtDnrc = () => parseDnrcRestrictions(JSON.parse(mtDnrcLayer), JSON.parse(mtDnrcOrders), mtCaptured);
const parseMtGallatin = () => parseGallatin(mtGallatin, new Date("2026-11-20T19:00:00Z"));
const parseMtMissoula = async () => parseMissoulaSeasons(await extractHtml(mtMissoula), mtCaptured);
const wyCaptured = new Date("2026-11-24T09:41:20Z");
const wyCountyLayer = utf8("wy/fixtures/county-layer-2026-11-24.json");
const wyCounties = utf8("wy/fixtures/county-restrictions-2026-11-24.json");
const wyLands = utf8("wy/fixtures/state-lands-rule-2026-11-24.json");
const parseWyCountyFixture = () => parseWyomingCountyOrders(JSON.parse(wyCountyLayer), JSON.parse(wyCounties), wyCaptured);
const parseWyLandFixture = () => parseWyomingStateLands(JSON.parse(wyLands), wyCaptured);
const ndCaptured = new Date("2026-11-24T10:06:16Z");
const ndRestrictions = utf8("nd/fixtures/restrictions-2026-11-24.json");
const ndFireDanger = utf8("nd/fixtures/fire-danger-2026-11-24.json");
const parseNdFixture = () => parseNdRestrictions(JSON.parse(ndRestrictions), JSON.parse(ndFireDanger), ndCaptured);
const nvCaptured = new Date("2026-11-24T10:16:08Z");
const nvTmfpdHtml = utf8("nv/fixtures/tmfpd-pile-burning-2026-11-24.html");
const parseNvTmfpdFixture = () => parseTmfpdPileBurning(nvTmfpdHtml, nvCaptured);
const nvForestCaptured = new Date("2026-11-24T10:21:34Z");
const nvForestHtml = utf8("nv/fixtures/usfs-current-fire-restrictions-2026-11-24.html");
const parseNvForestFixture = async () => parseSpringMountainsOrder(await extractHtml(nvForestHtml, { links: true }), nvForestCaptured);
const arCaptured = new Date("2026-11-24T10:31:53Z");
const arBanner = utf8("ar/fixtures/faulkner-banner-2026-11-24.html");
const arOrder = raw("ar/fixtures/faulkner-order-26-204-2026-11-24.pdf");
const parseArFaulknerFixture = () => parseFaulknerBan(arBanner, arCaptured, () => manualPdf(new Response(arOrder)));
const scCaptured = new Date("2026-11-24T10:50:00Z");
const scDebris = utf8("sc/fixtures/scfc-debris-2026-11-24.json");
const scRegulation = raw("sc/fixtures/des-61-62-2-2026-11-24.pdf");
const parseScDebrisFixture = () => {
  const entries: Array<{ county: string; status: { county: string } }> = JSON.parse(scDebris);
  return entries.flatMap((data) => parseScfcDebris(data, scCaptured, {
    name: data.county, wpId: Number(data.status.county), sourceId: "sc-scfc-debris",
  }));
};
const parseScRegulationFixture = () => parseScAirQuality(new Response(scRegulation), scCaptured);
const ncNow = new Date("2026-11-24T12:00:00Z");
const ncNewsroom = utf8("nc/fixtures/newsroom-2026-11-24.html");
const ncOlderNews = utf8("nc/fixtures/newsroom-page-2-2026-11-24.html");
const ncArticles = ["issue-2026-03-28", "partial-lift-2026-05-02", "final-lift-2026-05-07"].map((name) => ({
  date: name.slice(-10), html: utf8(`nc/fixtures/${name}.html`),
}));
const ncStatute = utf8("nc/fixtures/article-78-2026-11-24.html");
const ncDeq = utf8("nc/fixtures/deq-hours-2026-11-24.html");
const parseNcNewsFixture = () => parseNcNewsroom(ncNewsroom, "2026-11-24");
const parseNcOrderFixtures = async () => {
  const listings = [...await parseNcNewsFixture(), ...await parseNcNewsroom(ncOlderNews, "2026-04-27")];
  const orders = await Promise.all(ncArticles.map(async ({ date, html }) => {
    const listing = listings.find(({ published }) => published === date);
    if (!listing) throw new Error(`Missing NC newsroom fixture for ${date}`);
    return parseNcOrder(await extractHtml(html), listing);
  }));
  return applyNcOrders(orders, new Date("2026-05-03T12:00:00Z"));
};
const parseNcPermitFixture = async () => parseNcPermits(await extractHtml(ncStatute), ncNow);
const parseNcAirFixture = async () => parseNcAirHours(await extractHtml(ncDeq), ncNow);
const iaCountyCaptured = new Date("2026-11-24T22:56:00Z");
const iaCountyFixtures = [
  ...iaCountyBulletins.map(({ source, parse }) => {
    const county = source.id.replace(/^ia-|-ema$/g, "");
    const body = utf8(`ia/fixtures/${county}-2026-11-24.html`);
    return { source, parse: () => parse(body, iaCountyCaptured) };
  }),
  ...iaLocalCalendars.map(({ id, kind, source, parse }) => {
    if (kind === "pdf-etag") {
      const head: ResponseInit = JSON.parse(utf8(`ia/fixtures/rule-${id}-2026-11-24.json`));
      return { source, parse: () => parse(new Response(null, head), iaCountyCaptured) };
    }
    const body = raw(`ia/fixtures/rule-${id}-2026-11-24.${kind}`);
    return { source, parse: () => parse(new Response(body), iaCountyCaptured) };
  }),
];
const moCaptured = new Date("2026-11-24T12:15:56Z");
const moActive = utf8("mo/fixtures/show-me-fire-active-2026-11-24.json");
const moSip = utf8("mo/fixtures/epa-sip-2026-11-24.html");
const moRegulation = raw("mo/fixtures/epa-open-burning-2026-11-24.pdf");
const moDefinitions = raw("mo/fixtures/epa-definitions-2026-11-24.pdf");
const parseMoBansFixture = () => parseShowMeFireBans(JSON.parse(moActive), moCaptured);
const parseMoSipFixture = async () => parseMoYardWaste(await extractHtml(moSip, { links: true }), moCaptured,
  async (url) => new Response(url === moYardWaste.officialUrl ? moRegulation : moDefinitions));
const moCountyCaptured = new Date("2026-11-24T22:25:00Z");
const moCapeDay = utf8("mo/fixtures/cape-girardeau-day-2026-11-24.html");
const moLakeDay = utf8("mo/fixtures/lake-ozark-day-2026-11-24.html");
const moMountainAlerts = utf8("mo/fixtures/mountain-view-alerts-2026-11-24.html");
const parseMoCapeDay = () => parseCapeGirardeauDay(moCapeDay, moCountyCaptured);
const parseMoLakeDay = () => parseLakeOzarkDay(moLakeDay, moCountyCaptured);
const parseMoMountainAlerts = () => parseMountainViewAlerts(moMountainAlerts, moCountyCaptured);
const moLocalFixtures = moLocalCalendars.map(({ id, kind, source, parse }) => {
  const body = raw(`mo/fixtures/rule-${id}-2026-11-24.${kind}`);
  return { source, parse: () => parse(new Response(body), moCountyCaptured) };
});
const tnCaptured = new Date("2026-11-24T12:31:02Z");
const tnRoster = utf8("tn/fixtures/permit-roster-2026-11-24.json");
const tnPermitDetails = utf8("tn/fixtures/permit-details-2026-11-24.json");
const tnPermitSeason = utf8("tn/fixtures/permit-season-2026-11-24.html");
const parseTnHolds = () => parseTennesseePermitHolds(tnPermitDetails, parseTennesseePermitRoster(tnRoster), tnCaptured);
const parseTnSeason = async () => parseTennesseePermitSeason(await extractHtml(tnPermitSeason), tnCaptured);
const tnHamilton = utf8("tn/fixtures/hamilton-burn-widget-2026-11-24.html");
const parseTnHamilton = () => parseHamiltonBurnDecision(tnHamilton, tnCaptured);
const tnAirNow = utf8("tn/fixtures/airnow-2026-09-19.dat");
const parseTnAirNow = () => parseTennesseeAirQuality(tnAirNow, new Date("2026-09-19T14:00:00Z"));
const tnGatlinburgNews = utf8("tn/fixtures/gatlinburg-news-2026-11-24.html");
const tnGatlinburgHold = utf8("tn/fixtures/gatlinburg-permit-hold-2026-11-20.html");
const tnGatlinburgDate = new Date("2026-11-20T21:00:00Z");
const tnTullahomaPage = utf8("tn/fixtures/tullahoma-permit-page-2026-11-24.html");
const tnTullahomaForm = utf8("tn/fixtures/tullahoma-closed-form-2026-11-24.html");
const tnTullahomaDate = new Date("2026-11-25T04:16:19Z");
const parseTnTullahoma = async () => {
  const display = await parseTullahomaPermitPage(tnTullahomaPage);
  const decision = display === "embed" ? await parseTullahomaForm(tnTullahomaForm) : display;
  return tullahomaRows(decision, tnTullahomaDate);
};
const parseTnGatlinburg = async () => {
  const notice = await latestGatlinburgNotice(tnGatlinburgNews, tnGatlinburgDate);
  if (!notice) throw new Error("Expected Gatlinburg fixture notice");
  return parseGatlinburgPermitNotice(tnGatlinburgHold, notice, tnGatlinburgDate);
};
const tnLocalFixtures = tnLocalCalendars.map(({ id, kind, source, parse }) => {
  const body = raw(`tn/fixtures/rule-${id}-2026-11-24.${kind}`);
  return { id, source, parse: () => parse(new Response(body), tnCaptured) };
});
const akPermitLayer = utf8("ak/fixtures/permit-layer-2026-11-24.json");
const akPermitZones = utf8("ak/fixtures/permit-zones-2026-11-24.json");
const akFireSeason = utf8("ak/fixtures/as-41-15-050-2026-11-24.html");
const akFirePermitLaw = utf8("ak/fixtures/11-aac-95-412-2026-11-24.html");
const akWinterLaw = utf8("ak/fixtures/18-aac-50-065-2026-11-24.html");
const akWinterAreas = utf8("ak/fixtures/18-aac-50-015-through-025-2026-11-24.html");
const parseAkZones = () => parseAlaskaPermitZones(
  JSON.parse(akPermitLayer), arcgisRows(JSON.parse(akPermitZones), { requireComplete: true }), new Date("2026-09-16T18:15:15Z"),
);
const parseAkSummer = () => parseAlaskaFireSeason(akFireSeason, akFirePermitLaw, summerDay);
const parseAkWinter = () => parseAlaskaWinterBurning(akWinterLaw, akWinterAreas, now);
const coFixture = (name: string, ext: string) => utf8(`co/fixtures/${name}-2026-11-24.${ext}`);
const coDouglasJson = coFixture("douglas-status", "json");
const coElPasoJson = coFixture("el-paso-status", "json");
const coBoulderHtml = coFixture("boulder-status", "html");
const coArapahoeHtml = coFixture("arapahoe-status", "html");
const coEstesHtml = coFixture("estes-status", "html");
const coLarimerJson = coFixture("larimer-aegis", "json");
const coDenverHtml = coFixture("denver-air", "html");
const coJobs = [
  ["CO Douglas County WordPress", coDouglasFire, () => parseDouglasFire(JSON.parse(coDouglasJson), now)],
  ["CO El Paso County WordPress", coElPasoFire, () => parseElPasoFire(JSON.parse(coElPasoJson), now)],
  ["CO Boulder County WordPress", coBoulderFire, async () => parseBoulderFire(await extractHtml(coBoulderHtml), now)],
  ["CO Arapahoe County Revize", coArapahoeFire, async () => parseArapahoeFire(await extractHtml(coArapahoeHtml), now)],
  ["CO Estes Valley district", coEstesFire, async () => parseEstesFire(await extractHtml(coEstesHtml, { links: true }), now)],
  ["CO Larimer Aegis Experience", coLarimerFire, () => parseLarimerFire(JSON.parse(coLarimerJson), now)],
  ["CO CDPHE Denver Metro advisory", coDenverAir, async () => parseDenverAir(await extractHtml(coDenverHtml), now)],
] as const;
const orOutdoor = utf8("or/fixtures/lrapa-outdoor-2026-11-24.html");
const orHeating = utf8("or/fixtures/lrapa-wood-heating-2026-11-24.html");
const orWillamette = utf8("or/fixtures/willamette-2026-11-23.html");
const orOdfLayer = utf8("or/fixtures/odf-layer-2026-11-24.json");
const orOdfAreas = utf8("or/fixtures/odf-areas-2026-11-24.json");
const orJobs = [
  ["OR LRAPA outdoor advisory", orLrapaOutdoor, () => parseLrapaOutdoor(orOutdoor, now)],
  ["OR LRAPA wood heating advisory", orLrapaHeating, () => parseLrapaHeating(orHeating, now)],
  ["OR Willamette backyard bulletin", orWillametteBackyard, () => parseWillametteBackyard(orWillamette, now)],
  ["OR ODF regulated-use ArcGIS view", orOdfPublicUse, () => parseOdfPublicUse(JSON.parse(orOdfLayer), JSON.parse(orOdfAreas), now)],
] as const;

const adapters: Array<[string, () => CountyStatus[]]> = [
  ["OK ArcGIS", () => parseOk(JSON.parse(ok), checked)],
  ["TX ArcGIS", () => parseTx(JSON.parse(tx), checked)],
  ["TX UTF-16 fallback", () => parseTxt(txText, checked)],
  ["FL ArcGIS", () => parseFl(JSON.parse(fl), checked)],
  ["IN ArcGIS", () => parseIn(JSON.parse(ind), checked)],
  ["LA ArcGIS", () => parseLa(JSON.parse(la), checked)],
  ["MS Ninja Tables", () => parseMs(JSON.parse(ms), checked)],
  ["IA ArcGIS", () => parseIa(JSON.parse(ia), checked)],
];

const recordedInputs: SourceInput[] = ADAPTERS.map((source, index) => ({
  source, rows: adapters[index < 2 ? index : index + 1][1](), checked,
}));
recordedInputs.push(
  { source: pfirs, rows: parseCaFixture(), checked },
  { source: miPermits, rows: parseMiFixture(), checked },
  { source: njRestrictions, rows: parseNjFixture(), checked },
  { source: wiPermits, rows: parseWiFixture(), checked },
  { source: mnRestrictions, rows: parseMnFixture(), checked },
  { source: nyDecBrushBurning, rows: await parseNyDecFixture(), checked },
  { source: nyNycBarbecuing, rows: await parseNyNycFixture(), checked },
  { source: vaSeasonal, rows: await parseVaStatuteFixture(now), checked },
  { source: vaRapidanAlerts, rows: await parseVaRapidanFixture(), checked },
  { source: vaShenandoahAlerts, rows: parseVaParkFixture(), checked },
  { source: vaBrunswickBurnBan, rows: await parseVaBrunswickFixture(), checked },
  { source: vaNottowayBurnBan, rows: await parseVaNottowayFixture(), checked },
  ...await Promise.all(vaLocalFixtures.map(async ({ source, parse }) => ({ source, rows: await parse(), checked }))),
  { source: wvForestryFireSeason, rows: await parseWvForestryFixture(), checked: wvDaytime.toISOString() },
  { source: mdDnrWoodland, rows: await parseMdWoodlandFixture(), checked },
  { source: mdSummerAir, rows: await parseMdSummerFixture(now), checked },
  { source: vtFprRestrictions, rows: await parseVtFpr(), checked: vtCaptured.toISOString() },
  { source: vtFranklinBurning, rows: await parseVtFranklin(), checked: vtCaptured.toISOString() },
  { source: vtOpenBurningPermits, rows: await parseVtPermits(), checked: vtCaptured.toISOString() },
  { source: nmStateParks, rows: await parseNmParksFixture(), checked: nmCaptured.toISOString() },
  { source: nmAngelFirePermits, rows: await parseNmAngelFixture(), checked: nmCaptured.toISOString() },
  { source: nmOpenBurning, rows: await parseNmStateCodeFixture(), checked: nmCaptured.toISOString() },
  { source: nmBernalilloOpenBurning, rows: await parseNmBernalilloCodeFixture(), checked: nmCaptured.toISOString() },
  { source: deOpenBurning, rows: await parseDeGuidance(), checked: deCaptured.toISOString() },
  { source: deActionDays, rows: parseDeCurrentAir(), checked: deCaptured.toISOString() },
  { source: maAirAdvisories, rows: await parseMaAdvisories(maCaptured), checked: maCaptured.toISOString() },
  { source: maOpenBurning, rows: await parseMaGuidance(), checked: maCaptured.toISOString() },
  { source: meTownPermitHolds, rows: parseMeClasses(), checked: meCaptured.toISOString() },
  { source: meOpenBurningPermits, rows: await parseMeStatute(), checked: meCaptured.toISOString() },
  { source: ctDeepFireDanger, rows: await parseCtFireDangerFixture(), checked: ctCaptured.toISOString() },
  { source: ilCrawfordCountyOrders, rows: parseIlCrawford(now), checked },
  ...await Promise.all(ilJobs.map(async ([, source, parse]) => ({ source, rows: await parse(now), checked }))),
  { source: ksDickinsonDistricts, rows: parseKsDistricts(), checked: ksCaptured.toISOString() },
  { source: ksOpenBurning, rows: await parseKsState(), checked: ksCaptured.toISOString() },
  { source: ksAprilBurning, rows: await parseKsApril(), checked: ksCaptured.toISOString() },
  { source: ksFranklinPermits, rows: await parseKsFranklin(), checked: ksCaptured.toISOString() },
  { source: alJeffersonOpenBurning, rows: await parseAlJefferson(), checked: alCaptured.toISOString() },
  { source: alAdemOpenBurning, rows: await parseAlAdem(), checked: alCaptured.toISOString() },
  { source: alCahabaBurning, rows: await parseAlCahaba(), checked: alCaptured.toISOString() },
  { source: nhOpenBurningPermits, rows: await parseNhStatuteFixture(), checked: nhCaptured.toISOString() },
  { source: nhTownHallRoad, rows: await parseNhForestFixture(), checked: nhCaptured.toISOString() },
  { source: neOpenBurningLaw, rows: await parseNeStatuteFixture(), checked: neStatuteCaptured.toISOString() },
  { source: neLincolnLancasterAir, rows: await parseNeLincolnFixture(), checked: neLincolnCaptured.toISOString() },
  ...await Promise.all(riJobs.map(async ([, source, parse]) => ({
    source, rows: await parse(riCaptured), checked: riCaptured.toISOString(),
  }))),
  { source: sdBlackHillsPileBurning, rows: await parseSdPermitFixture(), checked: sdCaptured.toISOString() },
  { source: sdBlmFireRestrictions, rows: await parseSdBlmFixture(), checked: sdCaptured.toISOString() },
  { source: hiCabNoBurnPeriods, rows: await parseHiNoticeFixture(), checked: hiCaptured.toISOString() },
  { source: hiCabOpenBurning, rows: await parseHiRulesFixture(), checked: hiCaptured.toISOString() },
  { source: dcOpenBurning, rows: await parseDcRuleFixture(), checked: dcCaptured.toISOString() },
  { source: dcRockCreekFireRules, rows: await parseDcParkFixture(), checked: dcCaptured.toISOString() },
  { source: ohSeasonal, rows: await parseOhFixture(), checked },
  { source: gaEpdNonSummer, rows: await parseGaNonSummerFixture(), checked },
  ...await Promise.all(gaRuleJobs.map(async ({ source, parse }) => ({ source, rows: await parse(), checked }))),
  { source: azPimaWildfire, rows: await parseAzPimaFixture(), checked },
  { source: azGrandCanyonFire, rows: await parseAzGrandCanyonFixture(), checked },
  { source: waEcologyAir, rows: await parseWaEcologyFixture(), checked },
  { source: waPugetSoundAir, rows: await parseWaPugetFixture(), checked },
  { source: waKingFireSafety, rows: await parseWaKingFixture(), checked },
  ...await Promise.all(coJobs.map(async ([, source, parse]) => ({ source, rows: await parse(), checked }))),
  ...await Promise.all(orJobs.map(async ([, source, parse]) => ({ source, rows: await parse(), checked }))),
  { source: akDecWinterBurning, rows: await parseAkWinter(), checked },
  { source: kyForestryCountyBans, rows: await parseKyListFixture(), checked: kyCaptured.toISOString() },
  { source: kySeasonal, rows: await parseKyStatuteFixture(), checked: kyCaptured.toISOString() },
  { source: paCarrollValley, rows: await parsePaNewsFixture(), checked: paCaptured.toISOString() },
  { source: paStateForestSpring, rows: await parsePaStatuteFixture(paCaptured), checked: paCaptured.toISOString() },
  { source: idIdlStages, rows: parseIdlFixture(), checked: idCaptured.toISOString() },
  { source: idKootenaiAir, rows: await parseIdForecastFixture(), checked: idCaptured.toISOString() },
  { source: idSeasonal, rows: await parseIdStatuteFixture(idCaptured), checked: idCaptured.toISOString() },
  { source: utFfslFireOrders, rows: parseUtOrders(), checked: utCaptured.toISOString() },
  { source: utClosedFireSeason, rows: parseUtStatute(utCaptured), checked: utCaptured.toISOString() },
  { source: mtDeqFall, rows: parseMtDeq(), checked: mtCaptured.toISOString() },
  { source: mtDnrcRestrictions, rows: parseMtDnrc(), checked: mtCaptured.toISOString() },
  { source: mtMissoulaSeasons, rows: await parseMtMissoula(), checked: mtCaptured.toISOString() },
  { source: wyCountyOrders, rows: parseWyCountyFixture(), checked: wyCaptured.toISOString() },
  { source: wyStateLands, rows: parseWyLandFixture(), checked: wyCaptured.toISOString() },
  { source: ndDesRestrictions, rows: parseNdFixture(), checked: ndCaptured.toISOString() },
  { source: nvTmfpdPileBurning, rows: await parseNvTmfpdFixture(), checked: nvCaptured.toISOString() },
  { source: nvUsfsSpringMountains, rows: await parseNvForestFixture(), checked: nvForestCaptured.toISOString() },
  { source: arFaulknerCountyOrders, rows: await parseArFaulknerFixture(), checked: arCaptured.toISOString() },
  { source: scAirQuality, rows: await parseScRegulationFixture(), checked: scCaptured.toISOString() },
  { source: ncForestOrders, rows: [], checked: ncNow.toISOString() },
  { source: ncPermits, rows: await parseNcPermitFixture(), checked: ncNow.toISOString() },
  { source: ncAirHours, rows: await parseNcAirFixture(), checked: ncNow.toISOString() },
  ...await Promise.all(iaCountyFixtures.map(async ({ source, parse }) => ({
    source, rows: await parse(), checked: iaCountyCaptured.toISOString(),
  }))),
  { source: moShowMeFireBans, rows: parseMoBansFixture(), checked: moCaptured.toISOString() },
  { source: moYardWaste, rows: await parseMoSipFixture(), checked: moCaptured.toISOString() },
  { source: moCapeGirardeau, rows: await parseMoCapeDay(), checked: moCountyCaptured.toISOString() },
  { source: moLakeOzark, rows: await parseMoLakeDay(), checked: moCountyCaptured.toISOString() },
  { source: moMountainView, rows: await parseMoMountainAlerts(), checked: moCountyCaptured.toISOString() },
  ...await Promise.all(moLocalFixtures.map(async ({ source, parse }) => ({
    source, rows: await parse(), checked: moCountyCaptured.toISOString(),
  }))),
  { source: tnForestryPermitHolds, rows: parseTnHolds(), checked: tnCaptured.toISOString() },
  { source: tnHamiltonDailyBurning, rows: await parseTnHamilton(), checked: tnCaptured.toISOString() },
  { source: tnAirQualityPermitHolds, rows: parseTnAirNow(), checked: "2026-09-19T14:00:00Z" },
  { source: tnGatlinburgPermitNotices, rows: await parseTnGatlinburg(), checked: tnGatlinburgDate.toISOString() },
  { source: tnTullahomaDailyBurning, rows: await parseTnTullahoma(), checked: tnTullahomaDate.toISOString() },
  ...await Promise.all(tnLocalFixtures.map(async ({ source, parse }) => ({
    source, rows: await parse(), checked: tnCaptured.toISOString(),
  }))),
  { source: tnSeasonalBurnPermits, rows: await parseTnSeason(), checked: tnCaptured.toISOString() },
  { source: nwsFireWeather, rows: [], fireWeather: parseNwsLive(), checked: nwsCaptured.toISOString() },
);

const states = new Map<string, CountyStatus[]>();
for (const { state, fips, name } of COUNTIES) {
  const row: CountyStatus = {
    fips, state, county: name, status: "none", label: "No burn ban", checked, since: null,
    expires: null, sourceUpdated: null, sourceName: "Example forestry office",
    sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/",
  };
  const rows = states.get(state);
  if (rows) rows.push(row);
  else states.set(state, [row]);
}
const fullInputs: SourceInput[] = [...states].map(([state, rows]) => ({
  source: { id: state.toLowerCase(), state, mode: "full", scope: "county" }, checked, rows,
}));
const serializedFull = fullInputs.map(({ rows }) => JSON.stringify(rows));

const jobs: Array<[string, () => unknown]> = [
  ["HTTP challenge sniff", async () => {
    try { await fetchSource("https://burnpermit.fire.ca.gov/", { fetchImpl: async () => new Response(akamai) }); }
    catch (err) { if (!(err instanceof BlockedError)) throw err; }
  }],
  ["ArcGIS domains and edit date", () => {
    const meta = JSON.parse(layer);
    return [codedDomains(meta), dataLastEditDate(meta)];
  }],
  ["ArcGIS Dashboard/WebMap", () => findOperationalLayers("1f6572c92f8d41ec860f461ea433819b", {
    read: async (url) => JSON.parse(url.includes("1f6572c92f8d41ec860f461ea433819b") ? dashboard : webmap),
  })],
  ["HTML extract", () => blockAfterHeading(parseHtml(pfirsHtml).blocks, /prescribed burn/i)],
  ["WordPress REST and Ninja", () => [parseWpItems(JSON.parse(faulkner)), parseNinjaRows(JSON.parse(ms))]],
  ["MA residential brush guidance and calendar", () => parseMaGuidance(new Date("2027-04-15T14:00:00Z"))],
  ["MA MassDEP same-day advisory RSS", () => parseMaAdvisories(new Date("2026-02-18T15:00:00Z"))],
  ["ME fire danger and town permit rules", parseMeClasses],
  ["ME open-burning statute and calendar", parseMeStatute],
  ["CT DEEP daily fire danger", parseCtFireDangerFixture],
  ["IL Crawford County orders via WTYE", parseIlCrawford],
  ...ilJobs.map(([name, , parse]): [string, () => unknown] => [name, parse]),
  ["KS Dickinson County ArcGIS fire districts", parseKsDistricts],
  ["KS state open-burning rules and calendar", parseKsState],
  ["KS April open-burning rules and calendar", () => parseKsApril(new Date("2027-04-01T05:00:00Z"))],
  ["KS Franklin County burn permits", parseKsFranklin],
  ["AL state air rule and summer calendar", () => parseAlAdem(new Date("2027-07-14T16:03:46Z"))],
  ["AL Jefferson County burning calendar", parseAlJefferson],
  ["AL Cahaba Valley district status", parseAlCahaba],
  ["NH open-burning statute and calendar", parseNhStatuteFixture],
  ["NH White Mountain Drupal forest order", parseNhForestFixture],
  ["NE open-burning statute and calendar", parseNeStatuteFixture],
  ["NE Lincoln-Lancaster open-burning rules and calendar", parseNeLincolnFixture],
  ...riJobs.map(([name, , parse]): [string, () => unknown] => [name, () => parse(riSpring)]),
  ["CivicPlus News Flash", () => civicPlusNotices(parseHtml(placer, { links: true }), "https://www.placer.ca.gov/")],
  ["ASP.NET WebForms", () => webFormsPost(michigan, "https://www2.dnr.state.mi.us/burnpermits/", "ctl00$ContentPlaceHolder1$CntyName")],
  ["SharePoint list", () => sharePointListItems(parseHtml(kentucky), /current burn bans/i)],
  ["Wisconsin CSV", () => parseCsv(csv)],
  ["Wisconsin JSON", () => parseJson(json, Array.isArray)],
  ["Texas UTF-16 RSS", () => parseFeed(decodeFeed(rss))],
  ["Manual PDF hash", () => manualPdf(new Response(pdf))],
  ["Calendar rules", () => Object.values(CALENDAR_RULES).map((rule) => activeRule(rule, now, "Gwinnett County"))],
  ...adapters,
  ["CA PFIRS", parseCaFixture],
  ["MI DNR ArcGIS", parseMiFixture],
  ["NJ Forest Fire Service ArcGIS", parseNjFixture],
  ["WI DNR permit feed", parseWiFixture],
  ["MN DNR restriction feed", parseMnFixture],
  ["OH statute and calendar", parseOhFixture],
  ["GA Gwinnett daily decision", parseGwinnettFixture],
  ["GA EPD summer rules", parseGaSummerFixture],
  ["GA EPD October–April rules", parseGaNonSummerFixture],
  ["GA Firestore permit calendar", () => parsePermitCalendar(JSON.parse(gaPermitCalendar), "Habersham", gaPermitDay)],
  ["GA Hinesville CivicPlus permit form", async () => {
    await hinesvilleFormLink(gaHinesvillePage);
    return parseHinesvilleClosure(gaHinesvilleForm, now);
  }],
  ...gaRuleJobs.map(({ source, parse }): [string, () => unknown] => [source.id, parse]),
  ["AZ Pima wildfire bulletin", parseAzPimaFixture],
  ["AZ Grand Canyon fire bulletin", parseAzGrandCanyonFixture],
  ["AZ Area A statute and calendar", parseAzAreaAFixture],
  ["WA Ecology air quality orders", parseWaEcologyFixture],
  ["WA Puget Sound air quality grid", parseWaPugetFixture],
  ["WA King County fire safety", parseWaKingFixture],
  ...coJobs.map(([name, , parse]): [string, () => unknown] => [name, parse]),
  ...orJobs.map(([name, , parse]): [string, () => unknown] => [name, parse]),
  ["KY Forestry SharePoint list", parseKyListFixture],
  ["KY statute PDF and calendar", parseKyStatuteFixture],
  ["PA Carroll Valley CivicPlus", parsePaNewsFixture],
  ["PA state forest statute and calendar", parsePaStatuteFixture],
  ["ID IDL stage zones", parseIdlFixture],
  ["ID Kootenai district air forecast", parseIdForecastFixture],
  ["ID closed fire season and calendar", parseIdStatuteFixture],
  ["WY State Forestry county orders", parseWyCountyFixture],
  ["WY state trust lands rule", parseWyLandFixture],
  ["ND DES ArcGIS daily restrictions", parseNdFixture],
  ["SD Wildland Fire WebForms pile conditions", parseSdPermitFixture],
  ["SD BLM Drupal notice and signed order", parseSdBlmFixture],
  ["HI Clean Air Branch WordPress no-burn periods", parseHiNoticeFixture],
  ["HI Clean Air Branch WordPress open-burning rules", parseHiRulesFixture],
  ["DC DCRegs current rule and calendar", parseDcRuleFixture],
  ["DC Rock Creek compendium and calendar", parseDcParkFixture],
  ["NV Truckee Meadows WordPress / Oxygen", parseNvTmfpdFixture],
  ["AR Faulkner County WordPress / Elementor and PDF", parseArFaulknerFixture],
  ["SC Forestry Commission custom WordPress REST", parseScDebrisFixture],
  ["SC DES regulation PDF and calendar", parseScRegulationFixture],
  ["NC Forest Service Drupal newsroom and three orders", parseNcOrderFixtures],
  ["NC woodland permits statute and calendar", parseNcPermitFixture],
  ["NC DEQ open-burning hours and calendar", parseNcAirFixture],
  ...iaCountyFixtures.map(({ source, parse }): [string, typeof parse] => [source.id, parse]),
  ["MO Show Me Fire active county JSON", parseMoBansFixture],
  ["MO EPA SIP index, PDFs and calendar", parseMoSipFixture],
  ["MO Cape Girardeau daily Elementor notice", parseMoCapeDay],
  ["MO Lake Ozark daily Wix banner", parseMoLakeDay],
  ["MO Mountain View CivicEngage active alerts", parseMoMountainAlerts],
  ...moLocalFixtures.map(({ source, parse }): [string, typeof parse] => [source.id, parse]),
  ["TN Forestry fiResponse roster and permit details", parseTnHolds],
  ["TN Forestry permit-season HTML and calendar", parseTnSeason],
  ["TN Hamilton APCB daily burn bulletin", parseTnHamilton],
  ["TN Shelby and Knox AirNow forecast holds", parseTnAirNow],
  ["TN Gatlinburg Apptegy permit notices", parseTnGatlinburg],
  ["TN Tullahoma Revize and Google Forms permit status", parseTnTullahoma],
  ...tnLocalFixtures.map<[string, () => unknown]>(({ id, parse }) => [`TN local burn rule (${id})`, parse]),
  ["NY DEC brush rules and Fire Towns", parseNyDecFixture],
  ["NYC 311 outdoor barbecuing rules", parseNyNycFixture],
  ["VA 4 p.m. statute and calendar", () => parseVaStatuteFixture(vaSpring)],
  ["VA DWR Rapidan WordPress notice table", parseVaRapidanFixture],
  ["VA NPS Shenandoah park-alert JSON", parseVaParkFixture],
  ["VA Brunswick CivicLive public notice", parseVaBrunswickFixture],
  ["VA Nottoway Revize news carousel", parseVaNottowayFixture],
  ...vaLocalFixtures.map(({ source, parse }): [string, typeof parse] => [source.id, parse]),
  ["WV Forestry WordPress and fire-season calendar", parseWvForestryFixture],
  ["MD DNR SharePoint woodland guidance and calendar", parseMdWoodlandFixture],
  ["MD COMAR summer air-quality rule and calendar", () => parseMdSummerFixture(mdSummer)],
  ["VT FPR Drupal situation page", parseVtFpr],
  ["VT Franklin Google Sites notice", parseVtFranklin],
  ["VT Legislature open-burning statute and calendar", parseVtPermits],
  ["NM State Parks restrictions listing", parseNmParksFixture],
  ["NM Angel Fire CivicPlus permit notice", parseNmAngelFixture],
  ["NM state open-burning code and calendar", parseNmStateCodeFixture],
  ["NM Bernalillo open-burning code and calendar", parseNmBernalilloCodeFixture],
  ["DE DNREC WordPress guidance and calendar", parseDeGuidance],
  ["DE AirNow current reporting-area data", parseDeCurrentAir],
  ["DE AirNow archived Code Red Action Day", parseDeArchivedAir],
  ["NV Spring Mountains Drupal order table", parseNvForestFixture],
  ["UT FFSL fire order polygons", parseUtOrders],
  ["UT closed fire season and calendar", parseUtStatute],
  ["MT DEQ fall open-burning decisions", parseMtDeq],
  ["MT DNRC interagency ArcGIS dashboard", parseMtDnrc],
  ["MT Gallatin district status table", parseMtGallatin],
  ["MT Missoula seasonal closures", parseMtMissoula],
  ["AK DNR permit zone statuses", parseAkZones],
  ["AK DNR fire-season permit law", parseAkSummer],
  ["AK DEC winter open-burning rule", parseAkWinter],
  ["NWS live fire-weather GeoJSON", parseNwsLive],
  ["NWS archived RFW GeoJSON", parseNwsArchive],
  ["Merge and encode current sources", () => JSON.stringify(mergeSources(null, recordedInputs, now).snapshot)],
  ["Parse, merge, encode 51-area projection", () => JSON.stringify(mergeSources(null,
    fullInputs.map((input, index) => ({ ...input, rows: JSON.parse(serializedFull[index]) })), now).snapshot)],
];

console.log("Fixture timings in ms (Bun wall time, no network, 20 warmups and 120 samples per row).");
for (const [name, run] of jobs) {
  for (let i = 0; i < 20; i++) await run();
  const times: number[] = [];
  for (let i = 0; i < 120; i++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const percentile = (p: number) => times[Math.ceil(times.length * p) - 1];
  const p95 = percentile(0.95);
  console.log(`${name.padEnd(42)} p50 ${percentile(0.5).toFixed(3)}  p95 ${p95.toFixed(3)}${p95 >= 7 ? "  REVIEW CPU BUDGET" : ""}`);
}

console.log("\nSnapshot timings in ms (Bun thread CPU, no I/O, 20 warmups and 120 samples per row).");
const recordedById = new Map(recordedInputs.map((input) => [input.source.id, input]));
const currentInputs: SourceInput[] = SOURCES.map((source) => {
  const fixture = recordedById.get(source.id);
  return fixture ? { ...fixture, source, version: "fixture" }
    : { source, rows: [], checked, error: source.mode === "manual" ? source.error : "No recorded fixture" };
});
for (const [label, inputs] of [
  ["current registry with recorded rows", currentInputs], ["projected", nationalFixture(now)], ["all counties active", nationalFixture(now, true)],
] as const) {
  const benchmark = snapshotBenchmarks(inputs, now);
  console.log(`\n${label}`, benchmark.counts);
  const measure = (name: string, run: () => unknown) => {
    const { p50, p95 } = timings(run);
    console.log(`${name.padEnd(42)} p50 ${p50.toFixed(3)}  p95 ${p95.toFixed(3)}`);
  };
  for (const [name, key] of [["State merge, decode and encode", "merge"], ["State read and status lookup", "read"]] as const) {
    const state = benchmark.stateCases.map((entry) => ({ state: entry.state, ...timings(entry[key]) })).sort((a, b) => b.p95 - a.p95)[0];
    console.log(`${`${name} (${state.state}, max p95)`.padEnd(55)} p50 ${state.p50.toFixed(3)}  p95 ${state.p95.toFixed(3)}`);
  }
  measure("Cold rebuild incl. state jobs and catalog", benchmark.coldRebuild);
  measure("Join the active projection", benchmark.joinActive);
  measure("Legacy parse, merge and encode", benchmark.wholeMerge);
  measure("Parse the catalog", benchmark.parseIndex);
  measure("Parse the largest shard", benchmark.parseLargestState);
  measure("Parse the legacy aggregate", benchmark.parseWhole);
  measure("Legacy aggregate read and lookup", benchmark.wholeRead);
  measure("Cold national bans API read and encode", benchmark.readActive);
  measure("Cold national bans MCP read and encode", benchmark.readActiveMcp);
  measure("Cold MCP when scoped orders just expired", benchmark.readActiveExpired);
}
