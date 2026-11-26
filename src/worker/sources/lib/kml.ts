import { decodeEntities } from "./html";

/** Resolve public My Maps placemarks to their normal KML outline colors. */
export function kmlOutlineColors(xml: string, documentName: string, names: readonly string[]): string[] {
  const document = /<kml\b[^>]*>\s*<Document>\s*<name>([^<]+)<\/name>/.exec(xml);
  if (!document || decodeEntities(document[1]) !== documentName || !/<\/Document>\s*<\/kml>\s*$/.test(xml)) {
    throw new Error("Unexpected KML document");
  }

  const colors = new Map<string, string>();
  const styles = new Map<string, string>();
  const references = new Map<string, string>();
  for (const [, id, body] of xml.matchAll(/<Style id="([^"]+)">([^]*?)<\/Style>/g)) {
    const color = /<LineStyle>\s*<color>ff([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})<\/color>/i.exec(body);
    if (!color) continue;
    if (colors.has(id)) throw new Error("Duplicate KML style");
    // KML encodes colors as alpha, blue, green, red.
    colors.set(id, (color[3] + color[2] + color[1]).toUpperCase());
  }
  for (const [, id, body] of xml.matchAll(/<StyleMap id="([^"]+)">([^]*?)<\/StyleMap>/g)) {
    const normal = [...body.matchAll(/<key>normal<\/key>\s*<styleUrl>#([^<]+)<\/styleUrl>/g)];
    if (normal.length !== 1 || styles.has(id) || colors.has(id)) throw new Error("Ambiguous KML style map");
    styles.set(id, normal[0][1]);
  }
  for (let start = xml.indexOf("<Placemark>"); start !== -1;) {
    const end = xml.indexOf("</Placemark>", start);
    const nameEnd = xml.indexOf("</name>", start);
    if (end === -1 || nameEnd === -1 || nameEnd > end) throw new Error("Incomplete KML placemark");
    const nameTag = /^<Placemark>\s*<name>(?:<!\[CDATA\[([^]*?)\]\]>|([^<]+))$/.exec(xml.slice(start, nameEnd));
    if (!nameTag) throw new Error("Missing KML placemark name");
    start = xml.indexOf("<Placemark>", end + "</Placemark>".length);
    const name = nameTag[1] ?? decodeEntities(nameTag[2]);
    if (!names.includes(name)) continue;
    const body = xml.slice(nameEnd, end);
    const links = [...body.matchAll(/<styleUrl>#([^<]+)<\/styleUrl>/g)];
    if (links.length !== 1 || references.has(name) || /<Style\b/.test(body)) throw new Error("Ambiguous KML placemark style");
    references.set(name, links[0][1]);
  }

  return names.map((name) => {
    const reference = references.get(name);
    const color = reference && colors.get(styles.get(reference) ?? reference);
    if (!color) throw new Error(`Unresolved KML style for ${name}`);
    return color;
  });
}
