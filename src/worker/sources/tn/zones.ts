import { matchKey, type County } from "../../counties";
import { US_ZONES } from "../lib/dates";

// The boundary in 49 CFR 71.5(d) follows Tennessee county lines.
const EASTERN = new Set([
  "anderson", "blount", "bradley", "campbell", "carter", "claiborne", "cocke", "grainger", "greene", "hamblen",
  "hamilton", "hancock", "hawkins", "jefferson", "johnson", "knox", "loudon", "mcminn", "meigs", "monroe",
  "morgan", "polk", "rhea", "roane", "scott", "sevier", "sullivan", "unicoi", "union", "washington",
]);

export function tennesseeZone(county: County) {
  return EASTERN.has(matchKey(county.name)) ? US_ZONES.Eastern : US_ZONES.Central;
}
