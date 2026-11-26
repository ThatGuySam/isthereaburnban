import { cleanText, decodeEntities, extractHtmlGrid } from "./html";

const NOTICE_URL = /^https:\/\/nixle\.us\/[A-Z0-9]{5,10}$/;
const EXPIRED_ICON = "/static/Citizen-master/img/public/msg_expiration.png";

/** Read a certified agency's reverse-chronological public Nixle Wire page. */
export async function nixleWire(input: Response | string, agency: string) {
  let issuer = "";
  let wires = 0;
  let rows = 0;
  const notices: { title: string; url: string }[] = [];
  let entry: { text: string; links: (string | null)[] } | undefined;
  const rewriter = new HTMLRewriter()
    .on("#wire_agency > h2.certified", {
      text(chunk) { issuer += chunk.text; },
    })
    .on("ol#wire", { element() { wires++; } })
    .on("ol#wire > li", { element() { rows++; } })
    .on("#wire > li p.headline_agency", {
      element(element) {
        if (entry) throw new Error("Nested Nixle Wire headlines");
        const current = { text: "", links: new Array<string | null>() };
        entry = current;
        element.onEndTag(() => {
          entry = undefined;
          const [url, ...extra] = current.links;
          const title = /^(.+)\s+More\s*(?:&raquo;|»)$/.exec(cleanText(decodeEntities(current.text)))?.[1];
          if (!url || extra.length || !NOTICE_URL.test(url) || !title) throw new Error("Changed Nixle Wire headline");
          notices.push({ title, url });
        });
      },
      text(chunk) { if (entry) entry.text += chunk.text; },
    })
    .on("#wire > li p.headline_agency > a", {
      element(element) { entry?.links.push(element.getAttribute("href")); },
    });
  const transformed = rewriter.transform(typeof input === "string" ? new Response(input) : input);
  await transformed.body?.pipeTo(new WritableStream({ write() {} }));
  if (wires !== 1 || cleanText(decodeEntities(issuer)) !== agency || entry || !notices.length || notices.length !== rows ||
      new Set(notices.map(({ url }) => url)).size !== notices.length) {
    throw new Error(`Missing or changed Nixle Wire page for ${agency}`);
  }
  return notices;
}

/** Verify the linked detail belongs to the same agency and headline as its Wire entry. */
export async function nixleNotice(input: Response | string, agency: string, slug: string, title: string) {
  const [[heading, ...titleExtra] = [], [issuer, timestamp, ...headerExtra] = [], icons, paragraphs, ...extra] = await extractHtmlGrid(input, {
    row: "head, #fullpubhd, .full_message_info > h2, #alert-body",
    cell: "head title, #fullpubhd dd.certified > a, #fullpubhd dl.last > dd, .full_message_info > h2 img, #alert-body > p",
    spaceLineBreaks: true,
  });
  const caption = heading?.text.match(/^“(.+)” from (.+) : Nixle$/);
  const body = paragraphs?.map(({ text }) => text).filter(Boolean).join(" ");
  if (caption?.[1].trim() !== title || caption[2] !== agency || issuer?.text !== agency || issuer.href !== `/${slug}/` ||
      !timestamp?.text || titleExtra.length || headerExtra.length || extra.length || !icons || icons.length > 1 ||
      (icons.length === 1 && icons[0].src !== EXPIRED_ICON) || !body) {
    throw new Error(`Missing or changed Nixle notice from ${agency}`);
  }
  return { published: timestamp.text, expired: icons.length === 1, body };
}
