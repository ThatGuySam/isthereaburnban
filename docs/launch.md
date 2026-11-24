# Launch: discovery listings and cutover

This is the runbook for moving the Worker to isthereaburnban.com and listing it in directories. It covers what is already in the repo, what Sam does at cutover, and the exact commands for the MCP Registry, IndexNow and usage counts.

Written 2026-11-24 on branch `ui/launch-ready`. Recheck registry and directory rules before acting later. Background and venue ranking: [discovery venues memo](research/discovery-venues-2026-11-24.md).

## Already in the repo

| Item | Where |
| --- | --- |
| MCP tool `title` and annotations, server title, description, `websiteUrl`, icon, instructions | `src/worker/mcp.ts` (tests in `src/worker/mcp.test.ts`) |
| `/privacy/`, `/terms/`, `/data/` (Schema.org `Dataset`) | `src/pages/privacy/`, `src/pages/terms/`, `src/pages/data/` |
| Contact address used on those pages | `CONTACT_EMAIL` in `src/components/site-data.ts` (placeholder `hello@isthereaburnban.com`) |
| IndexNow key file and submitter | `public/9a1345d8dde8bcce30273012ff1c7d6c.txt`, `scripts/indexnow.ts`, `bun run indexnow` |
| MCP Registry record | `server.json` (schema `2025-12-11`, validated) |
| `text/plain` header for the registry auth file | `public/_headers` |
| Usage counts (Workers Analytics Engine) | `src/worker/usage.ts`, binding `USAGE` in `wrangler.jsonc` |

Not in the repo, on purpose: `public/.well-known/mcp-registry-auth`. It holds the public half of a key that only Sam should create. Step 3 below adds it.

## Cutover, in order

`[Sam]` needs his accounts or approval. `[agent]` can run once Sam says go.

