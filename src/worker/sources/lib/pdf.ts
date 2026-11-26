import { sha256 } from "./hash";
import { fetchSource, type Validators } from "./http";

/** Match the strong validator for an exact, reviewed PDF edition. */
export function matchesPdfEtag(response: Response, etag: string): boolean {
  return response.status === 200 && /^application\/pdf\b/i.test(response.headers.get("content-type") ?? "") &&
    /^"[^"]+"$/.test(etag) && response.headers.get("etag") === etag;
}

// Manual inventory shape PDF: Pennsylvania DCNR, signed county orders, and scanned notices.
// A byte hash detects document changes and gives a reviewer a stable reference.
export async function manualPdf(response: Response) {
  const body = await response.arrayBuffer();
  if (new TextDecoder().decode(body.slice(0, 5)) !== "%PDF-") throw new Error("Expected a PDF document");
  return {
    mode: "manual" as const,
    sha256: await sha256(body),
    lastModified: response.headers.get("last-modified"),
  };
}

export async function monitorPdf(url: string, validators?: Validators) {
  const reply = await fetchSource(url, { validators, maxBytes: 2_000_000, headers: { accept: "application/pdf" } });
  if (reply.notModified) return reply;
  return { notModified: false as const, validators: reply.validators, document: await manualPdf(reply.response) };
}
