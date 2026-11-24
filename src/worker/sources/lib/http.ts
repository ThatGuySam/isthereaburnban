// Shared by all inventory entries reached over HTTP. Validators are stored by the caller after a successful parse.
export const USER_AGENT = "isthereaburnban.com status checker (+https://isthereaburnban.com/developers/)";

export class BlockedError extends Error {
  constructor(readonly url: string, readonly status: number, reason: string) {
    super(`${url} -> blocked (HTTP ${status}): ${reason}`);
    this.name = "BlockedError";
  }
}

export class HttpError extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`${url} -> HTTP ${status}`);
    this.name = "HttpError";
  }
}

export type Validators = { etag?: string; lastModified?: string };
type SourceReply =
  | { notModified: true; validators: Validators }
  | { notModified: false; validators: Validators; response: Response };

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

type Options = RequestInit & {
  validators?: Validators;
  timeoutMs?: number;
  attempts?: number;
  maxBytes?: number;
  fetchImpl?: HttpFetch;
};

export function blockedReason(status: number, headers: Headers, prefix = ""): string | undefined {
  if (headers.get("cf-mitigated") === "challenge" || /\/cdn-cgi\/challenge-platform\/|\bcf-chl-|_cf_chl_opt\b/i.test(prefix)) {
    return "Cloudflare challenge";
  }
  if (headers.get("x-datadome-traffic-rule-response") === "block" || /\bgeo\.captcha-delivery\.com\b/i.test(prefix)) {
    return "DataDome challenge";
  }
  if (/<(?:title|h1)\b[^>]*>\s*Access Denied\b/i.test(prefix)) return "Access Denied";
  if (/incapsula incident id|<title>\s*Request Rejected\s*<\/title>/i.test(prefix)) return "Imperva challenge";
  if (status === 403) return headers.get("server")?.includes("Akamai") ? "Akamai Access Denied" : "Forbidden";
}

const SNIFF_BYTES = 8192;

/** Inspect the beginning of a streamed response, then replay it to the parser. */
async function checkedBody(response: Response, url: string, maxBytes: number): Promise<Response> {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let ended = false;
  const read = async () => {
    const chunk = await reader.read();
    if (!chunk.done && (size += chunk.value.byteLength) > maxBytes) {
      await reader.cancel();
      throw new Error(`${url} exceeded ${maxBytes} bytes`);
    }
    return chunk;
  };
  if (!/^application\/pdf\b/i.test(response.headers.get("content-type") ?? "")) {
    const decode = new TextDecoder();
    let prefix = "";
    try {
      while (size < SNIFF_BYTES) {
        const chunk = await read();
        if (chunk.done) {
          ended = true;
          break;
        }
        parts.push(chunk.value);
        prefix += decode.decode(chunk.value.subarray(0, SNIFF_BYTES - size + chunk.value.byteLength), { stream: true });
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
    const blocked = blockedReason(response.status, response.headers, prefix);
    if (blocked) {
      await reader.cancel();
      throw new BlockedError(url, response.status, blocked);
    }
  }
  let next = 0;
  return new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (next < parts.length) {
        controller.enqueue(parts[next++]);
      } else if (ended) {
        controller.close();
      } else {
        const chunk = await read();
        if (chunk.done) controller.close();
        else controller.enqueue(chunk.value);
      }
    },
    cancel: () => reader.cancel(),
  }), response);
}

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  const backoff = 400 * 2 ** attempt;
  if (!retryAfter) return backoff;
  const ms = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(ms) ? Math.max(backoff, ms) : backoff;
}

export async function fetchSource(url: string, options: Options = {}): Promise<SourceReply> {
  const { fetchImpl = fetch, timeoutMs = 15_000, attempts = 2, maxBytes = 2_000_000, validators, ...init } = options;
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", USER_AGENT);
  if (!headers.has("accept")) headers.set("accept", "*/*");
  const method = (init.method ?? "GET").toUpperCase();
  const safe = method === "GET" || method === "HEAD";
  if (safe && validators?.etag) headers.set("if-none-match", validators.etag);
  if (safe && validators?.lastModified) headers.set("if-modified-since", validators.lastModified);

  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      response = await fetchImpl(url, { ...init, headers, signal });
      const finalUrl = response.url || url;
      const blocked = blockedReason(response.status, response.headers);
      if (blocked) throw new BlockedError(finalUrl, response.status, blocked);
      const received = {
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
      };
      if (response.status === 304 && safe && (validators?.etag || validators?.lastModified)) {
        return { notModified: true, validators: {
          etag: received.etag ?? validators.etag,
          lastModified: received.lastModified ?? validators.lastModified,
        } };
      }
      const body = await checkedBody(response, finalUrl, maxBytes);
      if (!response.ok) {
        await body.body?.cancel().catch(() => undefined);
        throw new HttpError(finalUrl, response.status);
      }
      return { notModified: false, validators: received, response: body };
    } catch (error) {
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
      if (!safe || attempt + 1 >= attempts || init.signal?.aborted || error instanceof BlockedError) throw error;
      if (error instanceof HttpError && error.status !== 408 && error.status !== 429 && error.status < 500) throw error;
      const delay = retryDelay(response, attempt);
      // Leave long Retry-After windows to the caller's next scheduled poll.
      if (delay > 5000) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function getText(url: string, options: Options = {}): Promise<string> {
  const reply = await fetchSource(url, options);
  if (reply.notModified) throw new Error("Use fetchSource to handle a conditional response");
  return reply.response.text();
}

/** Space a publisher's sequential requests within one poll. */
export function pacedTextReader(options: Options, intervalMs = 1_000) {
  let nextStart = 0;
  return async (url: string) => {
    const wait = nextStart - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nextStart = Date.now() + intervalMs;
    return getText(url, { attempts: 1, ...options });
  };
}
