import type { Commitment, LedgerRecord, TriageInput } from './types'

/**
 * A no-AI triage pass. This exists for two reasons: Plume has to be usable
 * before you've configured a worker, and a deterministic baseline is the only
 * honest way to tell whether the model is actually adding anything.
 */

const NOISE_SENDER = /(^|[.@])(no-?reply|do-?not-?reply|notifications?|mailer|bounce|newsletter|digest|updates?|alerts?)@/i
const NOISE_SUBJECT = /\b(unsubscribe|newsletter|digest|receipt|invoice|statement|deploy(ed|ment)?\s+(succeeded|passed)|build\s+passed|your\s+order)\b/i
const ASK_SIGNAL = /\?|\b(could|can|would|please|need|needs|needed|waiting|asap|urgent|deadline|by\s+(eod|cob|today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/i
const PROMISE_ME = /\b(i'?ll|i\s+will|we'?ll|we\s+will|let\s+me|i'?m\s+going\s+to)\b[^.!?]{0,90}/i
const PROMISE_THEM = /\b(i'?ll|i\s+will|we'?ll|we\s+will)\b[^.!?]{0,90}/i

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Best-effort deadline extraction. Returns an ISO string, or undefined. */
export function parseDeadline(text: string, now = new Date()): string | undefined {
  const t = text.toLowerCase()
  const at = (d: Date, h: number, m = 0) => {
    const c = new Date(d)
    c.setHours(h, m, 0, 0)
    return c.toISOString()
  }

  // "by 11", "before 3pm", "at 09:30"
  const clock = t.match(/\b(?:by|before|at|no later than)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)

  if (/\b(eod|cob|end of day|today)\b/.test(t)) {
    if (clock) return withClock(now, clock)
    return at(now, 17)
  }
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return clock ? withClock(d, clock) : at(d, 12)
  }

  for (let i = 0; i < DAYS.length; i++) {
    if (new RegExp(`\\b(?:by|before|on|this|next)\\s+${DAYS[i]}\\b`).test(t)) {
      const d = new Date(now)
      const delta = (i - d.getDay() + 7) % 7 || 7
      d.setDate(d.getDate() + delta)
      return clock ? withClock(d, clock) : at(d, 17)
    }
  }

  // A bare clock reference with an ask verb means today.
  if (clock && ASK_SIGNAL.test(t)) return withClock(now, clock)
  return undefined
}

function withClock(base: Date, m: RegExpMatchArray): string {
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const mer = m[3]
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  // "by 3" in a work context almost always means the afternoon.
  if (!mer && h <= 7) h += 12
  const d = new Date(base)
  d.setHours(h, min, 0, 0)
  return d.toISOString()
}

function extractCommitments(input: TriageInput, now: Date): Commitment[] {
  const text = input.preview
  const out: Commitment[] = []
  const pattern = input.lastFromMe ? PROMISE_ME : PROMISE_THEM
  const m = text.match(pattern)
  if (m) {
    out.push({
      id: `${input.messageId}:c0`,
      direction: input.lastFromMe ? 'you-owe' : 'owed-to-you',
      what: m[0].trim().replace(/\s+/g, ' ').slice(0, 120),
      counterparty: input.lastFromMe ? input.to[0] ?? 'them' : input.from,
      counterpartyEmail: input.lastFromMe ? undefined : input.fromEmail,
      promisedAt: input.receivedDateTime,
      dueAt: parseDeadline(text, now),
      quote: m[0].trim(),
      state: 'open',
    })
  }

  // You replied and nothing came back: that's an owed-to-you, whatever was said.
  const ageDays = (now.getTime() - new Date(input.receivedDateTime).getTime()) / 86_400_000
  if (input.lastFromMe && ageDays >= 3 && input.threadCount > 1) {
    out.push({
      id: `${input.messageId}:silence`,
      direction: 'owed-to-you',
      what: `A reply on “${input.subject || 'this thread'}”`,
      counterparty: input.to[0] ?? 'them',
      promisedAt: input.receivedDateTime,
      state: 'open',
    })
  }
  return out
}

/** Score and classify one conversation without calling a model. */
export function heuristicTriage(input: TriageInput, now = new Date()): LedgerRecord {
  const noise = NOISE_SENDER.test(input.fromEmail) || NOISE_SUBJECT.test(input.subject)
  const asks = ASK_SIGNAL.test(input.preview) || ASK_SIGNAL.test(input.subject)
  const dueAt = parseDeadline(`${input.subject} ${input.preview}`, now)
  const commitments = extractCommitments(input, now)

  let score = 30
  if (noise) score -= 45
  if (input.flagged) score += 30
  if (!input.isRead) score += 8
  if (input.classification === 'other') score -= 20
  if (asks) score += 18
  if (dueAt) score += 22
  if (input.threadCount > 2) score += 6
  // Addressed to you alone reads as a direct ask; a big to-line rarely does.
  if (input.to.length === 1) score += 10
  else if (input.to.length > 4) score -= 8
  if (input.lastFromMe) score -= 25

  const ageHours = (now.getTime() - new Date(input.receivedDateTime).getTime()) / 3_600_000
  if (ageHours > 72) score -= 10

  const importance = Math.max(0, Math.min(100, score))
  const overdue = dueAt ? new Date(dueAt).getTime() - now.getTime() < 4 * 3_600_000 : false

  const category: LedgerRecord['category'] = noise
    ? 'noise'
    : input.lastFromMe
      ? 'fyi'
      : asks || dueAt
        ? 'action'
        : importance >= 45
          ? 'reply'
          : 'fyi'

  return {
    v: 1,
    hash: input.hash,
    triagedAt: now.toISOString(),
    importance,
    stakes: overdue && importance >= 50 ? 'critical' : importance >= 60 ? 'high' : importance >= 35 ? 'normal' : 'low',
    category,
    needsReply: category === 'action' || category === 'reply',
    ask: input.subject || input.preview.slice(0, 90),
    dueAt,
    commitments,
    evidence: [
      { source: 'mail', label: `${input.from} · ${new Date(input.receivedDateTime).toLocaleString()}`, quote: input.preview.slice(0, 220) },
    ],
  }
}
