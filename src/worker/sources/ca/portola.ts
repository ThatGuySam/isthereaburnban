import type { DailyDecision } from "../lib/daily-status";
import { parseUsDate } from "../lib/dates";
import { extractHtml } from "../lib/html";
import { californiaDailySource } from "./daily";

const portolaPage = "https://www.nsaqmdca.gov/greater-portola-area-hub";
const heading = /^CURTAILMENT STATUS: Wood burning curtailment for the (\d{2})\/(\d{2}) season resumes (\d{1,2}\/\d{1,2}\/\d{4})\. (.+?) Using uncertified wood stoves/i;
const sentence = /^(\d{1,2}\/\d{1,2}(?:(?:,\s*| and )\d{1,2}\/\d{1,2})*) (?:is|are) (NOT )?(?:a )?(?:wood burning )?curtailment days?\s*\./i;

export const portolaCurtailment = californiaDailySource({
  publisher: {
    id: "ca-portola-wood-curtailment", stack: "Streamline / HTML notice",
    sourceName: "Northern Sierra Air Quality Management District", sourceUrl: portolaPage, officialUrl: portolaPage,
  },
  counties: ["Plumas"], hours: [0, 9, 13, 17, 21],
  async read(input) {
    const { blocks } = await extractHtml(input);
    const [notice, ...extra] = blocks.filter(({ tag, text }) => tag === "p" && text.startsWith("CURTAILMENT STATUS:"));
    const match = notice && heading.exec(notice.text);
    const seasonStart = match && parseUsDate(match[3]);
    if (!match || !seasonStart || extra.length ||
        !/Outdoor residential burning in Zone 1 is also prohibited on a curtailment day\./i.test(notice.text)) {
      throw new Error("Portola: missing season or scope in curtailment notice");
    }
    const year = Number(seasonStart.slice(0, 4));
    if (year % 100 !== Number(match[1]) || (year + 1) % 100 !== Number(match[2])) {
      throw new Error("Portola: changed curtailment season");
    }
    const decisions: DailyDecision[] = [];
    let remaining = match[4].trim();
    while (remaining) {
      const statement = sentence.exec(remaining);
      if (!statement) throw new Error("Portola: unrecognized dated curtailment notice");
      for (const shortDate of statement[1].split(/,\s*| and /)) {
        const firstYear = parseUsDate(shortDate, year);
        const date = firstYear && firstYear >= seasonStart ? firstYear : parseUsDate(shortDate, year + 1);
        if (!date || date < seasonStart || date >= `${year + 1}-${seasonStart.slice(5)}`) {
          throw new Error("Portola: invalid curtailment date");
        }
        const outdoors = { date, county: "Plumas", scopeNote: "Zone 1 outside City of Portola, outdoor residential burning" };
        const indoors = { date, county: "Plumas", scopeNote: "Greater Portola PM2.5 nonattainment area, uncertified wood stoves" };
        if (statement[2]) {
          decisions.push({ ...outdoors, status: "allowed" }, { ...indoors, status: "allowed" });
        } else {
          decisions.push({
            ...outdoors, status: "ban", label: "Zone 1 outdoor burn curtailment",
            note: "The district prohibits outdoor residential burning in Zone 1 on the listed curtailment day.",
          }, {
            ...indoors, status: "restricted", label: "Uncertified wood stoves prohibited on curtailment day",
            note: "Check the district's boundaries and wood-stove guidance for the Greater Portola area.",
          });
        }
      }
      remaining = remaining.slice(statement[0].length).trim();
    }
    return decisions;
  },
});
