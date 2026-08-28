import type { Conversation } from '../graph/types'

// Types for the agent layer: what the model produces, and what the UI consumes.

/** How badly this bites if you ignore it. Drives colour, not order. */
export type Stakes = 'critical' | 'high' | 'normal' | 'low'

/** What kind of thing a message is. `noise` never reaches a surface. */
export type Category = 'action' | 'reply' | 'fyi' | 'noise'

/**
 * A promise, in either direction. The whole "never drop the ball" mechanic is
 * that we extract both — what you owe, and what you're owed — and resolve them
 * automatically when a later message satisfies them.
 */
export interface Commitment {
  id: string
  direction: 'you-owe' | 'owed-to-you'
  /** One line, imperative: "send the v4 pricing table". */
  what: string
  counterparty: string
  counterpartyEmail?: string
  /** ISO. Absent when the promise had no stated date. */
  dueAt?: string
  /** ISO — when the promise was made. Drives the "6 days silent" bar. */
  promisedAt: string
  /** The sentence it came from, for the evidence rail. */
  quote?: string
  state: 'open' | 'done' | 'dropped'
}

/**
 * The triage verdict for one conversation. Persisted onto the Outlook message
 * itself (see ledger.ts), so it syncs across devices and survives a reinstall.
 */
export interface LedgerRecord {
  v: 1
  /** Changes when the conversation does, so we know to re-triage. */
  hash: string
  triagedAt: string
  /** 0-100. Ranking within a surface. */
  importance: number
  stakes: Stakes
  category: Category
  needsReply: boolean
  /** One sentence: what this person needs from you. The card headline. */
  ask?: string
  /** ISO deadline, if the message implies one. */
  dueAt?: string
  /** Free text: what breaks if you miss it. Feeds "if you do nothing". */
  gates?: string
  /** Notion page id + title, when the join resolved. */
  projectId?: string
  projectName?: string
  projectUrl?: string
  commitments: Commitment[]
  /** ISO — hidden from surfaces until then. */
  snoozeUntil?: string
  /** You said "not important". Teaches the next triage. */
  dismissed?: boolean
  /** Staged reply. Never sent without an explicit tap. */
  draft?: string
  /** Quoted lines backing the verdict, for the evidence rail. */
  evidence?: { source: 'mail' | 'notion' | 'calendar'; label: string; quote?: string; url?: string }[]
}

/** One page or database in the Notion Atlas — metadata only, never bodies. */
export interface AtlasEntry {
  id: string
  title: string
  type: 'page' | 'database'
  url: string
  parentTitle?: string
  status?: string
  /** Email addresses found on the page, used for deterministic joins. */
  emails: string[]
  /** Display names of people referenced. */
  people: string[]
  lastEdited: string
}

export interface Atlas {
  fetchedAt: string
  entries: AtlasEntry[]
}

/** Subset of a Graph calendar event the Runway plots against. */
export interface CalendarEvent {
  id: string
  subject: string
  start: string
  end: string
  isAllDay: boolean
  organizer?: string
}

/** What we send the model for the cheap pass. */
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
  /** How many messages in the thread, and whether you sent the last one. */
  threadCount: number
  lastFromMe: boolean
}

/** A conversation joined with its verdict — what every surface renders from. */
export interface Obligation {
  /** The raw rolled-up conversation, so a card can hand it to ThreadView. */
  conversation: Conversation
  conversationId: string
  messageId: string
  record: LedgerRecord
  subject: string
  from: string
  fromEmail: string
  receivedDateTime: string
  threadCount: number
  hasAttachments: boolean
}
