import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";

type Rule = LocalCalendarRule & {
  id: string;
  area: string;
  scopeNote: string;
  stack: string;
  sourceName: string;
  sourceUrl: string;
  review: LocalCalendarEvidence;
};

const rules: readonly Rule[] = [
  {
    id: "rogers-permit", area: "Benton", scopeNote: "City of Rogers", stack: "CivicPlus / HTML",
    sourceName: "Rogers Fire Department", sourceUrl: "https://ar-rogers.civicplus.com/542/Burn-Permit",
    review: { kind: "html", selector: "#divEditor2d13e66a-63c6-45d9-a159-9c702cf6e6b5 .fr-view",
      digest: "72f99a012077818b38534108613e9d95b34645a0ef6bb44d7720637c2fcc096c" },
    label: "Rogers open-burning permit required",
    note: "Rogers requires a permit for covered open burning. Permits are invalid when winds reach 10 mph. Construction sites must obtain permits from Community Risk Reduction.",
  },
  {
    id: "harrison-permit", area: "Boone", scopeNote: "City of Harrison", stack: "Apptegy / HTML page state",
    sourceName: "Harrison Fire Department", sourceUrl: "https://www.harrisonar.gov/page/burning-permits",
    review: { kind: "html-apptegy-node", pageId: 1687328, nodeId: "d351b098-4f4e-4721-b706-7c3a3f1efc82",
      digest: "9f8867ddbed94025b5903daff69b67591e65e9d3617700fdadc65a056daf84be" },
    label: "Harrison daily permit required for non-recreational fires",
    note: "Harrison ordinance 1538 requires a fire department permit for non-recreational fires. A permit covers the issuing day from dawn until dusk and limits fuels to qualifying yard debris.",
  },
  {
    id: "van-buren-city-permit", area: "Crawford", scopeNote: "City of Van Buren", stack: "CivicPlus / HTML",
    sourceName: "Van Buren Fire Department", sourceUrl: "https://cityofvanburenar.gov/153/Fire-Department",
    review: { kind: "html", selector: "#divEditord52c4261-cb43-4df4-b072-2b580cbe6f81 .fr-view > p", startsWith: "Burn Permits",
      digest: "b04b2ff63fdd1d58eaf65c6c48c740db7e80dfc4d83905c709775cf6997c88ee" },
    label: "Van Buren residential open-burning permit required",
    note: "Van Buren requires an approved permit for residential open burning and limits burning to daylight. Ask your local fire station for the permit.",
  },
  {
    id: "paragould-rule", area: "Greene", scopeNote: "City of Paragould", stack: "CivicPlus / HTML",
    sourceName: "Paragould Fire Department", sourceUrl: "https://www.paragouldcityar.gov/183/OPEN-BURNING-REQUIREMENTS",
    review: { kind: "html", selector: "#divEditor6704a47c-c6be-4e5c-a3a5-ea3cfefb0c41 .fr-view > p",
      startsWith: "Open burning is allowed in the City of Paragould",
      digest: "80a7ba62eadc24e7a5949475deab56b3a79cfb3632c70d87921ef15e56ec4339" },
    label: "Paragould requires fire department review for commercial vegetation burning",
    note: "Contact the Paragould Fire Department before burning natural vegetation for commercial clearing. A fire official inspects the site and gives instructions. Small residential fires follow separate rules.",
  },
  {
    id: "pine-bluff-permit", area: "Jefferson", scopeNote: "City of Pine Bluff", stack: "Streamline / HTML",
    sourceName: "Pine Bluff Fire and Emergency Services", sourceUrl: "https://www.pineblufffire.com/burn-permits",
    review: { kind: "html", selector: "#poc > .body",
      digest: "d87813b6915b0f84bee27b4f42f91a18fa66260a2e626d702c5d2e1367933100" },
    label: "Pine Bluff permit required for covered yard-waste fires",
    note: "Pine Bluff requires a burn permit within city limits for covered yard-waste fires. The city has separate conditions for approved containers and controlled ground burns.",
  },
  {
    id: "russellville-permit", area: "Pope", scopeNote: "City of Russellville", stack: "CivicPlus / Form Center",
    sourceName: "Russellville Fire Department",
    sourceUrl: "https://www.russellvillefire.org/FormCenter/Fire-Department-3/Open-Burn-Permit-43",
    review: { kind: "html", selector: '#formWrap li[data-external-submission-name="e_1"] .tip',
      digest: "665cc3e4f734419406a71003ea0dd276bada672c93a2de55738c2411108bb272" },
    label: "Russellville open-burning registration required",
    note: "Russellville requires preregistration before covered open burning. The residential permit is valid through the end of its calendar year.",
  },
  {
    id: "fayetteville-permit", area: "Washington", scopeNote: "City of Fayetteville", stack: "CivicPlus / HTML",
    sourceName: "Fayetteville Fire Department", sourceUrl: "https://www.fayetteville-ar.gov/4050/Burn-Permits-and-Alternatives",
    review: { kind: "html", selector: "#divEditor29d3296e-2c35-463d-8762-971d2f1c3a1e .fr-view",
      digest: "8bc54ed72dda110b71ee084cd32e4f9dbb53e15a2d1d6e351be4aab448757ed5" },
    label: "Fayetteville residential open-burning permit required",
    note: "Apply online for permission to burn covered residential brush or yard debris in Fayetteville. Commercial work and city construction have separate rules.",
  },
];

export const arLocalRules = rules.map(({ id, area, stack, sourceName, sourceUrl, review, ...rule }) => {
  const county = countyByName("AR", area);
  if (!county) throw new Error(`Unknown Arkansas local-rule county: ${area}`);
  return reviewedLocalCalendar({
    publisher: { id: `ar-${id}`, state: "AR", scope: "part", stack, sourceName, sourceUrl, officialUrl: sourceUrl },
    counties: [{ fips: county.fips, name: county.name }],
    rule, review, zone: US_ZONES.Central, hour: 9,
  });
});
