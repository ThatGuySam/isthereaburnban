export class RequestBodyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function readLimitedBody(request: Request, limit: number): Promise<string> {
  if (Number(request.headers.get("content-length")) > limit) {
    throw new RequestBodyError("Request body is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyError("Request body is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  const body = await readLimitedBody(request, limit);
  try {
    return JSON.parse(body);
  } catch {
    throw new RequestBodyError("The request must contain valid JSON.");
  }
}
