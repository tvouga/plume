import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useMailApi } from '../data/useMailApi'
import { useMe } from '../data/hooks'
import type { Conversation } from '../graph/types'
import { displayName, senderOf } from '../lib/format'
import { heuristicTriage } from './heuristics'
import { categoriesFor, hashOf, writeLedger } from './ledger'
import { agentTransport } from './transport'
import type { LedgerRecord, Obligation, TriageInput } from './types'

/**
 * One clock, ticking on the minute, shared by every surface. Relative times
 * ("in 1h 36m", "6d") and the Runway's now-line all read from it, so they move
 * on their own instead of freezing until the next fetch.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Triage runs in the background, in small batches, so the page never waits on
 * the model. Small batches also mean the first verdicts land in well under a
 * minute instead of everything landing at once after several.
 */
const TRIAGE_BATCH = 12
const TRIAGE_CONCURRENCY = 2
/** After a failed batch, leave those conversations alone for a while. */
const RETRY_AFTER_MS = 5 * 60_000
const FEED_REFETCH_MS = 60_000

/**
 * Module-level so they survive remounts and refetches. `upgraded` holds model
 * verdicts from this session until the write to Outlook has landed and reads
 * back — without it, a refetch in that window would re-triage (and re-pay for)
 * the same conversations.
 */
const upgraded = new Map<string, LedgerRecord>()
const inFlight = new Set<string>()
const failedAt = new Map<string, number>()

function toTriageInput(c: Conversation, myEmail: string): TriageInput {
  const m = c.latest
  const sender = senderOf(m)
  const fromEmail = (sender?.emailAddress?.address ?? '').toLowerCase()
  return {
    messageId: m.id,
    conversationId: c.conversationId,
    hash: hashOf({ id: m.id, count: c.count, receivedDateTime: m.receivedDateTime }),
    subject: m.subject ?? '',
    from: displayName(sender),
    fromEmail,
    to: (m.toRecipients ?? []).map((r) => displayName(r)),
    receivedDateTime: m.receivedDateTime,
    preview: m.bodyPreview ?? '',
    isRead: m.isRead,
    flagged: m.flag?.flagStatus === 'flagged',
    classification: m.inferenceClassification,
    threadCount: c.count,
    lastFromMe: fromEmail === myEmail.toLowerCase(),
  }
}

/** Persist verdicts without blocking render; a failed write costs a re-triage. */
async function persist(
  graphPatch: Parameters<typeof writeLedger>[0],
  pairs: { id: string; record: LedgerRecord }[],
) {
  const CONCURRENCY = 4
  for (let i = 0; i < pairs.length; i += CONCURRENCY) {
    await Promise.allSettled(
      pairs.slice(i, i + CONCURRENCY).map((p) =>
        writeLedger(graphPatch, p.id, p.record, categoriesFor(p.record)),
      ),
    )
  }
}

function needsModel(rec: LedgerRecord | undefined, hash: string): boolean {
  if (agentTransport.kind !== 'worker') return false
  if (!rec) return true
  if (rec.source !== 'model') return true
  return rec.hash !== hash
}

/**
 * The single source every agent surface reads from: the mailbox joined with
 * its verdicts. Returns immediately with whatever verdicts exist — a quick
 * local guess for anything new — and upgrades them with the model behind it.
 */
