import type { Env } from './env'

import type { NotionSession } from './notionAuth'

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
export async function buildAtlas(session: NotionSession): Promise<Atlas> {
  const entries: AtlasEntry[] = []
  let cursor: string | undefined
  // Bounded so a huge workspace can't run the cron past its wall clock.
  for (let page = 0; page < 20; page++) {
    const body: Record<string, unknown> = {
      page_size: 100,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    }
    if (cursor) body.start_cursor = cursor

    const data = await session.call<{
      results: NotionValue[]
      next_cursor: string | null
      has_more: boolean
    }>('/search', { method: 'POST', body: JSON.stringify(body) })

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

/**
 * The Atlas is per user: it is built from that person's Notion token, so it
 * only ever holds pages they can see. Keyed by their Microsoft id, never shared.
 */
const atlasKey = (userId: string) => `atlas:v1:${userId}`
const memo = new Map<string, Atlas>()

function fresh(atlas: Atlas, maxAgeMs: number): boolean {
  return Date.now() - new Date(atlas.fetchedAt).getTime() < maxAgeMs
}

async function store(env: Env, userId: string, atlas: Atlas): Promise<void> {
  memo.set(userId, atlas)
  await env.ATLAS.put(atlasKey(userId), JSON.stringify(atlas))
}

export async function getAtlas(env: Env, session: NotionSession, maxAgeMs = 24 * 3_600_000): Promise<Atlas> {
  const hit = memo.get(session.userId)
  if (hit && fresh(hit, maxAgeMs)) return hit

  const cached = await env.ATLAS.get<Atlas>(atlasKey(session.userId), 'json')
  if (cached && fresh(cached, maxAgeMs)) {
    memo.set(session.userId, cached)
    return cached
  }
  const built = await buildAtlas(session)
  await store(env, session.userId, built)
  return built
}

export async function refreshAtlas(env: Env, session: NotionSession): Promise<Atlas> {
  const built = await buildAtlas(session)
  await store(env, session.userId, built)
  return built
}

export function forgetAtlas(userId: string): void {
  memo.delete(userId)
}

/** Tool surface handed to the model during the deep pass. Read-only, by design. */
export async function searchNotion(session: NotionSession, query: string): Promise<string> {
  const data = await session.call<{ results: NotionValue[] }>('/search', {
    method: 'POST',
    body: JSON.stringify({ query, page_size: 8 }),
  })
  return JSON.stringify(
    data.results.map((r) => ({ id: r.id, title: titleOf(r), url: r.url, type: r.object })),
  )
}

/** A page's text, flattened. Blocks only, one level deep — enough for context. */
export async function fetchNotionPage(session: NotionSession, pageId: string): Promise<string> {
  const [page, blocks] = await Promise.all([
    session.call<NotionValue>(`/pages/${pageId}`),
    session.call<{ results: NotionValue[] }>(`/blocks/${pageId}/children?page_size=60`),
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
