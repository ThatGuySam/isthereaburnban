# Source monitor: false "missed two checks" alerts for new sources

This note is the place to start for the Nov 26 SD "Source pipeline alert" emails and the monitor fix that followed.

Parked: 2026-11-27

## Where things stand

On 2026-11-26 at 07:22 UTC, three "Source pipeline alert for SD" emails said sources such as `sd-spink-ema` had missed two scheduled checks. They were false alarms. The SD county bulletins had been committed at 06:22 UTC (`d0626c9`) and deployed before their first scheduled poll. For a source with no check history, the monitor measured the grace period from the monitor's own first run, not from when that source appeared. Commit `5866078` on `v2-cloudflare` adds a `source_first_seen` table and measures the grace period per source. Sam applied the migration and deployed (Worker version `5dd3cf43-95fc-49f4-8b7b-da6924004ba9`) on 2026-11-27 around 17:46 UTC. Checks kept running after the deploy (the newest check was at 18:08 UTC in `/api/v1/coverage`). All four SD county bulletins reported `ok: true` that day.

## Read next

- [`src/worker/sources/monitor.ts`](../../src/worker/sources/monitor.ts): `runSourceMonitor`, which decides overdue and roster incidents.
- [`migrations/0009_source_first_seen.sql`](../../migrations/0009_source_first_seen.sql): the per-source first-seen table.
- [`src/worker/sources/queue.test.ts`](../../src/worker/sources/queue.test.ts): the test "a newly added source is not overdue before its own first two slots".
- [`docs/ops-dashboard.md`](../ops-dashboard.md): release order (apply migrations before `bun run deploy`).

## Threads

- **Fix the SD source pipeline alert** (Claude Code, `fa433660-73e7-54af-bdcb-d2497e40eee6`): diagnosis from the alert email, the Gmail alert timing, and the public coverage API.

## Not written down elsewhere

- The old `source_monitor` table (migration 0006) is no longer read. It was left in place so that a Worker still running the old code could not fail after the migration. A later migration can drop it.
- On the first run after the deploy, every existing full-mode source got `first_seen` set to that run's time. For one deploy, a source that had never been checked gets a one-time grace period of two slots.
- The agent session was not allowed to run remote D1 queries or migrations. Sam ran the migration and deploy by hand.

## Next

1. Confirm in the private dashboard's Source pipeline section that no monitor errors appeared after 2026-11-27 17:46 UTC. The public API cannot show whether the monitor itself fails.
2. Separate open problem: `ia-cedar-ema`, `ia-decatur-ema`, `ia-mills-ema` and `ia-pottawattamie-ema` report "full source missing 98 counties" (as of 2026-11-27). They look like single-county sources set up as statewide (`mode: "full"`) ones. They sent five IA alerts on Nov 25.
