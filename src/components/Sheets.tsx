// The only React on the site: one Vaul drawer that shows the location, alert or menu sheet.
// Pages open it with openSheet() (src/client/place.ts) or any [data-sheet] element.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Drawer } from "vaul";
import {
  emitResolved,
  locate,
  lookupStatus,
  readPlace,
  takePendingSheet,
  type OpenDetail,
  type ResolvedDetail,
  type Result,
} from "../client/place";

export default function Sheets() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<OpenDetail>({ sheet: "menu" });

  useEffect(() => {
    const show = (d: OpenDetail) => {
      setDetail(d);
      setOpen(true);
    };
    const onOpen = (e: Event) => {
      takePendingSheet();
      show((e as CustomEvent<OpenDetail>).detail);
    };
    document.addEventListener("itabb:open", onOpen);
    const pending = takePendingSheet();
    if (pending) show(pending);
    return () => document.removeEventListener("itabb:open", onOpen);
  }, []);

  const close = () => setOpen(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} autoFocus>
      <Drawer.Portal>
        <Drawer.Overlay className="vs-overlay" />
        <Drawer.Content className="vs" aria-describedby={undefined}>
          <Drawer.Handle className="vs-handle" />
          <button type="button" className="vs-close" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
            </svg>
          </button>
          {detail.sheet === "location" && <LocationSheet key={JSON.stringify(detail)} detail={detail} done={close} />}
          {detail.sheet === "alert" && (
            <AlertSheet key={detail.fips} detail={detail} pickPlace={() => setDetail({ sheet: "location" })} />
          )}
          {detail.sheet === "menu" && <MenuSheet detail={detail} />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ---------- Location ----------

function LocationSheet({ detail, done }: { detail: OpenDetail; done: () => void }) {
  const [msg, setMsg] = useState(detail.message ?? "");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<{ zip: string; results: Result[] } | null>(null);
  const hasPlace = Boolean(readPlace()?.fips);

  function choose(result: Result, extra: Omit<ResolvedDetail, "result"> = {}) {
    if (document.querySelector("[data-hero]")) {
      emitResolved({ result, ...extra });
      done();
    } else if (result.url) {
      location.href = result.url;
    }
  }

  async function byZip(zip: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await lookupStatus({ zip });
      if (!res.results?.length) return setMsg("We couldn't find that ZIP. Try another.");
      if (res.ambiguous && res.results.length > 1) return setChoices({ zip, results: res.results });
      choose(res.results[0], { zip, note: res.approximate ? `Closest match for ZIP ${zip}` : undefined });
    } catch {
      setMsg("Lookup failed. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (detail.zip) void byZip(detail.zip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function useLocation() {
    setBusy(true);
    setMsg("Finding you…");
    try {
      const { lat, lon } = await locate();
      const res = await lookupStatus({ lat, lon });
      const r = res.results?.[0];
      if (!r) return setMsg("We couldn't find a US county there. Try a ZIP.");
      setMsg("");
      choose(r, { lat: Number(lat), lon: Number(lon) });
    } catch (err) {
      setMsg(err instanceof GeolocationPositionError || (err as Error)?.message === "unsupported" ? "Location is off. Enter a ZIP instead." : "Lookup failed. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const zip = String(new FormData(e.currentTarget).get("zip") ?? "").trim();
    if (/^\d{5}$/.test(zip)) void byZip(zip);
    else setMsg("Enter a 5-digit ZIP.");
  }

  if (choices) {
    return (
      <div className="vs-body">
        <Drawer.Title className="vs-title">Which county?</Drawer.Title>
        <p className="vs-sub">ZIP {choices.zip} touches {choices.results.length} counties.</p>
        <ul className="vs-list" role="list">
          {choices.results.map((r) => (
            <li key={r.fips}>
              <button type="button" onClick={() => choose(r, { zip: choices.zip })}>
                {r.county}, {r.state}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="vs-body">
      <Drawer.Title className="vs-title">{hasPlace ? "Change location" : "Where are you?"}</Drawer.Title>
      <p className="vs-msg" aria-live="polite">{msg}</p>
      <button type="button" className="vs-btn" onClick={useLocation} disabled={busy}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M21 3 3 10.5l7.5 3 3 7.5L21 3Z" fill="currentColor" />
        </svg>
        Use my location
      </button>
      <form className="vs-row" onSubmit={onSubmit} action="/" method="get">
        <label className="sr-only" htmlFor="vs-zip">ZIP code</label>
        <input id="vs-zip" name="zip" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} placeholder="ZIP code" required />
        <button type="submit" className="vs-btn vs-btn--quiet" disabled={busy}>Check</button>
      </form>
      <p className="vs-fine">
        <a href="/map/">Pick on a map</a> · <a href="/us/">Browse states</a>
      </p>
    </div>
  );
}

// ---------- Alerts ----------

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** "ready" = real push works here; "install" = iOS Safari tab (push needs the Home Screen app); "none" = no push. */
function pushMode(): "ready" | "install" | "none" {
  if (isIos() && !isStandalone()) return "install";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "ready" : "none";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function AlertSheet({ detail, pickPlace }: { detail: OpenDetail; pickPlace: () => void }) {
  const stored = readPlace();
  const fips = detail.fips || stored?.fips || "";
  const place = detail.place || (stored?.fips === fips ? stored?.label : "") || "this county";
  const mode = useRef(pushMode()).current;
  const [pushState, setPushState] = useState<"idle" | "busy" | "on">("idle");
  const [pushMsg, setPushMsg] = useState(
    mode === "ready" && Notification.permission === "denied" ? "Notifications are blocked for this site in your browser settings." : "",
  );
  const [emailMsg, setEmailMsg] = useState("");

  if (!fips) {
    return (
      <div className="vs-body">
        <Drawer.Title className="vs-title">Alerts</Drawer.Title>
        <p className="vs-sub">Choose a location first.</p>
        <button type="button" className="vs-btn" onClick={pickPlace}>Choose location</button>
      </div>
    );
  }

  async function turnOnPush() {
    setPushState("busy");
    setPushMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked for this site in your browser settings.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = (await fetch("/api/v1/push/key").then((r) => r.json())) as { publicKey?: string };
      if (!publicKey) throw new Error("Notifications aren't switched on yet. Use email for now.");
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await postJson("/api/v1/push/subscribe", { subscription: subscription.toJSON(), fips: [fips] });
      setPushState("on");
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : "Couldn't turn on notifications.");
      setPushState("idle");
    }
  }

  async function onEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    setEmailMsg("Signing you up…");
    try {
      const res = await postJson<{ emailEnabled?: boolean }>("/api/v1/email/subscribe", { email, fips: [fips] });
      setEmailMsg(res.emailEnabled === false ? "You're on the list. Email alerts start soon." : "Check your inbox to confirm.");
      form.reset();
    } catch (err) {
      setEmailMsg(err instanceof Error ? `Couldn't sign up: ${err.message}` : "Couldn't sign up.");
    }
  }

  return (
    <div className="vs-body">
      <Drawer.Title className="vs-title">Alerts for {place}</Drawer.Title>
      <p className="vs-sub">Only when the burn ban status changes.</p>

      {mode === "ready" && (
        <>
          <button type="button" className="vs-btn" onClick={turnOnPush} disabled={pushState !== "idle"}>
            <BellIcon />
            {pushState === "on" ? "Notifications on" : pushState === "busy" ? "Asking your browser…" : "Turn on notifications"}
          </button>
          {pushMsg && <p className="vs-msg" role="status">{pushMsg}</p>}
        </>
      )}
      {mode === "install" && (
        <>
          <button type="button" className="vs-btn" disabled aria-describedby="vs-install">
            <BellIcon />
            Notifications
          </button>
          <p className="vs-hint" id="vs-install">
            Tap <ShareIcon /> then <strong>Add to Home Screen</strong> to get notifications.
          </p>
        </>
      )}

      <form className="vs-row" onSubmit={onEmail}>
        <label className="sr-only" htmlFor="vs-email">Email address</label>
        <input id="vs-email" type="email" name="email" autoComplete="email" placeholder="Email" required />
        <button type="submit" className="vs-btn vs-btn--quiet">Email me</button>
      </form>
      <p className="vs-msg" aria-live="polite">{emailMsg}</p>
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0h-4Z" fill="currentColor" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="vs-share" viewBox="0 0 24 24" width="18" height="18" role="img" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6v10h12V10h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Menu ----------

function MenuSheet({ detail }: { detail: OpenDetail }) {
  const here = typeof location === "undefined" ? "/" : location.pathname;
  const county = detail.place?.replace(/, [A-Z]{2}$/, "");
  return (
    <div className="vs-body">
      <Drawer.Title className="vs-title">Is There a Burn Ban?</Drawer.Title>
      <nav aria-label="Site">
        <ul className="vs-list" role="list">
          {detail.url && detail.url !== here && county && (
            <li><a href={detail.url}>More about {county}</a></li>
          )}
          {here !== "/" && <li><a href="/">Home</a></li>}
          <li><a href="/map/">Burn ban map</a></li>
          <li><a href="/us/">Browse states</a></li>
          <li><a href="/developers/">Developers</a></li>
        </ul>
      </nav>
      <p className="vs-fine">Informational only. Confirm with the official source before you burn.</p>
    </div>
  );
}
