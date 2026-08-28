import { AuthError, authenticate } from './auth'
import { cors, json, type Env } from './env'
import { getAtlas, refreshAtlas } from './notion'
import { triage, type TriageInput } from './triage'
import { deepen, type DeepenInput } from './deepen'

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
    if (url.pathname === '/health') return json({ ok: true }, env)

    let identity
    try {
      identity = await authenticate(req, env)
    } catch (err) {
      const status = err instanceof AuthError ? 401 : 500
      return json({ error: (err as Error).message }, env, status)
    }

    try {
      if (url.pathname === '/api/agent/atlas') {
        return json(await getAtlas(env), env)
      }

      if (url.pathname === '/api/agent/triage' && req.method === 'POST') {
        const { inputs } = (await req.json()) as { inputs: TriageInput[] }
        if (!Array.isArray(inputs) || inputs.length === 0) return json([], env)
        // The Atlas must never take triage down — mail without Notion context
        // is still far better than no brief at all.
        const atlas = await getAtlas(env).catch(() => null)
        return json(await triage(env, inputs.slice(0, 50), atlas, identity.upn), env)
      }

      if (url.pathname === '/api/agent/deepen' && req.method === 'POST') {
        const input = (await req.json()) as DeepenInput
        const atlas = await getAtlas(env).catch(() => null)
        return json(await deepen(env, input, atlas), env)
      }

      if (url.pathname === '/api/agent/atlas/refresh' && req.method === 'POST') {
        ctx.waitUntil(refreshAtlas(env))
        return json({ started: true }, env, 202)
      }

      return json({ error: 'Not found' }, env, 404)
    } catch (err) {
      console.error('[worker]', err)
      return json({ error: (err as Error).message }, env, 500)
    }
  },

  /** Nightly: rebuild the map of the workspace before anyone opens the app. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      refreshAtlas(env).then(
        (a) => console.log(`[atlas] refreshed ${a.entries.length} entries`),
        (e) => console.error('[atlas] refresh failed', e),
      ),
    )
  },
}
