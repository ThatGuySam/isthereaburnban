import {
  butteBurnDay, colusaBurnDay, elDoradoBurnDay, featherRiverBurnDay, imperialBurnDay,
  tehamaBurnDay, venturaAgriculturalBurn, yoloSolanoBurnDay,
} from "./district-html";
import { mendocinoDaily, sacramentoWoodSmoke, valleyAirBurnDeclarations } from "./district-json";
import { placerBurnMap, southCoastWoodSmoke } from "./district-maps";
import { sanBernardinoFire } from "./fire-district";
import { caLocalBurningRules } from "./local-rules";
import { portolaCurtailment } from "./portola";

export const caCountySources = [
  butteBurnDay.source,
  colusaBurnDay.source,
  elDoradoBurnDay.source,
  featherRiverBurnDay.source,
  imperialBurnDay.source,
  mendocinoDaily.source,
  placerBurnMap.source,
  portolaCurtailment.source,
  sacramentoWoodSmoke,
  sanBernardinoFire,
  southCoastWoodSmoke.source,
  tehamaBurnDay.source,
  valleyAirBurnDeclarations,
  venturaAgriculturalBurn.source,
  yoloSolanoBurnDay.source,
  ...caLocalBurningRules.map(({ source }) => source),
];
