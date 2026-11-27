export interface Env {
  /**
   * Per-user Notion connections and their Atlases. Declared in wrangler.toml
   * without an id: Wrangler provisions it on the first deploy.
   */
  ATLAS: KVNamespace
  ANTHROPIC_API_KEY: string
  /** From the Notion OAuth connection's settings page. */
  NOTION_CLIENT_ID: string
  NOTION_CLIENT_SECRET: string
  /** Any long random string. Signs the OAuth state so a callback can't be forged. */
  STATE_SECRET: string
  /** Set in the dashboard. Absent means nobody is allowed in. */
  ALLOWED_UPNS?: string
  ALLOWED_ORIGIN: string
  TRIAGE_MODEL: string
  DEEPEN_MODEL: string
}

export function cors(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function json(body: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env) },
  })
}
