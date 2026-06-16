const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export class GraphError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GraphError'
    this.status = status
  }
}

type TokenFn = () => Promise<string>

/**
 * Thin wrapper around the Graph REST API. We deliberately avoid the heavy
 * @microsoft/microsoft-graph-client SDK and just speak fetch + JSON.
 */
export function createGraph(getToken: TokenFn) {
  async function request<T>(
    path: string,
    init: RequestInit & { raw?: boolean } = {},
  ): Promise<T> {
    const token = await getToken()
    const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })

    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body?.error?.message ?? detail
      } catch {
        /* non-JSON error body */
      }
      throw new GraphError(res.status, detail)
    }

    // 202/204 (e.g. sendMail, move) have no body.
    if (res.status === 204 || res.status === 202) return undefined as T
    const text = await res.text()
    return text ? (JSON.parse(text) as T) : (undefined as T)
  }

  return {
    /** The raw bearer token, for endpoints we must fetch by hand (e.g. photo blob). */
    token: getToken,
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
    del: (path: string) => request<void>(path, { method: 'DELETE' }),
  }
}

export type GraphClient = ReturnType<typeof createGraph>
