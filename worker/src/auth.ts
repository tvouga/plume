import type { Env } from './env'

/**
 * The worker holds two secrets that cost real money, so it must never be an
 * open proxy. We don't validate the Microsoft JWT's signature ourselves —
 * we simply spend it: a token that Graph accepts as /me is, by definition,
 * a real token, and the identity it returns is the one to check against the
 * allowlist. One extra request, no key material, no JWKS cache to get wrong.
 */
interface Identity {
  id: string
  upn: string
}

const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; identity: Identity }>()

export async function authenticate(req: Request, env: Env): Promise<Identity> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new AuthError('Missing bearer token')

  const hit = cache.get(token)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.identity

  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new AuthError('Microsoft rejected the token')

  const me = (await res.json()) as { id: string; mail?: string; userPrincipalName: string }
  const upn = (me.mail || me.userPrincipalName || '').toLowerCase()

  const allowed = env.ALLOWED_UPNS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (allowed.length === 0) {
    throw new AuthError('Worker has no ALLOWED_UPNS configured — refusing to run open')
  }
  if (!allowed.includes(upn)) throw new AuthError(`${upn} is not on this worker's allowlist`)

  const identity = { id: me.id, upn }
  cache.set(token, { at: Date.now(), identity })
  return identity
}

export class AuthError extends Error {}
