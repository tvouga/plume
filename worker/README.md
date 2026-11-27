# Plume agent worker

The one piece of server that Plume genuinely needs, and no more.

## Why it exists

Two of the three things Plume talks to can be reached straight from the
browser. One cannot:

| Service | From the browser? | |
| --- | --- | --- |
| Microsoft Graph | **yes** | MSAL PKCE, no secret. Mail never leaves this path. |
| Anthropic | yes, technically | `access-control-allow-origin: *`, but the API key would ship in the bundle. |
| Notion | **no** | The API returns no CORS headers at all and doesn't answer a preflight. There is no browser path. |

Notion also has no PKCE public-client flow — its token exchange is HTTP Basic
with a `client_secret` — so a "Sign in with Notion" button cannot work the way
the Microsoft button does. Hence: one small worker, holding two secrets.

**Your mail still never passes through this worker.** It only ever sees the
message metadata needed for triage, and it talks to Notion and Anthropic.

## Setup

No command line needed — everything is in two dashboards.

**1. Deploy the worker.** Cloudflare → Workers & Pages → Create → Worker →
Connect to Git → this repo, **root directory `worker`**. Its KV namespace is
created automatically on this first deploy. Note the worker's URL.

**2. Create the Notion connection.** [notion.so/profile/integrations](https://www.notion.so/profile/integrations)
→ New connection → **OAuth**.
- Installable in: your workspace only.
- Redirect URI: `<worker URL>/api/notion/callback`

Copy its client ID and client secret.

**3. Set the worker's variables** (Settings → Variables and Secrets):

| | name | value |
| --- | --- | --- |
| Secret | `ANTHROPIC_API_KEY` | your Anthropic key |
| Secret | `NOTION_CLIENT_ID` | from step 2 |
| Secret | `NOTION_CLIENT_SECRET` | from step 2 |
| Secret | `STATE_SECRET` | any long random string |
| Text | `ALLOWED_UPNS` | comma-separated work emails allowed in |

`ALLOWED_UPNS` lives only in the dashboard, never in `wrangler.toml` — it names
real people, and `keep_vars` stops deploys from resetting it. **Until it is
set, the worker refuses every request.**

**4. Point Plume at it.** In the Pages project, set `VITE_AGENT_URL` to the
worker URL and redeploy — the value is baked in at build time.

**5. Connect.** Open Plume; a *Connect Notion* card appears. Each person
connects their own account and picks their own pages.

## Who sees what in Notion

Each Plume user connects **their own** Notion account. Notion's consent screen
only offers pages that person already has full access to, and the token can
see only the ones they tick. Their Notion map is built from that token and
cached under their own identity.

So a teammate's Plume can never ground a draft in your board notes unless
they could already open the board notes themselves. There is deliberately no
shared workspace token: one would let everyone's triage read whatever it was
connected to.

Notion rotates refresh tokens on every refresh. When two requests race to
refresh, the loser re-reads the stored connection and adopts the winner's
token rather than logging the user out.

## How it authenticates you

The worker doesn't validate the Microsoft JWT's signature itself — it *spends*
the token: a token Graph accepts as `/me` is by definition real, and the
identity Graph returns is what gets checked against `ALLOWED_UPNS`. One extra
request, no JWKS cache to get wrong, no key material. Results are cached for
five minutes.

## Endpoints

| Route | Does |
| --- | --- |
| `POST /api/agent/triage` | Batch verdicts for up to 50 conversations. |
| `POST /api/agent/deepen` | Agentic pass on one thread: reads Notion, returns a grounded draft. |
| `GET /api/agent/atlas` | The caller's own cached Notion map. |
| `GET /api/notion/status` | Whether the caller has connected Notion. Never returns tokens. |
| `POST /api/notion/connect` | Signed consent URL for the caller. |
| `GET /api/notion/callback` | Where Notion returns. Authenticated by the signed state, not a Microsoft token. |
| `POST /api/notion/disconnect` | Forget the caller's Notion token and map. |
| `POST /api/agent/atlas/refresh` | Rebuild it now. |
| cron `0 5 * * *` | Rebuilds every connected user's map overnight. |

## The Notion Atlas

Rather than embedding the workspace, the worker **maps** it: one crawl stores
id, title, type, status, and any people and email addresses found on each page
— metadata, never bodies. It's small enough to sit in a single prompt-cached
block, so the model gets a map of your world on every triage call for
approximately nothing, and only fetches the one or two pages it actually needs.

Sender addresses are matched against those emails by exact string before the
model is asked to judge anything. That's what makes "this belongs to Q3
Pricing" reliable rather than plausible.

## Cost

Both passes default to `claude-opus-5`, with triage pinned to
`effort: "low"` — classification doesn't need depth. If you'd rather trade some
accuracy for cost on the cheap pass, set `TRIAGE_MODEL = "claude-haiku-4-5"` in
`wrangler.toml`. Verdicts are cached on the messages themselves, so a
conversation is only ever triaged once.
