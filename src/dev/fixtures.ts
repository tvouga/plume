import type { Conversation } from '../graph/types'
import type { LedgerRecord, Obligation } from '../agent/types'

/**
 * Fixtures for the demo route. Times are relative to now so the Runway always
 * has a populated day whenever you open it.
 */
const now = Date.now()
const h = (n: number) => new Date(now + n * 3_600_000).toISOString()
const d = (n: number) => new Date(now + n * 86_400_000).toISOString()

function conversation(id: string, from: string, email: string, subject: string, when: string, count: number): Conversation {
  return {
    conversationId: id,
    count,
    unread: true,
    hasAttachments: false,
    latest: {
      id: `${id}-msg`,
      conversationId: id,
      subject,
      bodyPreview: '',
      from: { emailAddress: { name: from, address: email } },
      toRecipients: [{ emailAddress: { name: 'You', address: 'you@example.com' } }],
      receivedDateTime: when,
      isRead: false,
      hasAttachments: false,
    },
  }
}

interface Seed {
  id: string
  from: string
  email: string
  subject: string
  received: string
  count: number
  record: Partial<LedgerRecord> & Pick<LedgerRecord, 'importance' | 'stakes' | 'category' | 'needsReply'>
}

const seeds: Seed[] = [
  {
    id: 'c1', from: 'Priya Raghavan', email: 'priya@example.com', count: 5,
    subject: 'Board pre-read numbers', received: h(-2),
    record: {
      importance: 96, stakes: 'critical', category: 'action', needsReply: true,
      ask: 'Needs the revised pricing table before the board pre-read — she goes in with Monday’s numbers otherwise.',
      dueAt: h(1.6), gates: 'The board sees stale enterprise pricing',
      projectId: 'p-pricing', projectName: 'Q3 Pricing', projectUrl: 'https://notion.so/q3-pricing',
      draft: 'Priya —\n\nTable attached. The only change since Monday is enterprise at $2,400/seat; volume and team tiers hold.\n\nShout if you want the per-tier margin slide in the pre-read too.',
      commitments: [{
        id: 'c1:0', direction: 'you-owe', what: 'send the v4 pricing table',
        counterparty: 'Priya Raghavan', promisedAt: d(-3), dueAt: h(1.6),
        quote: 'I’ll have v4 numbers to you before the pre-read.', state: 'open',
      }],
    },
  },
  {
    id: 'c2', from: 'Marcus Lee', email: 'marcus@datastack.example', count: 3,
    subject: 'Renewal — action needed', received: d(-2),
    record: {
      importance: 88, stakes: 'critical', category: 'action', needsReply: true,
      ask: 'The contract auto-renews Friday unless you give notice, and your Notion note says renegotiate.',
      dueAt: d(2), gates: 'Datastack renews at +18%, silently',
      projectId: 'p-vendors', projectName: 'Vendors / Datastack', projectUrl: 'https://notion.so/vendors',
      commitments: [],
    },
  },
  {
    id: 'c3', from: 'Aline Berger', email: 'aline@example.com', count: 2,
    subject: 'Thursday design review?', received: d(-1),
    record: {
      importance: 71, stakes: 'high', category: 'action', needsReply: true,
      ask: 'Asked twice whether the design review still stands — you haven’t answered either.',
      dueAt: h(6), gates: 'Two candidates lose the slot',
      projectId: 'p-hiring', projectName: 'Hiring — Design', projectUrl: 'https://notion.so/hiring',
      draft: 'Aline — yes, Thursday still stands. Sorry for the silence.',
      commitments: [],
    },
  },
  {
    id: 'c4', from: 'Tom Whitfield', email: 'tom@example.com', count: 4,
    subject: 'Margin model walkthrough', received: d(-1),
    record: {
      importance: 54, stakes: 'normal', category: 'reply', needsReply: true,
      ask: 'Finance still has no invite for the margin walkthrough you offered on Tuesday.',
      dueAt: h(4.5),
      projectId: 'p-pricing', projectName: 'Q3 Pricing', projectUrl: 'https://notion.so/q3-pricing',
      commitments: [],
    },
  },
  {
    id: 'c5', from: 'You', email: 'you@example.com', count: 2,
    subject: 'Competitor pricing sheet', received: d(-6),
    record: {
      importance: 40, stakes: 'normal', category: 'fyi', needsReply: false,
      ask: 'You asked Marc for the competitor sheet and never heard back.',
      commitments: [{
        id: 'c5:0', direction: 'owed-to-you', what: 'the competitor pricing sheet',
        counterparty: 'Marc Tessier', counterpartyEmail: 'marc@example.com',
        promisedAt: d(-6), quote: 'I’ll get it over by end of week.', state: 'open',
      }],
    },
  },
  {
    id: 'c6', from: 'Renata Alves', email: 'renata@example.com', count: 3,
    subject: 'MSA redlines', received: d(-3),
    record: {
      importance: 45, stakes: 'normal', category: 'fyi', needsReply: false,
      ask: 'Legal owes you the MSA redlines they promised Monday.',
      commitments: [{
        id: 'c6:0', direction: 'owed-to-you', what: 'MSA redlines',
        counterparty: 'Renata Alves', counterpartyEmail: 'renata@example.com',
        promisedAt: d(-3), quote: 'Should have redlines back to you Monday.', state: 'open',
      }],
    },
  },
  {
    id: 'c7', from: 'Ops Bot', email: 'noreply@ci.example', count: 1,
    subject: 'Deploy succeeded — falcon-api', received: h(-4),
    record: { importance: 3, stakes: 'low', category: 'noise', needsReply: false, ask: 'Deploy passed.' },
  },
  {
    id: 'c8', from: 'Stratechery', email: 'newsletter@stratechery.example', count: 1,
    subject: 'Pricing power and the platform shift', received: h(-6),
    record: { importance: 12, stakes: 'low', category: 'fyi', needsReply: false, ask: 'Weekly essay, no action.' },
  },
  {
    id: 'c9', from: 'Sana Iqbal', email: 'sana@example.com', count: 1,
    subject: 'Warm intro from Priya', received: d(-1),
    record: {
      importance: 48, stakes: 'normal', category: 'reply', needsReply: true,
      ask: 'A warm intro from Priya that has had no reply for a day.',
      commitments: [],
    },
  },
]

export const demoObligations: Obligation[] = seeds.map((s) => {
  const conv = conversation(s.id, s.from, s.email, s.subject, s.received, s.count)
  return {
    conversation: conv,
    conversationId: s.id,
    messageId: conv.latest.id,
    subject: s.subject,
    from: s.from,
    fromEmail: s.email,
    receivedDateTime: s.received,
    threadCount: s.count,
    hasAttachments: false,
    record: {
      v: 1,
      hash: s.id,
      triagedAt: new Date().toISOString(),
      commitments: [],
      ...s.record,
    } as LedgerRecord,
  }
})

export const demoEvents = [
  { id: 'e1', subject: 'Board pre-read', start: h(1.6), end: h(2.6), isAllDay: false },
  { id: 'e2', subject: '1:1 Aline', start: h(4), end: h(4.5), isAllDay: false },
  { id: 'e3', subject: 'Design review', start: h(6), end: h(7.5), isAllDay: false },
]
