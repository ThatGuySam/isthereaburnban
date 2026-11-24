// "Alert me" sheet: web push (service worker + VAPID) and email signup for one county.

let currentFips = "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** Fips + place of whatever county the page is currently showing. */
function currentCounty(trigger: HTMLElement): { fips: string; place: string } {
  const shown = document.querySelector<HTMLElement>("[data-status-slot] [data-fips]");
  const fips = trigger.dataset.fips || shown?.dataset.fips || "";
  const place = trigger.dataset.place || (shown?.dataset.fips === fips ? shown?.dataset.place : "") || "this county";
  return { fips, place };
}

export function initAlerts(): void {
  const sheet = document.querySelector<HTMLDialogElement>("[data-alert-sheet]");
  if (!sheet) return;
  const placeEl = sheet.querySelector<HTMLElement>("[data-alert-place]")!;
  const pushBtn = sheet.querySelector<HTMLButtonElement>("[data-push-btn]")!;
  const pushMsg = sheet.querySelector<HTMLElement>("[data-push-msg]")!;
  const iosHint = sheet.querySelector<HTMLElement>("[data-ios-hint]")!;
  const emailForm = sheet.querySelector<HTMLFormElement>("[data-email-form]")!;
  const emailMsg = sheet.querySelector<HTMLElement>("[data-email-msg]")!;

  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  document.addEventListener("click", (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>("[data-alert-open]");
    if (!trigger) return;
    const { fips, place } = currentCounty(trigger);
    currentFips = fips;
    placeEl.textContent = place;
    pushMsg.textContent = "";
    emailMsg.textContent = "";
    const iosNeedsInstall = isIos() && !isStandalone();
    iosHint.hidden = !iosNeedsInstall;
    pushBtn.disabled = iosNeedsInstall || !pushSupported;
    if (!pushSupported && !iosNeedsInstall) pushMsg.textContent = "This browser doesn't support notifications. Use email instead.";
    if (!fips) {
      pushBtn.disabled = true;
      emailMsg.textContent = "Pick a county first (enter a ZIP or use your location).";
    }
    sheet.showModal();
  });

  pushBtn.addEventListener("click", async () => {
    if (!currentFips) return;
    pushBtn.disabled = true;
    pushMsg.textContent = "Asking your browser…";
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked for this site. Allow them in browser settings.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = (await fetch("/api/v1/push/key").then((r) => r.json())) as { publicKey?: string };
      if (!publicKey) throw new Error("Notifications aren't switched on yet. Try email for now.");
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await postJson("/api/v1/push/subscribe", { subscription: subscription.toJSON(), fips: [currentFips] });
      pushMsg.textContent = "Done. We'll notify you when this county's status changes.";
    } catch (err) {
      pushMsg.textContent = err instanceof Error ? err.message : "Couldn't turn on notifications.";
      pushBtn.disabled = false;
    }
  });

  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentFips) return;
    const email = String(new FormData(emailForm).get("email") ?? "").trim();
    emailMsg.textContent = "Signing you up…";
    try {
      const res = await postJson("/api/v1/email/subscribe", { email, fips: [currentFips] });
      emailMsg.textContent =
        res.emailEnabled === false
          ? "Email alerts are switching on soon — you're on the list."
          : "Check your inbox to confirm.";
      emailForm.reset();
    } catch (err) {
      emailMsg.textContent = err instanceof Error ? `Couldn't sign up: ${err.message}` : "Couldn't sign up.";
    }
  });
}
