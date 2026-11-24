import { extractHtmlGrid } from "./html";

/** Read the cards in the Forest Service's Drupal alerts view, excluding navigation links. */
export async function forestServiceAlertCards(input: Response | string) {
  const [[intro] = [], ...cards] = await extractHtmlGrid(input, {
    row: ".view__alerts > .view__override-text, .view__alerts .rows__container .wfs-alert-flag",
    cell: ".view__override-text p, .usa-card__header h3 a, .usa-card__footer .tablet\\:grid-col",
  });
  if (!intro?.text || !cards.length) throw new Error("Forest Service: missing alerts view or cards");
  return cards.map(([link, ...fields]) => {
    if (!link?.href || !link.text) throw new Error("Forest Service: missing alert card link");
    return { href: link.href, title: link.text, fields: fields.map(({ text }) => text) };
  });
}