export function useAgentFeed() {
  const mail = useMailApi()
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const myEmail = me?.mail ?? me?.userPrincipalName ?? ''
  const queryKey = useMemo(() => ['agent', 'feed', myEmail], [myEmail])
  const now = useNow()

  const query = useQuery({
    queryKey,
    enabled: Boolean(myEmail),
    refetchInterval: FEED_REFETCH_MS,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Obligation[]> => {
      const { conversations, ledger } = await mail.listAgentFeed()
      const now = new Date()
      const out: Obligation[] = []
      for (const c of conversations) {
        const input = toTriageInput(c, myEmail)
        const stored = upgraded.get(c.latest.id) ?? ledger.get(c.latest.id)
        // Nothing stored yet: show a local guess now rather than nothing.
        const record = stored ?? heuristicTriage(input, now)
        const sender = senderOf(c.latest)
        out.push({
          conversation: c,
          conversationId: c.conversationId,
          messageId: c.latest.id,
          record,
          pending: needsModel(stored, input.hash),
          lastFromMe: input.lastFromMe,
          subject: c.latest.subject ?? '',
          from: displayName(sender),
          fromEmail: sender?.emailAddress?.address ?? '',
          receivedDateTime: c.latest.receivedDateTime,
          threadCount: c.count,
          hasAttachments: c.hasAttachments,
        })
      }
      return out
    },
  })

  // Upgrade pending verdicts in the background, most important first.
  useEffect(() => {
    const data = query.data
    if (!data || agentTransport.kind !== 'worker') return
    const due = data
      .filter((o) => o.pending && !inFlight.has(o.messageId))
      .filter((o) => Date.now() - (failedAt.get(o.messageId) ?? 0) > RETRY_AFTER_MS)
      .sort((a, b) => b.record.importance - a.record.importance)
    if (due.length === 0) return

    const batches: Obligation[][] = []
    for (let i = 0; i < due.length; i += TRIAGE_BATCH) batches.push(due.slice(i, i + TRIAGE_BATCH))
    due.forEach((o) => inFlight.add(o.messageId))

    const runOne = async (batch: Obligation[]) => {
      try {
        const records = await agentTransport.triage(
          batch.map((o) => toTriageInput(o.conversation, myEmail)),
          await getToken(),
        )
        const written: { id: string; record: LedgerRecord }[] = []
        records.forEach((fresh, i) => {
          const o = batch[i]
          if (!o || !fresh) return
          // Same thread, better verdict: keep what the user already decided.
          const rec =
            o.record.hash === fresh.hash
              ? { ...fresh, dismissed: o.record.dismissed, snoozeUntil: o.record.snoozeUntil }
              : fresh
          upgraded.set(o.messageId, rec)
          written.push({ id: o.messageId, record: rec })
        })
        const byId = new Map(written.map((w) => [w.id, w.record]))
        qc.setQueryData<Obligation[]>(queryKey, (prev) =>
          prev?.map((o) => {
            const rec = byId.get(o.messageId)
            return rec ? { ...o, record: rec, pending: false } : o
          }),
        )
        void persist(mail.graph, written)
      } catch (err) {
        // A dead or slow worker must not take the mailbox down with it.
        console.error('[agent] triage batch failed', err)
        batch.forEach((o) => failedAt.set(o.messageId, Date.now()))
      } finally {
        batch.forEach((o) => inFlight.delete(o.messageId))
      }
    }

    // A small pool: a couple of batches at once, the rest as each finishes.
    let next = 0
    const worker = async () => {
      while (next < batches.length) await runOne(batches[next++])
    }
    void Promise.all(Array.from({ length: Math.min(TRIAGE_CONCURRENCY, batches.length) }, worker))
  }, [query.data, queryKey, myEmail, getToken, mail.graph, qc])

  // Derived, not stored: verdicts still waiting on the model, excluding any
  // that just failed and are sitting out their retry delay.
  const triaging = (query.data ?? []).filter(
    (o) => o.pending && now.getTime() - (failedAt.get(o.messageId) ?? 0) > RETRY_AFTER_MS,
  ).length

  return { ...query, triaging }
}

/** Today's meetings, for the Runway's spine and its tethers. */
export function useDayEvents(day: Date) {
  const mail = useMailApi()
  const start = useMemo(() => {
    const d = new Date(day)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }, [day])
  const end = useMemo(() => {
    const d = new Date(day)
    d.setHours(23, 59, 59, 999)
    return d.toISOString()
  }, [day])

  return useQuery({
    queryKey: ['agent', 'events', start],
    queryFn: () => mail.listEvents(start, end),
    staleTime: 5 * 60_000,
    // A tenant that hasn't consented to Calendars.Read shouldn't break the page.
    retry: false,
  })
}

/** Patch one record in place — snooze, dismiss, restore, edit the draft. */
export function useUpdateRecord() {
  const mail = useMailApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      messageId,
      patch,
      current,
    }: {
      messageId: string
      patch: Partial<LedgerRecord>
      current: LedgerRecord
    }) => {
      const next: LedgerRecord = { ...current, ...patch }
      await writeLedger(mail.graph, messageId, next, categoriesFor(next))
      return next
    },
    onMutate: async ({ messageId, patch }) => {
      // Keep the session's in-memory verdict in step, or the next refetch
      // would bring back the version from before this change.
      const held = upgraded.get(messageId)
      if (held) upgraded.set(messageId, { ...held, ...patch })
      await qc.cancelQueries({ queryKey: ['agent', 'feed'] })
      const snapshots = qc.getQueriesData<Obligation[]>({ queryKey: ['agent', 'feed'] })
      for (const [key, data] of snapshots) {
        if (!data) continue
        qc.setQueryData<Obligation[]>(
          key,
          data.map((o) =>
            o.messageId === messageId ? { ...o, record: { ...o.record, ...patch } } : o,
          ),
        )
      }
      return { snapshots }
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
    },
  })
}

/** Whether this user has connected their own Notion. Null without a worker. */
export function useNotionStatus() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['agent', 'notion'],
    queryFn: async () => agentTransport.notionStatus(await getToken()),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Send the browser to Notion's consent screen. It comes back via the worker. */
export function useConnectNotion() {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async () => {
      window.location.assign(await agentTransport.notionConnectUrl(await getToken()))
    },
  })
}

export function useDisconnectNotion() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => agentTransport.notionDisconnect(await getToken()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent'] })
    },
  })
}
