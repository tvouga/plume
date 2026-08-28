export interface Env {
  ATLAS: KVNamespace
  ANTHROPIC_API_KEY: string
  NOTION_TOKEN: string
  ALLOWED_UPNS: string
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
