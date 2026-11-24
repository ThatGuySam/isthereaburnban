const CITY_RULES: Record<string, string> = {
  "/us/la/city/shreveport/": "https://www.shreveportla.gov/1100/Burn-Permit",
  "/us/tx/city/midland/": "https://midlandtexas.gov/255/Fire-Marshals-Office",
};

export const cityRulesUrl = (path: string): string | undefined => CITY_RULES[path];
