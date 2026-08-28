import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useMailApi } from '../data/useMailApi'
import { useMe } from '../data/hooks'
import type { Conversation } from '../graph/types'
import { displayName, senderOf } from '../lib/format'
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

/** Never triage more than this in one refresh — first run on a big mailbox. */
const TRIAGE_BATCH = 40
const FEED_REFETCH_MS = 60_000

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

/**
 * The single source every agent surface reads from: the mailbox joined with
 * its verdicts, triaging anything that arrived since the last look.
 */
export function useAgentFeed() {
  const mail = useMailApi()
  const { getToken } = useAuth()
  const { data: me } = useMe()
  const myEmail = me?.mail ?? me?.userPrincipalName ?? ''

  return useQuery({
    queryKey: ['agent', 'feed', myEmail],
    enabled: Boolean(myEmail),
    refetchInterval: FEED_REFETCH_MS,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Obligation[]> => {
      const { conversations, ledger } = await mail.listAgentFeed()

      // Only conversations whose verdict is missing or stale cost a model call.
      const stale = conversations.filter((c) => {
        const rec = ledger.get(c.latest.id)
        if (!rec) return true
        return rec.hash !== hashOf({
          id: c.latest.id,
          count: c.count,
          receivedDateTime: c.latest.receivedDateTime,
        })
      })

      if (stale.length > 0) {
        const batch = stale.slice(0, TRIAGE_BATCH)
        const inputs = batch.map((c) => toTriageInput(c, myEmail))
        try {
          const token = await getToken()
          const records = await agentTransport.triage(inputs, token)
          const written: { id: string; record: LedgerRecord }[] = []
          records.forEach((rec, i) => {
            const conv = batch[i]
            if (!conv || !rec) return
            ledger.set(conv.latest.id, rec)
            written.push({ id: conv.latest.id, record: rec })
          })
          // Deliberately not awaited: the surface renders from the in-memory
          // ledger, and the write is only there so tomorrow is free.
          void persist(mail.graph, written)
        } catch (err) {
          // A dead worker must not take the mailbox down with it.
          console.error('[agent] triage failed', err)
        }
      }

      const out: Obligation[] = []
      for (const c of conversations) {
        const record = ledger.get(c.latest.id)
        if (!record) continue
        const sender = senderOf(c.latest)
        out.push({
          conversation: c,
          conversationId: c.conversationId,
          messageId: c.latest.id,
          record,
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
