# Notification operations dashboard

The Worker serves the dashboard at `https://<your-site-host>/ops/<DASH_TOKEN>/`. Use the origin where you want to receive push notifications. A missing or incorrect token returns HTTP 404.

## Release

Run these commands from `v2-cloudflare` with the Cloudflare account and Worker from `wrangler.jsonc` selected.

```sh
bunx wrangler d1 migrations apply isthereaburnban --remote
bun run deploy
bunx wrangler secret put DASH_TOKEN
```

Paste 32 random bytes encoded as a URL-safe string at the secret prompt. For example, generate a 64-character token with `openssl rand -hex 32` and store it in your password manager. The secret command creates and deploys a new version of the existing Worker. Use the URL with its trailing slash. Rotate the token if the link is shared accidentally.

The configured sender defaults to `alerts@isthereaburnban.com`. For a different verified sender, set `EMAIL_FROM` in Wrangler’s variables before deploying. List secret names with `bunx wrangler secret list`. If push needs its private key or you’re enabling Resend for the first time, run the corresponding command using the real value at the prompt.

```sh
bunx wrangler secret put VAPID_PRIVATE_KEY
bunx wrangler secret put RESEND_API_KEY
```

The VAPID private key must match the configured `VAPID_PUBLIC_KEY`. Resend needs a sending key and a verified sender domain. Each command updates the live Worker. [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret-put)

The link itself grants access. Keep it in the password manager and avoid pasting it into chats, tickets, or shared browser history. The Worker sends `noindex, nofollow`, `no-store`, and `no-referrer`. Its persisted invocation logs and traces are disabled because fetch telemetry can include the request URL. Any separate request logging or live tailing should treat the route as sensitive.

## Run a test

- **Push device.** Enter the county FIPS and click **Register this browser**. Allow notifications. Registration uses the site’s `/sw.js` and VAPID key. It adds the selected county and preserves counties the browser already follows. Then choose that device or **County test cohort** and send a test push. Verify the displayed notification and click through to the county page.
- **Email inbox.** Sign up through the public site with your own address for the same county and click the confirmation link. In the dashboard, enter that address and select **Add to test cohort**. This marks existing active, confirmed subscriptions. To leave the cohort, use **Remove**. If you signed up before Resend was configured, sign up again to receive a confirmation link.
- **Resend simulator.** Choose **Delivered** (`delivered@resend.dev`), **Bounced** (`bounced@resend.dev`), or **Complaint** (`complained@resend.dev`). Find the request by provider ID in Resend’s Emails dashboard, then inspect the event timeline. An accepted request can still produce a simulated bounce or complaint. These addresses count against the account quota. [Resend test emails](https://resend.com/docs/dashboard/emails/send-test-emails)
- **County transition.** Choose the old and new statuses and send to the test cohort. The alert is labeled as a test and leaves the published county snapshot and transition history untouched. Run this on the deployed origin with a controlled inbox and device to check the full visible result.

Test status is an opt-in for staff sends. Registered devices and confirmed emails still receive ordinary alerts for the counties they follow. Test and canary pushes use separate topics and notification tags so they can coexist with a live county alert.

## Preview, broadcast, and pause

**Preview recipients** computes the county audience from the same subscription data used by cron, then lists masked recipients and exact eligible counts per channel. Review the bulletin, county, and channels. A live broadcast requires a known county status checked within the preceding 48 hours, a matching preview less than five minutes old, and the exact county name. Audience or bulletin changes invalidate the preview. A bulletin reports the published status using the same delivery code as an automatic transition alert.

Manual sends are capped at eight deliveries per action. A manual broadcast also has a global five-minute cooldown and a one-hour cooldown for the county. Push rows and confirmed active email rows each count as a subscription. Subscribers can change between previews. For a broadcast, the Worker checks the planned audience again before claiming and sending the request.

Use **Pause alert sending** to stop cron alerts, dashboard sends, broadcasts, and the canary. The dashboard writes a primary D1 stop before updating KV. Workers check the stop before provider dispatch and between groups. On resume, cached KV pause values can take a minute or longer to clear. Already submitted requests cannot be recalled. Cron still updates public data and records county transitions while alerts are paused. Skipped alerts are not replayed. Confirmation emails sent at signup remain available. [Cloudflare KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/#consistency)

## Daily push check

It is off by default. To enable it, set `PUSH_CANARY_ENABLED` to `"true"` in the target Worker’s Wrangler variables and deploy. `PUSH_CANARY_FIPS` defaults to Tulsa County (`40143`). Select that FIPS, check **Receive the daily push check**, and register the browser. At 17:17 UTC the Worker submits one push per opted-in device that follows that county. If more than eight devices qualify, the Worker records a blocked run. To opt out, register the same browser again with the checkbox clear. Repeat registration if the public site changes that device’s followed counties and removes the canary county.

## What the checks cover

- A dry-run exercises county and consent filters, provider availability checks, and bulletin composition. It skips encryption and outbound provider requests. The live log records masked recipients and provider results from sends, with summary entries for previews.
- A simulation exercises the deployed notifier and chosen recipients. It bypasses feed polling, source freshness decisions, and cron’s status diff. The daily push check exercises scheduling and push submission for dedicated devices.
- **Accepted** means the provider took the request. Verify inbox placement and device rendering directly. The dashboard does not ingest delivery webhooks. Push provider response URLs can be capabilities, so they are omitted from the log.
- Each send is claimed before provider submission. After a timeout or an unfinished run, check the delivery log and provider before trying again. A stopped invocation can leave outcomes unknown. Failed sends are not automatically retried.
- Normal cron fan-out still runs within a single invocation. Larger subscriber populations should be verified against Cloudflare’s Free limits and the Resend account quota. Local tests do not measure production CPU or a provider’s real-world delivery. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits)
