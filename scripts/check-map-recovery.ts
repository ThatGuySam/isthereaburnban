// Browser check: /map/ must not come back blank or colorless after a page visit and Back.
//
//   bun scripts/check-map-recovery.ts [baseUrl]     (default https://beta.isthereaburnban.com)
//
// Drives headless Chromium over raw CDP (no Playwright dependency) with the back-forward cache on,
// and simulates what iOS Safari does to a page parked in that cache:
//   1. drops the WebGL context (WEBGL_lose_context) and never restores it -> map must be rebuilt
//   2. drops the context and restores it -> MapLibre restores, colors must be re-applied
//   3. terminates the MapLibre worker -> MapLibre restarts it, colors must be re-applied
// Each case passes when the screenshot shows burn-ban colors again. CHROMIUM overrides the binary.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] ?? "https://beta.isthereaburnban.com").replace(/\/$/, "");
const bin = process.env.CHROMIUM ?? "/usr/bin/chromium";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs before page scripts: keeps the WebGL context and workers reachable, and kills workers on pagehide when asked.
const INIT = `(() => {
  const W = window.Worker;
  window.Worker = function (...a) { const w = new W(...a); (window.__workers ||= []).push(w); return w; };
  window.Worker.prototype = W.prototype;
  addEventListener("pagehide", () => { if (sessionStorage.killWorkers) (window.__workers || []).forEach((w) => w.terminate()); });
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) { const c = get.call(this, t, ...r); if (/webgl/.test(t) && c) window.__gl = c; return c; };
})()`;

// Share of screenshot pixels in the ban/restricted/no-ban/can't-confirm colors, measured in the page itself.
const COLORED = `async (png) => {
  const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
  const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data;
  const pal = [[243,79,73],[245,166,35],[42,157,112],[143,163,173]]; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (pal.some((p) => Math.abs(d[i]-p[0]) < 14 && Math.abs(d[i+1]-p[1]) < 14 && Math.abs(d[i+2]-p[2]) < 14)) n++;
  return (100 * n) / (img.width * img.height);
}`;

const profile = mkdtempSync(join(tmpdir(), "map-check-"));
const chrome = spawn(bin, ["--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1280,800", "about:blank"], { stdio: "ignore" });
let failed = 0;
try {
  let port = "";
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {}
  }
  const http = `http://127.0.0.1:${port}`;
  let ws!: WebSocket;
  let seq = 0;
  const pending = new Map<number, (v: any) => void>();
  const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
  const until = async (expr: string, ms = 30_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await evaluate(expr).catch(() => false)) return true;
    throw new Error(`timed out waiting for ${expr} (at ${await evaluate("location.href").catch(() => "?")})`);
  };
  const colored = async () => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    return (await evaluate(`(${COLORED})(${JSON.stringify(data)})`)) as number;
  };
  /** Each case gets a fresh tab, so one case's leftovers (bfcache entries, workers) can't affect the next. */
  const openTab = async () => {
    const t = (await (await fetch(`${http}/json/new?about:blank`, { method: "PUT" })).json()) as { id: string; webSocketDebuggerUrl: string };
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.method === "Runtime.exceptionThrown") console.log("  page error:", m.params.exceptionDetails.exception?.description?.split("\n")[0]);
      if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.error ? Promise.reject(new Error(m.error.message)) : m.result); pending.delete(m.id); }
    });
    await send("Page.enable");
    await send("Page.bringToFront");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: INIT + `;addEventListener("pageshow", (e) => { if (e.persisted) window.__restored = true; });` });
    return t.id;
  };

  const visitAndBack = async () => {
    await evaluate("window.__restored = false");
    await evaluate(`location.href = ${JSON.stringify(`${base}/us/`)}`);
    await until("location.pathname === '/us/' && document.readyState === 'complete'");
    await evaluate("history.back()");
    await until("location.pathname === '/map/'");
    await send("Page.bringToFront"); // headless can leave a restored page reporting "hidden"
    await sleep(500);
    if (!(await evaluate("window.__restored === true"))) console.warn("  note: /map/ was reloaded, not restored from the back-forward cache");
  };

  const cases: [string, () => Promise<void>][] = [
    ["context lost in back-forward cache, never restored", async () => {
      await visitAndBack();
      await evaluate("window.__gl.getExtension('WEBGL_lose_context').loseContext()");
    }],
    ["context lost and restored", async () => {
      await evaluate("(() => { const x = window.__gl.getExtension('WEBGL_lose_context'); x.loseContext(); setTimeout(() => x.restoreContext(), 300); })()");
    }],
    ["worker terminated while in back-forward cache", async () => {
      await evaluate("sessionStorage.killWorkers = '1'");
      await visitAndBack();
      await evaluate("delete sessionStorage.killWorkers");
    }],
  ];

  for (const [name, run] of cases) {
    const tab = await openTab();
    await send("Page.navigate", { url: `${base}/map/` });
    await until("'mapColored' in document.documentElement.dataset", 60_000);
    await sleep(800);
    const before = await colored();
    await run();
    // Recovery re-tiles the geometry in the worker; give a slow software-GL run time before failing.
    let after = 0;
    for (const end = Date.now() + 10_000; Date.now() < end && after <= before * 0.5; ) {
      await sleep(1000);
      after = await colored();
    }
    const lost = await evaluate("window.__gl.isContextLost()");
    if (process.env.DEBUG) console.log("  visibility:", await evaluate("document.visibilityState"));
    const ok = !lost && before > 1 && after > before * 0.5;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}: colored ${before.toFixed(1)}% -> ${after.toFixed(1)}%${lost ? " (context still lost)" : ""}`);
    ws.close();
    await fetch(`${http}/json/close/${tab}`);
  }
} finally {
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
