import { pacedSourceReader, type HttpFetch } from "./http";

type FormSession = {
  action: string;
  destination: URL;
  cookies: readonly [string, ...string[]];
  maxBytes: number;
  maxResponseAgeMs: number;
  fetchImpl?: HttpFetch;
};

/** Read a public HTML form's result when the selection is stored in a first-party session. */
export function publicFormSession({
  action, destination, cookies, maxBytes, maxResponseAgeMs, fetchImpl,
}: FormSession, intervalMs = 1_000) {
  const read = pacedSourceReader({ redirect: "manual", maxBytes, maxResponseAgeMs, fetchImpl }, intervalMs);
  return async (fields: URLSearchParams, pageUrl = destination): Promise<Response> => {
    if (pageUrl.origin !== destination.origin || pageUrl.pathname !== destination.pathname ||
        pageUrl.username || pageUrl.password) throw new Error(`${action} -> invalid form session page`);
    const selection = await read(action, {
      method: "POST", body: fields, formRedirect: destination, headers: { accept: "text/html" },
    });
    if (selection.notModified) throw new Error(`${action} -> unexpected 304 after form selection`);
    const headers = selection.response.headers;
    const received: unknown = typeof headers.getSetCookie === "function" ? headers.getSetCookie()
      : "getAll" in headers && typeof headers.getAll === "function" ? headers.getAll("Set-Cookie") : undefined;
    if (!Array.isArray(received)) throw new Error(`${action} -> missing form session headers`);
    const session = new Map<string, string>();
    for (const cookie of received) {
      const match = typeof cookie === "string" &&
        /^([\w-]+)=([\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+)(?:;|$)/.exec(cookie);
      if (!match || !cookies.includes(match[1])) continue;
      if (session.has(match[1])) throw new Error(`${action} -> duplicate form session cookie`);
      session.set(match[1], `${match[1]}=${match[2]}`);
    }
    if (cookies.some((name) => !session.has(name))) throw new Error(`${action} -> missing form session cookie`);

    const page = await read(pageUrl.href, {
      headers: { accept: "text/html", "cache-control": "no-cache", cookie: [...session.values()].join("; ") },
    });
    if (page.notModified) throw new Error(`${action} -> unexpected 304 after form selection`);
    return page.response;
  };
}
