# 🪶 Plume

A calm, WhatsApp-simple email client for your **Microsoft 365 / work email**.
No folders-first clutter, no ribbon — your mail is a stream of conversations,
and replying feels like sending a chat message.

Plume talks **directly to Microsoft** from your browser. Your mail never passes
through any third-party server.

On top of the mailbox sits an optional **agent layer**: two derived surfaces
that read every message against your Notion workspace and tell you what
actually needs you today.

---

## What it does

### The agent surfaces

- **Brief** — obligations, not messages. Each card's headline is *what someone
  needs from you*; the email is evidence underneath it. Grouped into what needs
  you, what you're owed, what's moving per Notion project, and what was handled
  without you.
- **Runway** — today as a strip of time. Things you owe sit above the line at
  the hour they come due, tethered to the meeting they'd wreck; things you're
  owed sit below, as bars that grow the longer they go unanswered. Ends with a
  plain forecast: *if you do nothing, here's what breaks.*
- **A ledger of promises, both directions** — what you promised, and what you're
  owed. The second one is the ball that actually drops: you replied, they went
  quiet six days ago, and no inbox anywhere will tell you that.
- **Nothing sends itself.** Drafts are staged; one tap to send, never zero.

Both run without any AI configured — Plume falls back to local heuristics, so
the surfaces work on day one, just more bluntly and with no Notion context.
See [worker/README.md](worker/README.md) to turn on the real thing.

```bash
npm run dev      # then open http://localhost:5173/?demo
```

`/?demo` renders both surfaces against fixtures — no tenant, no Azure app, no
worker. Useful for working on the layouts.

### The mailbox

- **Inbox as conversations** — threads roll up like chats, newest first.
- **Chat-style threads** — messages as bubbles, your replies on the right.
- **Reply like texting** — pinned box at the bottom, Enter to send.
- **One-tap Archive / Flag / Done**, hover-to-archive in the list.
- **Compose** = a floating "new message" button.
- **Search**, **Inbox / Archive / Sent** views, unread badges.
- **Safe HTML** — every message body is sanitized before display.
- Auto-refreshes for new mail; works great on desktop and is mobile-ready.

---

## One-time setup (~3 minutes)

Plume needs a free Microsoft **app registration** so Microsoft trusts it to open
your mailbox. You do this once. There are **no secrets** to manage — it uses the
modern, browser-safe sign-in flow (PKCE).

### 1. Register the app

1. Open the [Azure / Entra App registrations page](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2. Click **New registration**.
3. Name it `Plume`.
4. Under **Supported account types**, choose
   **Accounts in this organizational directory only** (your company) — or a
   broader option if you prefer.
5. Under **Redirect URI**, select the **Single-page application (SPA)** platform
   and enter:
   ```
   http://localhost:5173
   ```
6. Click **Register**.

> When you later host Plume at a real URL, add that URL as another SPA redirect
> URI in the same place.

### 2. Copy your Client ID

On the app's **Overview** page, copy the **Application (client) ID**
(looks like `1234abcd-...`).

### 3. Tell Plume about it

```bash
cp .env.example .env
```

Open `.env` and paste your ID:

```
VITE_AZURE_CLIENT_ID=<paste-your-Application-client-ID-here>
VITE_AZURE_AUTHORITY=organizations
```

`VITE_AZURE_AUTHORITY` controls who can sign in:
| value           | who can sign in                          |
| --------------- | ---------------------------------------- |
| `organizations` | work / school accounts (recommended)     |
| `common`        | any Microsoft account, incl. personal    |
| `<tenant-id>`   | only your specific company               |

### 4. Run it

```bash
npm install
npm run dev
```

Open the printed URL, click **Sign in with Microsoft**, approve the permission
prompt once, and you're in.

> **If your company controls sign-ins:** the first time you sign in, Microsoft
> may say an admin needs to approve the app. Plume only ever asks for delegated
> permission to *your* mailbox (`Mail.ReadWrite`, `Mail.Send`, `User.Read`) —
> it can never act beyond the signed-in user. Send those scope names to your IT
> admin if they ask.

---

## Permissions Plume requests

All **delegated** — Plume only ever acts as you, never more:

| scope           | why                                            |
| --------------- | ---------------------------------------------- |
| `User.Read`     | your name and profile photo                    |
| `Mail.ReadWrite`| read mail, mark read, archive, store the ledger|
| `Mail.Send`     | send and reply                                 |
| `Calendars.Read`| the Runway tethers deadlines to real meetings  |
| `offline_access`| stay signed in without re-prompting            |

### Where the ledger lives

Triage verdicts, snoozes, extracted commitments and your "not important" calls
are stored **on the Outlook messages themselves**, as a named MAPI property
plus ordinary categories. That means they sync across your devices through the
Graph token you already hold, survive a reinstall, and show up in real Outlook
— and Plume needs no database of its own.

---

## Tech

Vite · React · TypeScript · MSAL (OAuth2 PKCE) · Microsoft Graph REST ·
TanStack Query · Tailwind CSS · DOMPurify.

```
src/
  auth/        Microsoft sign-in (MSAL config + React context)
  graph/       Microsoft Graph client, mail API, calendar, types
  data/        TanStack Query hooks bound to the signed-in user
  agent/       ledger, triage transport, selectors, heuristic fallback
  components/  UI (login, list, chat-style thread, composer)
    agent/     Brief, Runway, the shared obligation card
  dev/         the /?demo fixtures
  lib/         formatting + HTML sanitizing helpers
worker/        Cloudflare worker: Notion + Anthropic, and the two secrets
```

### Why a worker at all

Notion's API sends no CORS headers and has no PKCE public-client flow, so a
browser physically cannot reach it — that, and keeping the Anthropic key out of
the bundle, is the worker's entire job. Mail keeps going browser → Microsoft
directly. Details in [worker/README.md](worker/README.md).

## Scripts

```bash
npm run dev      # local dev server
npm run build    # type-check + production build
npm run preview  # serve the production build
```

## Roadmap ideas

- The deep pass wired to card expansion (the worker endpoint exists; the UI
  still shows the triage draft)
- An ask bar across mail + Notion
- Learning from "not important" — the verdicts are stored, nothing reads them
  back into the prompt yet
- Attachments (view + send)
- Push notifications (Graph subscriptions) and PWA install
- Snooze, swipe gestures on mobile, keyboard shortcuts
- Dark mode

## License

MIT © 2026 Tristan Vouga — see [LICENSE](LICENSE).
