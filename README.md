# 🪶 Plume

A calm, WhatsApp-simple email client for your **Microsoft 365 / work email**.
No folders-first clutter, no ribbon — your mail is a stream of conversations,
and replying feels like sending a chat message.

Plume talks **directly to Microsoft** from your browser. Your mail never passes
through any third-party server — there's no backend.

---

## What it does

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
| `Mail.ReadWrite`| read mail, mark read, archive                  |
| `Mail.Send`     | send and reply                                 |
| `offline_access`| stay signed in without re-prompting            |

---

## Tech

Vite · React · TypeScript · MSAL (OAuth2 PKCE) · Microsoft Graph REST ·
TanStack Query · Tailwind CSS · DOMPurify.

```
src/
  auth/        Microsoft sign-in (MSAL config + React context)
  graph/       Microsoft Graph client, mail API, types
  data/        TanStack Query hooks bound to the signed-in user
  components/   UI (login, list, chat-style thread, composer)
  lib/         formatting + HTML sanitizing helpers
```

## Scripts

```bash
npm run dev      # local dev server
npm run build    # type-check + production build
npm run preview  # serve the production build
```

## Roadmap ideas

- Attachments (view + send)
- Push notifications (Graph subscriptions) and PWA install
- Snooze, swipe gestures on mobile, keyboard shortcuts
- Dark mode

## License

MIT © 2026 Tristan Vouga — see [LICENSE](LICENSE).
