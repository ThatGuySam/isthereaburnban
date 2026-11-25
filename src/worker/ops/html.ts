import { dashboardScript } from "./script";

export function dashboardHtml(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Notification operations</title>
<style nonce="${nonce}">
  :root { color-scheme: light; font: 16px/1.5 system-ui,sans-serif; color: #152f37; background: #edf2ee; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  header { background: #142f37; color: #f5f9f5; border-bottom: 4px solid #9bd1ac; }
  header div, main { max-width: 72rem; margin: auto; padding: 1.35rem clamp(1rem, 4vw, 2.5rem); }
  header p { margin: 0 0 .15rem; color: #bddecd; }
  h1,h2,h3 { margin: 0; line-height: 1.2; }
  h1 { font-size: clamp(1.65rem, 5vw, 2.45rem); letter-spacing: -.04em; }
  h2 { font-size: 1.35rem; letter-spacing: -.025em; }
  h3 { font-size: 1rem; margin-bottom: .5rem; }
  section { min-width: 0; background: #fcfdfa; border: 1px solid #c9d6cf; border-radius: .75rem; padding: 1.2rem; }
  main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
  .columns, .forms, .summary { display: grid; gap: 1rem; align-items: start; }
  .columns, .forms { grid-template-columns: minmax(0, 1fr); }
  .summary { grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); padding: .9rem 0 0; }
  .summary p { margin: 0; }
  .summary strong { display: block; }
  .muted, small { color: #4e6661; }
  p { margin: .6rem 0; }
  .row { display: flex; flex-wrap: wrap; gap: .65rem; align-items: end; }
  .stack { display: grid; gap: .65rem; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; }
  label { display: grid; gap: .25rem; font-weight: 600; }
  label.check { display: flex; gap: .5rem; align-items: center; font-weight: 500; }
  .form-group { min-width: 0; margin: 0; padding: .9rem 0 0; border: 0; }
  .form-group legend { font-weight: 700; padding: .75rem 0 0; }
  input,select,button { font: inherit; padding: .45rem .6rem; border: 1px solid #738c84; border-radius: .38rem; color: #152f37; background: #fff; min-height: 2.6rem; max-width: 100%; }
  input[type=checkbox] { min-height: 0; }
  input.fips { width: 10ch; }
  button { font-weight: 600; background: #f0f6f0; cursor: pointer; }
  button:disabled { opacity: .55; cursor: default; }
  button.primary { color: white; background: #245846; border-color: #245846; }
  button.danger { color: white; background: #863625; border-color: #863625; }
  :focus-visible { outline: 3px solid #1a747a; outline-offset: 2px; }
  .message { color: #245846; font-weight: 600; }
  .message:empty { display: none; }
  .message[data-error] { color: #863625; }
  .preview { padding: .8rem; border-radius: .4rem; background: #edf4ec; margin: .85rem 0; }
  .confirm { padding-top: .65rem; border-top: 1px solid #c9d6cf; }
  .scroll { overflow: auto; margin-top: .65rem; }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; }
  th,td { border-bottom: 1px solid #d7e2da; padding: .45rem .5rem; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #edf4ec; white-space: nowrap; }
  .time { white-space: nowrap; }
  ul { padding-left: 1.25rem; overflow-wrap: anywhere; }
  [hidden] { display: none !important; }
  @media (min-width: 55rem) {
    .columns { grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); }
    .forms { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
</head>
<body>
<header><div><p>Is There a Burn Ban?</p><h1>Burn ban operations</h1></div></header>
<main>
<section aria-labelledby="delivery-status">
  <h2 id="delivery-status">Delivery status</h2>
  <p>Delivery backlog <span id="outbox-status">Loading…</span></p>
  <div class="summary">
    <p><strong>Web Push</strong><span id="push-status">Loading…</span><br><small id="push-count"></small></p>
    <p><strong>Email · Resend</strong><span id="email-status">Loading…</span><br><small id="email-count"></small></p>
    <p><strong>Daily push check</strong><span id="canary-status">Loading…</span></p>
    <div class="stack">
      <div><strong>Alert sending</strong><p id="pause-status">Loading…</p></div>
      <div><button id="pause" type="button" disabled>Pause alert sending</button></div>
    </div>
  </div>
  <p class="message" id="status-message" role="status"></p>
</section>
<section aria-labelledby="pipeline-heading">
  <h2 id="pipeline-heading">Source pipeline</h2>
  <p id="pending-slot">Loading…</p>
  <ul id="source-issues"></ul>
  <div class="scroll" role="region" aria-label="Source checks" tabindex="0">
  <table>
    <thead><tr><th>Source</th><th>Last attempt</th><th>Last success</th><th>Next due</th><th>Consecutive failures</th><th>Mapped / expected</th><th>Latest error</th></tr></thead>
    <tbody id="source-health"></tbody>
  </table>
  </div>
  <h3>Dead letters</h3>
  <ul id="dead-letters"></ul>
  <p class="message" id="pipeline-message" role="status"></p>
  <button id="refresh-pipeline" type="button">Refresh source pipeline</button>
</section>
<div class="columns">
  <section aria-labelledby="test-heading">
    <h2 id="test-heading">Test notifications</h2>
    <p class="muted">Sends only to test subscriptions following this county, or to a Resend simulator address.</p>
    <label for="test-fips">County FIPS
      <input class="fips" id="test-fips" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" value="40143" required>
    </label>
    <div class="forms">
      <fieldset class="form-group stack">
        <legend>Web Push</legend>
        <label class="check"><input type="checkbox" id="canary-opt-in"> Receive the daily push check</label>
        <div><button type="button" id="register" disabled>Register this browser</button></div>
        <label>Recipient <select id="devices"><option value="">County test cohort</option></select></label>
        <div class="actions">
          <button type="button" id="send-push" disabled>Send test push</button>
          <button type="button" id="more-devices" hidden>Load more devices</button>
        </div>
      </fieldset>
      <fieldset class="form-group stack">
        <legend>Email</legend>
        <form id="email-cohort" class="stack">
          <label>Confirmed email address <input id="test-email" type="email" maxlength="254" required></label>
          <div class="actions">
            <button type="submit" value="include">Add to test cohort</button>
            <button type="submit" value="exclude">Remove</button>
          </div>
        </form>
        <label>Recipient
          <select id="email-target">
            <option value="">County test cohort</option>
            <option value="delivered@resend.dev">Resend · Delivered</option>
            <option value="bounced@resend.dev">Resend · Bounced</option>
            <option value="complained@resend.dev">Resend · Complaint</option>
          </select>
        </label>
        <div><button id="send-email" type="button" disabled>Send test email</button></div>
      </fieldset>
    </div>
    <form id="simulate" class="form-group stack">
      <h3>Simulate a county transition</h3>
      <div class="row">
        <label>From <select id="from"><option value="none">No ban</option><option value="restricted">Restricted</option><option value="ban">Ban</option><option value="unknown">Unknown</option></select></label>
        <label>To <select id="to"><option value="ban">Ban</option><option value="restricted">Restricted</option><option value="none">No ban</option><option value="unknown">Unknown</option></select></label>
        <button class="primary" type="submit" id="send-simulation" disabled>Send to test cohort</button>
      </div>
    </form>
    <p id="test-message" class="message" role="status"></p>
  </section>
  <section aria-labelledby="broadcast-heading">
    <h2 id="broadcast-heading">County broadcast</h2>
    <p class="muted">Preview the county’s current status bulletin and everyone who could receive it.</p>
    <form id="preview-form" class="row">
      <label>County FIPS <input class="fips" id="broadcast-fips" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" value="40143" required></label>
      <label>Channel <select id="broadcast-channel"><option value="both">Push and email</option><option value="push">Push</option><option value="email">Email</option></select></label>
      <button class="primary" type="submit">Preview recipients</button>
    </form>
    <div class="preview" id="preview" hidden>
      <div id="preview-content"></div>
      <div class="actions">
        <button id="prev-preview" type="button" hidden>Previous recipients</button>
        <button id="next-preview" type="button" hidden>More recipients</button>
      </div>
    </div>
    <form id="broadcast" class="stack confirm" hidden>
      <label><span id="confirmation-label">Type the county name</span><input id="confirmation" type="text" autocomplete="off" maxlength="100" required></label>
      <div><button class="danger" id="send-broadcast" type="submit" disabled>Send real broadcast</button></div>
    </form>
    <p id="broadcast-message" class="message" role="status"></p>
  </section>
</div>
<section aria-labelledby="log-heading">
  <div class="actions">
    <h2 id="log-heading">Delivery log</h2>
    <button type="button" id="refresh-log">Refresh</button>
    <button type="button" id="older-log" hidden>Older entries</button>
  </div>
  <p class="muted">“Accepted” means the provider took the request. Check the receiving device or inbox for delivery.</p>
  <p id="log-message" class="message" role="status"></p>
  <div class="scroll" role="region" aria-label="Recent delivery records" tabindex="0">
    <table>
      <thead><tr><th scope="col">Time</th><th scope="col">Channel</th><th scope="col">Audience</th><th scope="col">Mode</th><th scope="col">County FIPS</th><th scope="col">Recipient</th><th scope="col">Result</th><th scope="col">Provider ID / detail</th></tr></thead>
      <tbody id="log-rows"></tbody>
    </table>
  </div>
</section>
</main>
<script nonce="${nonce}">${dashboardScript}</script>
</body></html>`;
}
