export const dashboardScript = String.raw`
const el = (id) => document.getElementById(id);
const pending = new Map();
let settings;
let pushRegistration;
let registeringWorker = false;
let deviceOffset = null;
let olderLog = null;
let currentPreview = null;
let previewOffset = 0;

function message(id, text, error = false) {
  const node = el(id);
  node.textContent = text;
  node.toggleAttribute("data-error", error);
}
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function readFips(id) {
  const input = el(id);
  if (!input.reportValidity()) throw new Error("Enter a five-digit county FIPS.");
  return input.value;
}
async function api(path, body) {
  const options = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  const response = await fetch("./api/" + path, options);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const err = new Error(detail.error || "Request failed (" + response.status + ").");
    err.status = response.status;
    throw err;
  }
  return response.json();
}
async function work(button, output, job) {
  button.disabled = true;
  message(output, "");
  try {
    await job();
  } catch (error) {
    message(output, error.message || "Request failed.", true);
  } finally {
    button.disabled = false;
    if (button.id === "send-broadcast") updateConfirmation();
  }
}

async function loadStatus() {
  settings = await api("status");
  const { push, email } = settings.counts;
  el("push-status").textContent = settings.providers.push ? "VAPID configured" : "VAPID unavailable";
  el("email-status").textContent = settings.providers.email ? "Resend configured" : "Resend unavailable";
  el("push-count").textContent = push.total + " total · " + push.test + " test · " + push.canary + " daily";
  el("email-count").textContent = email.total + " active · " + email.confirmed + " confirmed · " + email.test + " test";
  el("canary-status").textContent = settings.canary.enabled
    ? "17:17 UTC · county " + settings.canary.fips
    : "Off · county " + (settings.canary.fips || "unset");
  el("pause-status").textContent = settings.paused ? "Paused" : "Enabled";
  el("pause").textContent = settings.paused ? "Resume alert sending" : "Pause alert sending";
  el("pause").classList.toggle("danger", !settings.paused);
  el("pause").disabled = false;
  el("register").disabled = !settings.providers.push || !pushRegistration;
  if (settings.providers.push) preparePushRegistration();
  el("send-push").disabled = !settings.providers.push;
  el("send-email").disabled = !settings.providers.email;
  el("send-simulation").disabled = !settings.providers.email && !settings.providers.push;
  updateConfirmation();
}
async function preparePushRegistration() {
  if (pushRegistration || registeringWorker) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    message("test-message", "This browser does not support registering for push here.", true);
    return;
  }
  registeringWorker = true;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    pushRegistration = await navigator.serviceWorker.ready;
    el("register").disabled = !settings.providers.push;
  } catch {
    message("test-message", "Could not activate the site's push service worker.", true);
  } finally {
    registeringWorker = false;
  }
}
async function loadDevices(offset = 0) {
  if (offset === 0) {
    el("devices").replaceChildren(new Option("County test cohort", ""));
    el("more-devices").hidden = true;
  }
  const field = el("test-fips");
  if (!field.validity.valid) return;
  const fips = field.value;
  const result = await api("devices?fips=" + fips + "&offset=" + offset);
  if (field.value !== fips) return;
  for (const device of result.devices) {
    el("devices").append(new Option(device.label + (device.canary ? " · daily check" : ""), device.id));
  }
  deviceOffset = result.nextOffset;
  el("more-devices").hidden = deviceOffset === null;
}

async function loadLog(before = null) {
  const log = await api("log" + (before === null ? "" : "?before=" + before));
  el("log-rows").replaceChildren();
  for (const entry of log.rows) {
    const row = document.createElement("tr");
    const time = element("td", new Date(entry.at).toLocaleString());
    time.className = "time";
    row.append(time);
    for (const value of [
      entry.channel, entry.audience, entry.origin ? entry.mode + " · " + entry.origin : entry.mode,
      entry.fips, entry.target_masked, entry.result,
      entry.provider_id || entry.error,
    ]) row.append(element("td", value || "—"));
    row.lastChild.title = "Run " + entry.run_id;
    el("log-rows").append(row);
  }
  if (!log.rows.length) {
    const row = document.createElement("tr");
    const cell = element("td", "No delivery records yet.");
    cell.colSpan = 8;
    row.append(cell);
    el("log-rows").append(row);
  }
  olderLog = log.nextBefore;
  el("older-log").hidden = olderLog === null;
  message("log-message", log.openRuns.length
    ? "Unfinished runs in the past 24 hours: " +
      log.openRuns.map((run) => run.origin + " " + run.fips + " (" + run.id + ")").join(", ")
    : "");
}
function refreshLog() {
  loadLog().catch((error) => message("log-message", error.message, true));
}

const sendStatus = {
  empty: "No eligible subscriptions were found.",
  paused: "Alert sending is paused.",
  duplicate: "This request was already started. Check the delivery log.",
  "rate-limited": "A real broadcast ran recently. Wait five minutes between broadcasts and one hour per county.",
};
async function sendNotice(body, target) {
  const key = JSON.stringify(body);
  const runId = pending.get(key) || crypto.randomUUID();
  pending.set(key, runId);
  let result;
  try {
    result = await api("notice", { ...body, runId });
    pending.delete(key);
  } catch (error) {
    if (error.status >= 400 && error.status < 500) pending.delete(key);
    refreshLog();
    throw error;
  }
  const finished = result.status === "finished";
  const text = finished
    ? result.accepted + " accepted · " + result.gone + " expired · " + result.error + " errors · " + result.skipped + " skipped"
    : (sendStatus[result.status] || "Check the delivery log.");
  message(target, text, !finished || Boolean(result.gone || result.error || result.skipped));
  refreshLog();
  return result;
}

function broadcastFields() {
  return { fips: readFips("broadcast-fips"), channels: el("broadcast-channel").value };
}
function updateConfirmation() {
  el("send-broadcast").disabled = !currentPreview?.preview ||
    el("confirmation").value.trim() !== currentPreview.county || Boolean(settings?.paused);
}
function clearPreview() {
  currentPreview = null;
  el("confirmation").value = "";
  el("preview").hidden = true;
  el("broadcast").hidden = true;
  updateConfirmation();
}
async function showPreview(offset) {
  const fields = broadcastFields();
  const result = await api("notice", { ...fields, action: "preview", offset });
  if (fields.fips !== el("broadcast-fips").value || fields.channels !== el("broadcast-channel").value) return;
  const box = el("preview-content");
  box.replaceChildren(element("h3", result.county + " · " + fields.fips));
  if (result.notice) {
    box.append(element("p", result.notice.title), element("p", result.notice.body));
  } else {
    box.append(element("p", "A real broadcast requires a current, known county status."));
  }
  box.append(element("p", result.sends + " sendable now · maximum " + result.limit + " per manual send"));
  if (result.paused) box.append(element("p", "Alert sending is paused."));
  for (const channel of result.channels) {
    const label = channel.channel === "email" ? "Email" : "Push";
    box.append(element("h3", label + " · " + channel.eligible + " eligible" +
      (channel.configured ? "" : " · provider unavailable")));
    if (!channel.targets.length) continue;
    const list = element("ul", "");
    for (const target of channel.targets) list.append(element("li", target));
    box.append(list);
  }
  el("prev-preview").hidden = offset === 0;
  el("next-preview").hidden = result.nextOffset === null;
  el("preview").hidden = false;
  previewOffset = offset;
  currentPreview = { ...result, ...fields };
  el("broadcast").hidden = !result.preview;
  el("confirmation-label").textContent = "Type " + result.county + " to confirm";
  updateConfirmation();
  if (offset === 0) refreshLog();
}

el("pause").onclick = () => work(el("pause"), "status-message", async () => {
  const paused = !settings.paused;
  await api("pause", { paused });
  clearPreview();
  await loadStatus();
  message("status-message", settings.paused && !paused
    ? "Resume requested. The KV stop can take a minute or longer to clear across locations."
    : (settings.paused ? "Alert sending is paused." : "Alert sending is enabled."));
});
el("test-fips").oninput = () => {
  el("devices").replaceChildren(new Option("County test cohort", ""));
  el("more-devices").hidden = true;
};
el("test-fips").onchange = () => loadDevices().catch((error) => message("test-message", error.message, true));
el("more-devices").onclick = () => work(el("more-devices"), "test-message", () => loadDevices(deviceOffset));
el("register").onclick = () => work(el("register"), "test-message", async () => {
  const fips = readFips("test-fips");
  const canary = el("canary-opt-in").checked;
  if (canary && fips !== settings.canary.fips) throw new Error("Use county " + settings.canary.fips + " for the daily push check.");
  const key = settings.vapidPublicKey;
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  const applicationServerKey = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  let subscription;
  try {
    // Start the permission request during the button click, once the worker is active.
    subscription = await pushRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  } catch (error) {
    if (error.name === "NotAllowedError") throw new Error("Allow notifications in this browser to continue.");
    if (error.name === "InvalidStateError") throw new Error("This browser has a subscription with a different push key. Remove its site subscription and try again.");
    throw error;
  }
  await api("test-device", { fips, canary, subscription: subscription.toJSON() });
  message("test-message", "This browser is in the push test cohort.");
  await Promise.all([loadDevices(), loadStatus()]);
});
el("email-cohort").onsubmit = (event) => {
  event.preventDefault();
  const button = event.submitter || el("email-cohort").querySelector("button");
  const enabled = button.value === "include";
  work(button, "test-message", async () => {
    const result = await api("test-email", { email: el("test-email").value.trim(), enabled });
    message("test-message", result.updated + (enabled ? " subscription(s) added." : " subscription(s) removed."));
    await loadStatus();
  });
};
el("send-push").onclick = () => work(el("send-push"), "test-message", () =>
  sendNotice({ action: "test-push", fips: readFips("test-fips"), device: el("devices").value || undefined }, "test-message"));
el("send-email").onclick = () => work(el("send-email"), "test-message", () =>
  sendNotice({ action: "test-email", fips: readFips("test-fips"), sandbox: el("email-target").value || undefined }, "test-message"));
el("simulate").onsubmit = (event) => {
  event.preventDefault();
  work(el("send-simulation"), "test-message", () => sendNotice({
    action: "simulate", fips: readFips("test-fips"), from: el("from").value, to: el("to").value,
  }, "test-message"));
};
el("broadcast-fips").oninput = clearPreview;
el("broadcast-channel").onchange = clearPreview;
el("confirmation").oninput = updateConfirmation;
el("preview-form").onsubmit = (event) => {
  event.preventDefault();
  clearPreview();
  work(event.submitter || el("preview-form").querySelector("button"), "broadcast-message", () => showPreview(0));
};
el("prev-preview").onclick = () => work(el("prev-preview"), "broadcast-message", () => showPreview(Math.max(0, previewOffset - 20)));
el("next-preview").onclick = () => work(el("next-preview"), "broadcast-message", () => showPreview(currentPreview.nextOffset));
el("broadcast").onsubmit = (event) => {
  event.preventDefault();
  const preview = currentPreview;
  if (!preview?.preview || el("send-broadcast").disabled) return;
  work(el("send-broadcast"), "broadcast-message", async () => {
    await sendNotice({
      ...broadcastFields(), action: "broadcast", preview: preview.preview, confirmation: el("confirmation").value.trim(),
    }, "broadcast-message");
    clearPreview();
  });
};
el("refresh-log").onclick = () => work(el("refresh-log"), "log-message", () => loadLog());
el("older-log").onclick = () => work(el("older-log"), "log-message", () => loadLog(olderLog));
loadStatus().catch((error) => message("status-message", error.message, true));
loadDevices().catch((error) => message("test-message", error.message, true));
refreshLog();
`;
