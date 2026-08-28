import type { Env } from './env'

const NOTION = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

/**
 * Notion sends no CORS headers and doesn't answer a preflight, so every call
 * has to originate server-side. This is the only reason the worker exists.
 */
async function notion<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${NOTION}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Notion ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export interface AtlasEntry {
  id: string
  title: string
  type: 'page' | 'database'
  url: string
  parentTitle?: string
  status?: string
  emails: string[]
  people: string[]
  lastEdited: string
}

export interface Atlas {
  fetchedAt: string
  entries: AtlasEntry[]
}

type NotionValue = Record<string, unknown>

function plainText(rich: unknown): string {
  if (!Array.isArray(rich)) return ''
  return rich
    .map((r) => (r && typeof r === 'object' ? String((r as NotionValue).plain_text ?? '') : ''))
    .join('')
    .trim()
}

/** Title lives in a different place for pages and databases. */
function titleOf(obj: NotionValue): string {
  if (obj.object === 'database') return plainText(obj.title) || 'Untitled database'
  const props = (obj.properties ?? {}) as Record<string, NotionValue>
  for (const value of Object.values(props)) {
    if (value?.type === 'title') return plainText(value.title) || 'Untitled'
  }
  return 'Untitled'
}

/**
 * The join keys. Deterministic string matching against these is what makes
 * "this email belongs to Q3 Pricing" reliable rather than plausible — the
 * model only arbitrates when this comes back empty or ambiguous.
 */
function contactsOf(obj: NotionValue): { emails: string[]; people: string[] } {
  const emails = new Set<string>()
  const people = new Set<string>()
  const props = (obj.properties ?? {}) as Record<string, NotionValue>
  for (const value of Object.values(props)) {
    if (!value || typeof value !== 'object') continue
    if (value.type === 'email' && typeof value.email === 'string') emails.add(value.email.toLowerCase())
    if (value.type === 'people' && Array.isArray(value.people)) {
      for (const p of value.people as NotionValue[]) {
        const person = p.person as NotionValue | undefined
        if (typeof person?.email === 'string') emails.add(person.email.toLowerCase())
        if (typeof p.name === 'string') people.add(p.name)
      }
    }
    if (value.type === 'rich_text') {
      const text = plainText(value.rich_text)
      for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) emails.add(m[0].toLowerCase())
    }
  }
  return { emails: [...emails], people: [...people] }
}

function statusOf(obj: NotionValue): string | undefined {
  const props = (obj.properties ?? {}) as Record<string, NotionValue>
  for (const value of Object.values(props)) {
    if (value?.type === 'status' && value.status) return String((value.status as NotionValue).name ?? '')
    if (value?.type === 'select' && value.select) return String((value.select as NotionValue).name ?? '')
  }
  return undefined
}

/**
 * Crawl every page and database the integration can see, keeping metadata
 * only — never page bodies. A large workspace lands in a few hundred KB,
 * which fits in one prompt-cached block.
 */
export async function buildAtlas(env: Env): Promise<Atlas> {
  const entries: AtlasEntry[] = []
  let cursor: string | undefined
  // Bounded so a huge workspace can't run the cron past its wall clock.
  for (let page = 0; page < 20; page++) {
    const body: Record<string, unknown> = {
      page_size: 100,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    }
    if (cursor) body.start_cursor = cursor

    const data = await notion<{
      results: NotionValue[]
      next_cursor: string | null
      has_more: boolean
    }>(env, '/search', { method: 'POST', body: JSON.stringify(body) })

    for (const obj of data.results) {
      const { emails, people } = contactsOf(obj)
      const parent = obj.parent as NotionValue | undefined
      entries.push({
        id: String(obj.id),
        title: titleOf(obj),
        type: obj.object === 'database' ? 'database' : 'page',
        url: String(obj.url ?? ''),
        parentTitle: parent?.type === 'database_id' ? 'database row' : undefined,
        status: statusOf(obj),
        emails,
        people,
        lastEdited: String(obj.last_edited_time ?? ''),
      })
    }
    if (!data.has_more || !data.next_cursor) break
    cursor = data.next_cursor
  }
  return { fetchedAt: new Date().toISOString(), entries }
}

const ATLAS_KEY = 'atlas:v1'

export async function getAtlas(env: Env, maxAgeMs = 24 * 3_600_000): Promise<Atlas> {
  const cached = await env.ATLAS.get<Atlas>(ATLAS_KEY, 'json')
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < maxAgeMs) return cached
  const fresh = await buildAtlas(env)
  await env.ATLAS.put(ATLAS_KEY, JSON.stringify(fresh))
  return fresh
}

export async function refreshAtlas(env: Env): Promise<Atlas> {
  const fresh = await buildAtlas(env)
  await env.ATLAS.put(ATLAS_KEY, JSON.stringify(fresh))
  return fresh
}

/** Tool surface handed to the model during the deep pass. Read-only, by design. */
export async function searchNotion(env: Env, query: string): Promise<string> {
  const data = await notion<{ results: NotionValue[] }>(env, '/search', {
    method: 'POST',
    body: JSON.stringify({ query, page_size: 8 }),
  })
  return JSON.stringify(
    data.results.map((r) => ({ id: r.id, title: titleOf(r), url: r.url, type: r.object })),
  )
}

/** A page's text, flattened. Blocks only, one level deep — enough for context. */
export async function fetchNotionPage(env: Env, pageId: string): Promise<string> {
  const [page, blocks] = await Promise.all([
    notion<NotionValue>(env, `/pages/${pageId}`),
    notion<{ results: NotionValue[] }>(env, `/blocks/${pageId}/children?page_size=60`),
  ])
  const lines: string[] = [`# ${titleOf(page)}`, String(page.url ?? '')]
  for (const b of blocks.results) {
    const type = String(b.type ?? '')
    const inner = b[type] as NotionValue | undefined
    if (!inner) continue
    const text = plainText(inner.rich_text)
    if (text) lines.push(type.startsWith('heading') ? `## ${text}` : text)
  }
  return lines.join('\n').slice(0, 12_000)
}
