import type { Env } from './env'

/**
 * Per-user Notion access over OAuth.
 *
 * Each Plume user connects their own Notion account, so a token can only ever
 * see pages that person already has access to — and only the ones they tick
 * in Notion's consent picker. There is deliberately no shared workspace token:
 * one would let every user's triage read everything it was connected to.
 */

const NOTION = 'https://api.notion.com/v1'
/** The OAuth endpoints only accept this version. */
const OAUTH_VERSION = '2026-03-11'
/** Data endpoints stay on the version whose response shapes the Atlas reads. */
export const DATA_VERSION = '2022-06-28'

const STATE_TTL_MS = 10 * 60_000

export interface Connection {
  accessToken: string
  refreshToken: string | null
  workspaceId: string
  workspaceName: string | null
  /** Who authorised it in Notion — shown back to the user so they can tell. */
  notionUser: string | null
  connectedAt: string
}

const connKey = (userId: string) => `notion:${userId}`

/** Where Notion sends the user back. Derived, so there is nothing to configure. */
export function redirectUri(req: Request): string {
  return `${new URL(req.url).origin}/api/notion/callback`
}

// ---------------------------------------------------------------- state ----

/**
 * The callback is a plain browser redirect from Notion, so it carries no
 * Microsoft token. The signed state is the only thing tying the returned code
 * to the Plume user who started the flow — it must be unforgeable and short-lived.
 */
async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return b64url(new Uint8Array(sig))
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function signState(env: Env, userId: string): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)))
  const body = `${userId}.${Date.now() + STATE_TTL_MS}.${nonce}`
  return `${body}.${await hmac(env.STATE_SECRET, body)}`
}

async function verifyState(env: Env, state: string): Promise<string> {
  const parts = state.split('.')
  if (parts.length !== 4) throw new Error('Malformed state')
  const [userId, expires, nonce, sig] = parts
  const expected = await hmac(env.STATE_SECRET, `${userId}.${expires}.${nonce}`)
  if (!timingSafeEqual(sig, expected)) throw new Error('State signature does not match')
  if (Date.now() > Number(expires)) throw new Error('Connection link expired — start again from Plume')
  return userId
}

// ----------------------------------------------------------------- flow ----

export async function connectUrl(env: Env, req: Request, userId: string): Promise<string> {
  const url = new URL(`${NOTION}/oauth/authorize`)
  url.searchParams.set('client_id', env.NOTION_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('owner', 'user')
  url.searchParams.set('redirect_uri', redirectUri(req))
  url.searchParams.set('state', await signState(env, userId))
  return url.toString()
}

interface TokenResponse {
  access_token: string
  refresh_token: string | null
  workspace_id: string
  workspace_name: string | null
  owner?: { type: string; user?: { name?: string; person?: { email?: string } } }
}

async function tokenRequest(env: Env, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${NOTION}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/json',
      'Notion-Version': OAUTH_VERSION,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new OAuthError(res.status, detail.slice(0, 300))
  }
  return (await res.json()) as TokenResponse
}

export class OAuthError extends Error {
  readonly status: number
  constructor(status: number, detail: string) {
    super(`Notion OAuth ${status}: ${detail}`)
    this.status = status
  }
  get invalidGrant(): boolean {
    return this.status === 400 && this.message.includes('invalid_grant')
  }
}

function toConnection(t: TokenResponse, previous?: Connection): Connection {
  const user = t.owner?.user
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    workspaceId: t.workspace_id,
    workspaceName: t.workspace_name ?? previous?.workspaceName ?? null,
    notionUser: user?.person?.email ?? user?.name ?? previous?.notionUser ?? null,
    connectedAt: previous?.connectedAt ?? new Date().toISOString(),
  }
}

/** Exchange the code Notion handed back, and remember it against the Plume user. */
export async function completeConnect(env: Env, req: Request, code: string, state: string): Promise<Connection> {
  const userId = await verifyState(env, state)
  const token = await tokenRequest(env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(req),
  })
  const conn = toConnection(token)
  await env.ATLAS.put(connKey(userId), JSON.stringify(conn))
  // A new connection may see different pages — the old map is wrong now.
  await env.ATLAS.delete(`atlas:v1:${userId}`)
  return conn
}

export async function getConnection(env: Env, userId: string): Promise<Connection | null> {
  return env.ATLAS.get<Connection>(connKey(userId), 'json')
}

export async function disconnect(env: Env, userId: string): Promise<void> {
  await env.ATLAS.delete(connKey(userId))
  await env.ATLAS.delete(`atlas:v1:${userId}`)
}

// -------------------------------------------------------------- session ----

/**
 * A user's authenticated handle on Notion. Refreshes on 401.
 *
 * Notion rotates the refresh token on every refresh, so two isolates refreshing
 * at once would leave one holding a dead token. When a refresh comes back
 * invalid_grant we re-read the stored connection: if another isolate already
 * rotated it, we adopt its fresh access token rather than declaring the user
 * disconnected.
 */
export class NotionSession {
  private conn: Connection
  private readonly env: Env
  readonly userId: string

  constructor(env: Env, userId: string, conn: Connection) {
    this.env = env
    this.userId = userId
    this.conn = conn
  }

  async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res = await this.send(path, init)
    if (res.status === 401) {
      await this.refresh()
      res = await this.send(path, init)
    }
    if (!res.ok) {
      throw new Error(`Notion ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  private send(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${NOTION}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.conn.accessToken}`,
        'Notion-Version': DATA_VERSION,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  }

  private async refresh(): Promise<void> {
    if (!this.conn.refreshToken) throw new Error('Notion access expired — reconnect Notion in Plume')
    try {
      const token = await tokenRequest(this.env, {
        grant_type: 'refresh_token',
        refresh_token: this.conn.refreshToken,
      })
      this.conn = toConnection(token, this.conn)
      await this.env.ATLAS.put(connKey(this.userId), JSON.stringify(this.conn))
    } catch (err) {
      if (err instanceof OAuthError && err.invalidGrant) {
        const stored = await getConnection(this.env, this.userId)
        if (stored && stored.refreshToken !== this.conn.refreshToken) {
          this.conn = stored // another isolate won the race; use its token
          return
        }
        await disconnect(this.env, this.userId)
        throw new Error('Notion access was revoked — reconnect Notion in Plume')
      }
      throw err
    }
  }
}

export async function sessionFor(env: Env, userId: string): Promise<NotionSession | null> {
  const conn = await getConnection(env, userId)
  return conn ? new NotionSession(env, userId, conn) : null
}
