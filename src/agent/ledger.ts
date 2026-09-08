import type { GraphClient } from '../graph/client'
import type { LedgerRecord } from './types'

/**
 * The ledger lives on the Outlook message itself, as a named MAPI property.
 * That means it syncs through the Graph token we already hold, survives a
 * reinstall, and shows up on every device without us running any storage.
 *
 * The GUID is a fixed namespace we invented for Plume; the name scopes the
 * property within it. Any string is legal — Outlook just carries the bytes.
 */
const PROP_GUID = '66f5a359-4659-4830-9070-00047ec6ac6e'
export const LEDGER_PROP = `String {${PROP_GUID}} Name PlumeLedger`

/** Appended to $expand so list queries come back with their verdicts attached. */
export const LEDGER_EXPAND = `singleValueExtendedProperties($filter=id eq '${LEDGER_PROP}')`

/** Categories are the human-visible half — these show up in real Outlook. */
export const CATEGORY = {
  needsYou: 'Plume · Needs you',
  waiting: 'Plume · Waiting on',
  snoozed: 'Plume · Snoozed',
  handled: 'Plume · Handled',
} as const

interface ExtendedProp {
  id: string
  value: string
}

/** Pull the record off a message that was fetched with LEDGER_EXPAND. */
export function readLedger(msg: {
  singleValueExtendedProperties?: ExtendedProp[]
}): LedgerRecord | null {
  const raw = msg.singleValueExtendedProperties?.find((p) => p.id === LEDGER_PROP)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LedgerRecord
    return parsed?.v === 1 ? parsed : null
  } catch {
    // A corrupt record is the same as no record — it'll be re-triaged.
    return null
  }
}

/**
 * Persist a record. Fire-and-forget from the UI's point of view: a failed write
 * costs one re-triage next time, never correctness.
 */
export async function writeLedger(
  graph: GraphClient,
  messageId: string,
  record: LedgerRecord,
  categories?: string[],
): Promise<void> {
  const body: Record<string, unknown> = {
    singleValueExtendedProperties: [{ id: LEDGER_PROP, value: JSON.stringify(record) }],
  }
  if (categories) body.categories = categories
  await graph.patch(`/me/messages/${messageId}`, body)
}

/** The Outlook categories implied by a record, so the mailbox stays legible. */
export function categoriesFor(record: LedgerRecord): string[] {
  const out: string[] = []
  if (record.snoozeUntil && new Date(record.snoozeUntil) > new Date()) {
    out.push(CATEGORY.snoozed)
  } else if (record.dismissed || record.category === 'noise' || record.category === 'fyi') {
    out.push(CATEGORY.handled)
  } else if (record.needsReply || record.category === 'action') {
    out.push(CATEGORY.needsYou)
  }
  if (record.commitments.some((c) => c.direction === 'owed-to-you' && c.state === 'open')) {
    out.push(CATEGORY.waiting)
  }
  return out
}

/**
 * Cheap staleness key. Re-triage happens when the thread grows or the message
 * is edited — not on every poll.
 */
export function hashOf(input: { id: string; count: number; receivedDateTime: string }): string {
  return `${input.id}:${input.count}:${input.receivedDateTime}`
}
