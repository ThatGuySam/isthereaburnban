import { sha256 } from "./hash";
import { extractHtmlGrid } from "./html";

/** Fingerprint the numbered sections in the published code, outside its table of contents. */
export async function reviewedEcode360Digest(input: Response | string, sections: readonly [string, ...string[]]) {
  if (sections.some((id) => !/^\d+$/.test(id)) || new Set(sections).size !== sections.length) {
    throw new Error("Expected distinct eCode360 section IDs");
  }
  const article = "#codeContent #childContent article";
  const titles = sections.map((id) => `${article} > header .titleLink[href="#${id}"]`);
  const body = sections.map((id) => `${article} > .section_content[id="${id}_content"]`);
  const rows = await extractHtmlGrid(input, { row: article, cell: [...titles, ...body].join(", "), spaceLineBreaks: true });
  const text = sections.map((id) => {
    const [[heading, rule, ...extra] = [], ...duplicates] = rows.filter(([link]) => link?.href === `#${id}`);
    if (!heading?.text || !rule?.text || rule.id !== `${id}_content` || extra.length || duplicates.length) {
      throw new Error(`Expected one published eCode360 section: ${id}`);
    }
    return [heading.text, rule.text];
  });
  return sha256(JSON.stringify(text));
}
