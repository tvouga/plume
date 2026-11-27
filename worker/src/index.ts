import { AuthError, authenticate } from './auth'
import { cors, json, type Env } from './env'
import { atlasNow, forgetAtlas, getAtlas, refreshAtlas } from './notion'
import {
  completeConnect,
  connectUrl,
  disconnect,
  getConnection,
  sessionFor,
  NotionSession,
  type Connection,
} from './notionAuth'
import { triage, type TriageInput } from './triage'
import { deepen, type DeepenInput } from './deepen'

/** Back to Plume after Notion's consent screen, with the outcome in the query. */
function backToPlume(env: Env, params: Record<string, string>): Response {
  const url = new URL(env.ALLOWED_ORIGIN || 'http://localhost:5173')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return Response.redirect(url.toString(), 302)
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
    if (url.pathname === '/health') return json({ ok: true }, env)

    // Notion redirects the browser here. It carries no Microsoft token: the
    // signed `state` is what proves which Plume user started the flow.
    if (url.pathname === '/api/notion/callback') {
      const error = url.searchParams.get('error')
      if (error) return backToPlume(env, { notion: 'cancelled', reason: error })
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !state) return backToPlume(env, { notion: 'error', reason: 'missing_code' })
      try {
        await completeConnect(env, req, code, state)
        return backToPlume(env, { notion: 'connected' })
      } catch (err) {
        console.error('[notion] connect failed', err)
        return backToPlume(env, { notion: 'error', reason: (err as Error).message.slice(0, 120) })
      }
    }

    let identity
    try {
      identity = await authenticate(req, env)
    } catch (err) {
      const status = err instanceof AuthError ? 401 : 500
      return json({ error: (err as Error).message }, env, status)
    }

    try {
      // ------------------------------------------------ Notion connection
      if (url.pathname === '/api/notion/status') {
        const conn = await getConnection(env, identity.id)
        return json(conn ? publicView(conn) : { connected: false }, env)
      }

      if (url.pathname === '/api/notion/connect' && req.method === 'POST') {
        const missing = (['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET', 'STATE_SECRET'] as const)
          .filter((k) => !env[k])
        if (missing.length) {
          return json({ error: `Notion isn't configured on the worker yet — set ${missing.join(', ')}` }, env, 503)
        }
        return json({ url: await connectUrl(env, req, identity.id) }, env)
      }

      if (url.pathname === '/api/notion/disconnect' && req.method === 'POST') {
        await disconnect(env, identity.id)
        forgetAtlas(identity.id)
        return json({ connected: false }, env)
      }

      // ------------------------------------------------------------ agent
      const session = await sessionFor(env, identity.id)

      if (url.pathname === '/api/agent/atlas') {
        if (!session) return json({ fetchedAt: new Date().toISOString(), entries: [] }, env)
        return json(await getAtlas(env, session), env)
      }

      if (url.pathname === '/api/agent/triage' && req.method === 'POST') {
        const { inputs } = (await req.json()) as { inputs: TriageInput[] }
        if (!Array.isArray(inputs) || inputs.length === 0) return json([], env)
        // Notion must never hold triage up: use whatever map is cached and
        // rebuild it in the background. Mail without Notion context beats waiting.
        const atlas = session
          ? await atlasNow(env, session, (p) => ctx.waitUntil(p)).catch(() => null)
          : null
        return json(await triageOnce(env, identity.id, inputs.slice(0, 50), atlas, identity.upn), env)
      }

      if (url.pathname === '/api/agent/deepen' && req.method === 'POST') {
        const input = (await req.json()) as DeepenInput
        const atlas = session
          ? await atlasNow(env, session, (p) => ctx.waitUntil(p)).catch(() => null)
          : null
        return json(await deepen(env, input, atlas, session), env)
      }

      if (url.pathname === '/api/agent/atlas/refresh' && req.method === 'POST') {
        if (!session) return json({ error: 'Notion is not connected' }, env, 409)
        ctx.waitUntil(refreshAtlas(env, session))
        return json({ started: true }, env, 202)
      }

      return json({ error: 'Not found' }, env, 404)
    } catch (err) {
      console.error('[worker]', err)
      return json({ error: (err as Error).message }, env, 500)
    }
  },

  /** Nightly: rebuild every connected user's map before they open the app. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const { keys } = await env.ATLAS.list({ prefix: 'notion:' })
        for (const { name } of keys) {
          const userId = name.slice('notion:'.length)
          const conn = await env.ATLAS.get<Connection>(name, 'json')
          if (!conn) continue
          try {
            const atlas = await refreshAtlas(env, new NotionSession(env, userId, conn))
            console.log(`[atlas] ${userId}: ${atlas.entries.length} entries`)
          } catch (e) {
            console.error(`[atlas] ${userId} refresh failed`, e)
          }
        }
      })(),
    )
  },
}

/**
 * Each verdict is paid for once. A conversation's hash only changes when the
 * thread does, so a reload, a second device or a retried batch gets the
 * stored verdict back instead of another model call.
 */
const VERDICT_TTL_S = 14 * 24 * 3600

async function triageOnce(
  env: Env,
  userId: string,
  inputs: TriageInput[],
  atlas: Parameters<typeof triage>[2],
  upn: string,
): Promise<unknown[]> {
  const key = (i: TriageInput) => `verdict:${userId}:${i.hash}`
  const cached = await Promise.all(inputs.map((i) => env.ATLAS.get(key(i), 'json')))
  const misses = inputs.filter((_, k) => cached[k] === null)
  const fresh = misses.length ? await triage(env, misses, atlas, upn) : []
  await Promise.all(
    misses.map((i, k) =>
      fresh[k] ? env.ATLAS.put(key(i), JSON.stringify(fresh[k]), { expirationTtl: VERDICT_TTL_S }) : null,
    ),
  )
  let m = 0
  return inputs.map((_, k) => cached[k] ?? fresh[m++])
}

/** What the browser may know about a connection — never the tokens. */
function publicView(conn: Connection) {
  return {
    connected: true,
    workspaceName: conn.workspaceName,
    notionUser: conn.notionUser,
    connectedAt: conn.connectedAt,
  }
}
