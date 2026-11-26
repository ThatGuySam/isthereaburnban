import { htmlStatusBlocks } from "./html";

/** Read a published Elementor page without the widgets its editor hides on all devices. */
export function elementorPageBlocks(input: Response | string, pageId: number, blocks: string, {
  section = "", hiddenWidgets = "",
} = {}) {
  const hidden = [
    "[hidden]",
    '[aria-hidden="true"]',
    ".elementor-hidden-desktop.elementor-hidden-tablet.elementor-hidden-mobile",
    hiddenWidgets,
  ].filter(Boolean).join(", ");
  const visible = new HTMLRewriter().on(hidden, { element(element) { element.remove(); } })
    .transform(typeof input === "string" ? new Response(input) : input);
  const page = `[data-elementor-type="wp-page"][data-elementor-id="${pageId}"]`;
  return htmlStatusBlocks(visible, section ? `${page} ${section}` : page, blocks);
}
