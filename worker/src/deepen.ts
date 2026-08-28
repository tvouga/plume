import Anthropic from '@anthropic-ai/sdk'
import type { Env } from './env'
import { fetchNotionPage, searchNotion, type Atlas } from './notion'

export interface DeepenInput {
  messageId: string
  conversationId: string
  subject: string
  thread: { from: string; sentAt: string; text: string; fromMe: boolean }[]
  myName: string
  myEmail: string
}

const SYSTEM = `You are drafting one reply for a person, using their own Notion
workspace as the source of truth.

Search Notion before you write. Ground every fact — numbers, dates, prices,
names, statuses — in something you actually read, either in the thread or on a
Notion page you fetched. If a fact you would need isn't there, write the reply
without it rather than inventing it, and say in "gaps" what you'd need.

The draft is written in the reader's voice: plain, direct, no throat-clearing,
no "I hope this finds you well". Short paragraphs. It will be shown to them for
approval before anything is sent, so it should be ready to send as written.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'notion_search',
    description: 'Search the Notion workspace by keyword. Returns ids, titles and urls.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: { query: { type: 'string' } },
    } as unknown as Anthropic.Tool.InputSchema,
  },
  {
    name: 'notion_fetch',
    description: 'Read one Notion page by id, returning its text.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['pageId'],
      properties: { pageId: { type: 'string' } },
    } as unknown as Anthropic.Tool.InputSchema,
  },
  {
    name: 'record_result',
    description: 'Record the finished draft and what it was grounded in. Call this last.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ask', 'draft', 'gates', 'sources', 'gaps'],
      properties: {
        ask: { type: 'string', description: 'One sentence: what the sender needs.' },
        draft: { type: 'string', description: 'The reply, in the reader’s voice.' },
        gates: { type: ['string', 'null'], description: 'What breaks if they do nothing.' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'quote', 'url'],
            properties: {
              label: { type: 'string' },
              quote: { type: ['string', 'null'] },
              url: { type: ['string', 'null'] },
            },
          },
        },
        gaps: { type: ['string', 'null'], description: 'Facts you needed and could not find.' },
      },
    } as unknown as Anthropic.Tool.InputSchema,
  },
]

/**
 * The expensive pass, run only when a card is opened. A plain agentic loop:
 * let the model pull the two Notion pages it actually needs, then record a
 * grounded draft. Read-only — nothing here can write to Notion.
 */
export async function deepen(env: Env, input: DeepenInput, atlas: Atlas | null) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const hint = atlas
    ? atlas.entries
        .slice(0, 120)
        .map((e) => `${e.id} | ${e.title}${e.status ? ` (${e.status})` : ''}`)
        .join('\n')
    : 'No Notion workspace connected.'

  const thread = input.thread
    .map((m) => `[${m.sentAt}] ${m.fromMe ? `${input.myName} (the reader)` : m.from}:\n${m.text.slice(0, 4000)}`)
    .join('\n\n---\n\n')

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Reader: ${input.myName} <${input.myEmail}>. Now: ${new Date().toISOString()}.\n` +
        `Subject: ${input.subject}\n\nNotion pages available:\n${hint}\n\nThread:\n${thread}`,
    },
  ]

  for (let turn = 0; turn < 6; turn++) {
    const res: Anthropic.Message = await client.messages.create({
      model: env.DEEPEN_MODEL || 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    })

    if (res.stop_reason === 'refusal') {
      throw new Error(`Model declined: ${res.stop_details?.explanation ?? 'no reason given'}`)
    }

    const record = res.content.find((b) => b.type === 'tool_use' && b.name === 'record_result')
    if (record && record.type === 'tool_use') {
      const out = record.input as {
        ask: string
        draft: string
        gates: string | null
        sources: { label: string; quote: string | null; url: string | null }[]
        gaps: string | null
      }
      return {
        ask: out.ask,
        draft: out.draft,
        gates: out.gates ?? undefined,
        evidence: out.sources.map((s) => ({
          source: s.url ? ('notion' as const) : ('mail' as const),
          label: s.label,
          quote: s.quote ?? undefined,
          url: s.url ?? undefined,
        })),
        gaps: out.gaps ?? undefined,
      }
    }

    if (res.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: res.content })

    // Every tool_result for a turn goes back in ONE user message.
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue
      try {
        const args = block.input as { query?: string; pageId?: string }
        const content =
          block.name === 'notion_search'
            ? await searchNotion(env, args.query ?? '')
            : block.name === 'notion_fetch'
              ? await fetchNotionPage(env, args.pageId ?? '')
              : `Unknown tool ${block.name}`
        results.push({ type: 'tool_result', tool_use_id: block.id, content })
      } catch (err) {
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${(err as Error).message}`,
          is_error: true,
        })
      }
    }
    messages.push({ role: 'user', content: results })
  }

  return {}
}
