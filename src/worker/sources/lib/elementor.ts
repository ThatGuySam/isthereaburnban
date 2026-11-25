import { htmlStatusBlocks } from "./html";

/** Read a published Elementor page without the widgets its editor hides on all devices. */
export function elementorPageBlocks(input: Response | string, pageId: number, blocks: string) {
  const hidden = [
    "[hidden]",
    '[aria-hidden="true"]',
    ".elementor-hidden-desktop.elementor-hidden-tablet.elementor-hidden-mobile",
  ].join(", ");
  const visible = new HTMLRewriter().on(hidden, { element(element) { element.remove(); } })
    .transform(typeof input === "string" ? new Response(input) : input);
  return htmlStatusBlocks(visible, `[data-elementor-type="wp-page"][data-elementor-id="${pageId}"]`, blocks);
}
