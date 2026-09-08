import Anthropic from '@anthropic-ai/sdk'
import type { Env } from './env'
import type { Atlas } from './notion'

export interface TriageInput {
  messageId: string
  conversationId: string
  hash: string
  subject: string
  from: string
  fromEmail: string
  to: string[]
  receivedDateTime: string
  preview: string
  isRead: boolean
  flagged: boolean
  classification?: string
  threadCount: number
  lastFromMe: boolean
}

const SYSTEM = `You triage one person's work email against their Notion workspace.

Your job is NOT to summarize mail. It is to decide, for each conversation, what
it actually demands of the reader — and to say so in one sentence written from
their side of the screen.

Rules that matter more than anything else:
- "ask" is a sentence about what the SENDER needs FROM THE READER, with the
  deadline in it if there is one. Never restate the subject line.
- Only mark needsReply when a specific human is actually blocked on a response.
  Newsletters, receipts, CI notifications, calendar accepts and cold outreach
  are category "noise" and must never be marked needsReply.
- Extract commitments in BOTH directions. "you-owe" is something the reader
  promised. "owed-to-you" is something someone promised the reader, including
  the case where the reader sent the last message and got silence. Quote the
  sentence the promise came from.
- Only set projectId to an id that appears in the Notion map below. Prefer a
  match found through an email address or a person's name over a fuzzy title
  match. When nothing matches cleanly, leave it null — a wrong project is far
  worse than none.
- Only write a draft when the reply is genuinely obvious and low-risk, and
  ground every fact in the thread or the Notion map. Never invent a number, a
  date, a price or a commitment. When in doubt, leave draft null.
- gates: what concretely breaks if the reader does nothing. One short clause.
  Leave null unless the thread actually says or clearly implies it.
- dueAt must be a full ISO 8601 timestamp, or null. Never guess a date.`

function atlasBlock(atlas: Atlas | null): string {
  if (!atlas || atlas.entries.length === 0) {
    return 'No Notion workspace is connected. Leave every projectId null.'
  }
  // Metadata only, and bounded — this block is prompt-cached across every call.
  const rows = atlas.entries
    .slice(0, 300)
    .map((e) => {
      const who = [...e.emails, ...e.people].slice(0, 6).join(' ')
      return [e.id, e.type, e.title, e.status ?? '', who].join(' | ')
    })
    .join('\n')
  return `Notion map (id | type | title | status | people and emails):\n${rows}`
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'messageId', 'importance', 'stakes', 'category', 'needsReply',
          'ask', 'dueAt', 'gates', 'projectId', 'draft', 'commitments',
        ],
        properties: {
          messageId: { type: 'string' },
          importance: { type: 'integer', description: '0-100, ranking within the surface' },
          stakes: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
          category: { type: 'string', enum: ['action', 'reply', 'fyi', 'noise'] },
          needsReply: { type: 'boolean' },
          ask: { type: 'string' },
          dueAt: { type: ['string', 'null'] },
          gates: { type: ['string', 'null'] },
          projectId: { type: ['string', 'null'] },
          draft: { type: ['string', 'null'] },
          commitments: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['direction', 'what', 'counterparty', 'dueAt', 'quote'],
              properties: {
                direction: { type: 'string', enum: ['you-owe', 'owed-to-you'] },
                what: { type: 'string' },
                counterparty: { type: 'string' },
                dueAt: { type: ['string', 'null'] },
                quote: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
} as const

interface Verdict {
  messageId: string
  importance: number
  stakes: string
  category: string
  needsReply: boolean
  ask: string
  dueAt: string | null
  gates: string | null
  projectId: string | null
  draft: string | null
  commitments: {
    direction: 'you-owe' | 'owed-to-you'
    what: string
    counterparty: string
    dueAt: string | null
    quote: string | null
  }[]
}

export async function triage(
  env: Env,
  inputs: TriageInput[],
  atlas: Atlas | null,
  myEmail: string,
): Promise<unknown[]> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const digest = inputs
    .map((i) =>
      [
        `id: ${i.messageId}`,
        `from: ${i.from} <${i.fromEmail}>`,
        `to: ${i.to.join(', ')}`,
        `subject: ${i.subject}`,
        `received: ${i.receivedDateTime}`,
        `thread: ${i.threadCount} message(s)${i.lastFromMe ? ', reader sent the last one' : ''}`,
        `${i.flagged ? 'flagged, ' : ''}${i.isRead ? 'read' : 'unread'}${i.classification ? `, outlook: ${i.classification}` : ''}`,
        `preview: ${i.preview.replace(/\s+/g, ' ').slice(0, 600)}`,
      ].join('\n'),
    )
    .join('\n---\n')

  const res = await client.messages.create({
    model: env.TRIAGE_MODEL || 'claude-opus-5',
    max_tokens: 16000,
    // Classification is the cheap pass; low effort is the right lever here.
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: SYSTEM },
      // The Notion map is identical across every call — cache it.
      { type: 'text', text: atlasBlock(atlas), cache_control: { type: 'ephemeral' } },
    ],
    tools: [
      {
        name: 'record_triage',
        description: 'Record one verdict per conversation, in the order given.',
        strict: true,
        input_schema: VERDICT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'record_triage' },
    messages: [
      {
        role: 'user',
        content:
          `The reader is ${myEmail}. Current time is ${new Date().toISOString()}.\n` +
          `Triage all ${inputs.length} conversations below.\n\n${digest}`,
      },
    ],
  })

  const call = res.content.find((b) => b.type === 'tool_use')
  if (!call || call.type !== 'tool_use') return []
  const { verdicts } = call.input as { verdicts: Verdict[] }

  const byId = new Map(atlas?.entries.map((e) => [e.id, e]) ?? [])
  const now = new Date().toISOString()
  const inputById = new Map(inputs.map((i) => [i.messageId, i]))

  // Return records in the caller's order — the client zips them back by index.
  return inputs.map((input) => {
    const v = verdicts.find((x) => x.messageId === input.messageId)
    if (!v) {
      return {
        v: 1, hash: input.hash, triagedAt: now, importance: 20, stakes: 'low',
        category: 'fyi', needsReply: false, ask: input.subject, commitments: [],
      }
    }
    const project = v.projectId ? byId.get(v.projectId) : undefined
    const src = inputById.get(v.messageId)
    return {
      v: 1,
      hash: input.hash,
      triagedAt: now,
      importance: Math.max(0, Math.min(100, v.importance)),
      stakes: v.stakes,
      category: v.category,
      needsReply: v.needsReply,
      ask: v.ask,
      dueAt: v.dueAt ?? undefined,
      gates: v.gates ?? undefined,
      projectId: project?.id,
      projectName: project?.title,
      projectUrl: project?.url,
      draft: v.draft ?? undefined,
      commitments: v.commitments.map((c, n) => ({
        id: `${v.messageId}:c${n}`,
        direction: c.direction,
        what: c.what,
        counterparty: c.counterparty,
        counterpartyEmail: c.direction === 'owed-to-you' ? src?.fromEmail : undefined,
        promisedAt: src?.receivedDateTime ?? now,
        dueAt: c.dueAt ?? undefined,
        quote: c.quote ?? undefined,
        state: 'open',
      })),
      evidence: [
        {
          source: 'mail',
          label: `${input.from} · ${input.receivedDateTime}`,
          quote: input.preview.slice(0, 220),
        },
        ...(project
          ? [{ source: 'notion' as const, label: project.title, url: project.url }]
          : []),
      ],
    }
  })
}
