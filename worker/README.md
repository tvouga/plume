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

```bash
cd worker
npm install
npx wrangler kv namespace create ATLAS     # paste the id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put NOTION_TOKEN
```

Then edit `wrangler.toml`:

- `ALLOWED_UPNS` — your work email. **The worker refuses to start work with
  this empty**, because an unauthenticated proxy to your Anthropic key is a
  bill waiting to happen.
- `ALLOWED_ORIGIN` — where Plume is served from, e.g. `http://localhost:5173`.

```bash
npx wrangler deploy
```

Put the deployed URL in the app's `.env` as `VITE_AGENT_URL`.

### Notion access

Skip OAuth. Create an **internal integration** at
[notion.so/my-integrations](https://www.notion.so/my-integrations), copy the
`ntn_…` token, and click **Connect** on the handful of top-level pages you want
Plume to read. This gives sharper scoping than OAuth would, because Notion
grants per page rather than per workspace.

The integration only ever needs **read** capabilities. Nothing here writes.

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
| `GET /api/agent/atlas` | The cached Notion map. |
| `POST /api/agent/atlas/refresh` | Rebuild it now. |
| cron `0 5 * * *` | Rebuilds it nightly, before you open the app. |

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