1. `[Sam]` Confirm the contact mailbox. If `hello@isthereaburnban.com` is not the right address, change `CONTACT_EMAIL` and rebuild. Read `/privacy/` and `/terms/` once; they are plain statements, not lawyer-reviewed.
2. `[agent]` In `wrangler.jsonc`, set `SITE_URL` to `https://isthereaburnban.com`. Decide whether the Worker keeps the name `isthereaburnban-preview` or gets a production name.
3. `[Sam]` Create the registry key and add the auth file (next section). Commit `public/.well-known/mcp-registry-auth`.
4. `[Sam]` Deploy, then in Cloudflare: route isthereaburnban.com to the Worker, turn on Web Analytics if wanted, and in AI Crawl Control check that OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User and PerplexityBot are Allowed. The Analytics Engine dataset `isthereaburnban_usage` is created by the first write after deploy; nothing to set up.
5. `[agent]` Verify the live site:

   ```sh
   curl -sI https://isthereaburnban.com/privacy/ | head -1
   curl -s https://isthereaburnban.com/9a1345d8dde8bcce30273012ff1c7d6c.txt
   curl -sS -H 'Accept: text/plain' -A 'mcp-registry/1.0' -w '\n%{http_code}\n' https://isthereaburnban.com/.well-known/mcp-registry-auth
   curl -s https://isthereaburnban.com/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

   The auth file must return `200` with the `v=MCPv1; ...` line and no redirect. The registry fetches it from Google Cloud addresses, so a WAF or bot rule on that path will make login fail with `401`.
6. `[agent, Sam confirms]` Publish to the MCP Registry (below).
7. `[agent]` `bun run build && bun run indexnow --send`. A `403 SiteVerificationNotCompleted` right after deploy is normal; retry in a few minutes.
8. `[Sam]` Google Search Console: Domain property, submit `https://isthereaburnban.com/sitemap.xml`. Bing Webmaster Tools: import from Search Console. Rich Results Test on `/data/`.
9. `[Sam]` Anthropic Connectors Directory: [claude.ai/directory/manage](https://claude.ai/directory/manage) → Submit new → MCP connector. Test it as a custom connector in Claude first. Docs URL `https://isthereaburnban.com/developers/`, privacy URL `https://isthereaburnban.com/privacy/`, support contact the mailbox from step 1, icon `public/icons/icon-512.png`, auth "none", data handling "third party's API you don't control".

## MCP Registry key and publish

This mirrors how `com.samcarlton.ecosystem/tulsa-ecosystem-map` was published (HTTP domain auth, raw API, no `mcp-publisher` binary). Needs OpenSSL 3. The private key never enters the repo.

Create the key once:

```sh
mkdir -p ~/.config/mcp-registry && chmod 700 ~/.config/mcp-registry
openssl genpkey -algorithm Ed25519 -out ~/.config/mcp-registry/isthereaburnban-ed25519.pem
chmod 600 ~/.config/mcp-registry/isthereaburnban-ed25519.pem
```

Write the public key line into the site (from the repo root):

```sh
mkdir -p public/.well-known
PUB="$(openssl pkey -in ~/.config/mcp-registry/isthereaburnban-ed25519.pem -pubout -outform DER | tail -c 32 | base64)"
echo "v=MCPv1; k=ed25519; p=${PUB}" > public/.well-known/mcp-registry-auth
cat public/.well-known/mcp-registry-auth
```

Commit that file, build and deploy, and check it with the `curl` in cutover step 5.

Log in (a signed RFC 3339 timestamp, hex signature) and publish:

```sh
KEY=~/.config/mcp-registry/isthereaburnban-ed25519.pem
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TSF="$(mktemp)"; printf %s "$TS" > "$TSF"   # Ed25519 one-shot signing can't read a pipe
SIG="$(openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$TSF" | od -An -v -tx1 | tr -d ' \n')"; rm -f "$TSF"
TOKEN="$(curl -sS https://registry.modelcontextprotocol.io/v0/auth/http \
  -H 'content-type: application/json' \
  -d "{\"domain\":\"isthereaburnban.com\",\"timestamp\":\"$TS\",\"signed_timestamp\":\"$SIG\"}" | jq -r .registry_token)"
test -n "$TOKEN" && test "$TOKEN" != null || echo "login failed"

curl -sS https://registry.modelcontextprotocol.io/v0/publish \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  --data-binary @server.json
```

The token lasts about five minutes. Check the result at <https://registry.modelcontextprotocol.io/v0/servers?search=com.isthereaburnban>.

To publish a change later, bump `version` in `server.json` (and `SERVER_INFO.version` in `src/worker/mcp.ts` to match), then repeat the login and publish. `description` must stay at 100 characters or fewer.

## IndexNow

- `bun run indexnow`: dry run. Prints the JSON payload for every sitemap URL (core pages, state hubs, counties, cities) and sends nothing.
- `bun run indexnow --core`: only the 100 or so core URLs.
- `bun run indexnow --send`: posts to `https://api.indexnow.org/indexnow` in batches of up to 10,000.

Run `bun run build` first so city pages are included. The key is `9a1345d8dde8bcce30273012ff1c7d6c`, served at `/9a1345d8dde8bcce30273012ff1c7d6c.txt`. Keep exactly one key file in `public/`; the script refuses to run otherwise.

## Usage counts

Every `/api/*` and `/mcp` request (except CORS preflight) writes one Analytics Engine data point. Free plan: 100,000 writes and 10,000 read queries a day; data is kept three months (Cloudflare docs, checked 2026-11-24). Nothing identifying is stored: no IP, no user agent string, no query values.

| Column | Value |
| --- | --- |
| `blob1` | `api` or `mcp` |
| `blob2` | route template, e.g. `/api/v1/status`, `/api/v1/counties/:fips`, `/mcp`, `/api/other` |
| `blob3` | MCP JSON-RPC method (`initialize`, `tools/list`, `tools/call`) |
| `blob4` | MCP tool name for `tools/call` |
| `blob5` | `json`, `text` or `mcp` |
| `blob6` | HTTP status |
| `blob7` | country from `request.cf.country` |
| `blob8` | `browser`, `bot`, `agent`, `script` or `other` |
| `double1` | always 1 |

Reading the counts needs a Cloudflare API token with **Account Analytics Read** (Sam creates it; it is not stored in the Worker). The ops dashboard does not show these counts, because the Worker would need that token as a secret.

```sh
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" \
  --data "SELECT blob1 AS surface, blob2 AS route, blob4 AS tool, blob8 AS client, SUM(_sample_interval) AS requests
          FROM isthereaburnban_usage
          WHERE timestamp > NOW() - INTERVAL '7' DAY
          GROUP BY surface, route, tool, client
          ORDER BY requests DESC
          LIMIT 50"
```

MCP tool calls per day:

```sql
SELECT toStartOfDay(timestamp) AS day, blob4 AS tool, SUM(_sample_interval) AS calls
FROM isthereaburnban_usage
WHERE blob1 = 'mcp' AND blob3 = 'tools/call' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day, tool
ORDER BY day, tool
```

Use `SUM(_sample_interval)`, not `COUNT()`: Analytics Engine samples at high volume.
