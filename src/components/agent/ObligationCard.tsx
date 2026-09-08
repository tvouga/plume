import { useState } from 'react'
import { Check, Clock, FileText, Loader2, MessageSquare, MoonStar, Send, X } from 'lucide-react'
import { useReply } from '../../data/hooks'
import { useUpdateRecord } from '../../agent/hooks'
import type { Obligation } from '../../agent/types'
import type { Conversation } from '../../graph/types'
import { relativeTime, textToHtml } from '../../lib/format'
import { Avatar } from '../Avatar'

/** Tonight, so "snooze" means "ask me again after the meetings stop". */
function tonight(): string {
  const d = new Date()
  d.setHours(19, 0, 0, 0)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

function dueLabel(iso: string, now = new Date()): { text: string; late: boolean } {
  const due = new Date(iso)
  const ms = due.getTime() - now.getTime()
  const late = ms < 0
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  if (abs < 60 * 60_000) return { text: late ? `${m}m late` : `in ${m}m`, late }
  if (h < 24) return { text: late ? `${h}h late` : `in ${h}h ${m}m`, late }
  const d = Math.round(h / 24)
  return { text: late ? `${d}d late` : `in ${d}d`, late }
}

const STRIPE: Record<string, string> = {
  critical: 'bg-stake-crit',
  high: 'bg-stake-high',
  normal: 'bg-accent',
  low: 'bg-paper-sunk',
}

interface Props {
  obligation: Obligation
  onOpenThread: (conversation: Conversation) => void
  /** Compact variant used on the Runway, where space is the constraint. */
  compact?: boolean
}

/**
 * The atom both surfaces are built from. The headline is what someone needs
 * from you; the message is evidence underneath it. Nothing ever sends itself.
 */
export function ObligationCard({ obligation, onOpenThread, compact = false }: Props) {
  const { record } = obligation
  const update = useUpdateRecord()
  const reply = useReply()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(record.draft ?? '')
  const [sent, setSent] = useState(false)

  const due = record.dueAt ? dueLabel(record.dueAt) : null
  const stripe = STRIPE[record.stakes] ?? STRIPE.normal

  function patch(p: Parameters<typeof update.mutate>[0]['patch']) {
    update.mutate({ messageId: obligation.messageId, patch: p, current: record })
  }

  async function send() {
    const body = (editing ? draft : record.draft ?? '').trim()
    if (!body) return
    await reply.mutateAsync({ messageId: obligation.messageId, html: textToHtml(body) })
    setSent(true)
    patch({ needsReply: false, category: 'fyi' })
  }

  return (
    <article
      className={`relative overflow-hidden rounded-xl border bg-paper ${
        record.stakes === 'critical' ? 'border-stake-crit-line' : 'border-paper-sunk'
      } ${compact ? 'p-3' : 'p-4'}`}
    >
      <span className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-full ${stripe}`} />

      <header className="mb-2 flex items-center gap-2.5">
        <Avatar name={obligation.from} seed={obligation.fromEmail} email={obligation.fromEmail} size={compact ? 24 : 28} />
        <span className={`truncate font-semibold text-ink ${compact ? 'text-[12.5px]' : 'text-[13.5px]'}`}>
          {obligation.from}
        </span>
        <span className="ml-auto shrink-0 text-xs text-ink-faint">
          {relativeTime(obligation.receivedDateTime)}
        </span>
      </header>

      <p className={`mb-2.5 leading-snug text-ink ${compact ? 'text-sm' : 'text-[15.5px]'}`}>
        {record.ask || obligation.subject}
      </p>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {record.projectName && (
          <Chip tone="notion" href={record.projectUrl}>
            <FileText className="h-3 w-3" />
            {record.projectName}
          </Chip>
        )}
        {due && (
          <Chip tone={due.late ? 'crit' : 'high'}>
            <Clock className="h-3 w-3" />
            {due.text}
          </Chip>
        )}
        {obligation.threadCount > 1 && (
          <Chip>
            <MessageSquare className="h-3 w-3" />
            {obligation.threadCount}
          </Chip>
        )}
        {record.gates && !compact && <Chip>{record.gates}</Chip>}
      </div>

      {!compact && record.draft && !sent && (
        <div className="mb-2.5 rounded-lg border border-paper-sunk bg-paper-soft p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
            <span className="block h-1.5 w-1.5 rounded-sm bg-accent" />
            Draft — not sent
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-md border border-paper-sunk bg-paper p-2 text-[13.5px] leading-relaxed text-ink-soft outline-none focus:border-accent"
            />
          ) : (
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">
              {record.draft}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {sent ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-stake-calm-soft px-3 py-1.5 text-xs font-semibold text-stake-calm">
            <Check className="h-3.5 w-3.5" /> Sent
          </span>
        ) : (
          <>
            {record.draft && (
              <Btn primary onClick={send} disabled={reply.isPending}>
                {reply.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Btn>
            )}
            {record.draft && !compact && (
              <Btn onClick={() => setEditing((v) => !v)}>{editing ? 'Done' : 'Edit'}</Btn>
            )}
            <Btn onClick={() => onOpenThread(obligation.conversation)}>Open thread</Btn>
            {!compact && (
              <>
                <Btn onClick={() => patch({ snoozeUntil: tonight() })} title="Snooze until tonight">
                  <MoonStar className="h-3.5 w-3.5" />
                </Btn>
                <button
                  onClick={() => patch({ dismissed: true })}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-ink-faint transition hover:text-ink-muted"
                >
                  <X className="h-3.5 w-3.5" /> Not important
                </button>
              </>
            )}
          </>
        )}
      </div>
    </article>
  )
}

function Chip({
  children,
  tone,
  href,
}: {
  children: React.ReactNode
  tone?: 'notion' | 'crit' | 'high'
  href?: string
}) {
  const cls =
    tone === 'notion'
      ? 'bg-accent-soft text-accent-ink border-accent-soft'
      : tone === 'crit'
        ? 'bg-stake-crit-soft text-stake-crit border-stake-crit-line'
        : tone === 'high'
          ? 'bg-stake-high-soft text-stake-high border-stake-high-line'
          : 'bg-paper-soft text-ink-muted border-paper-sunk'
  const inner = (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] leading-none ${cls}`}>
      {children}
    </span>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="transition hover:opacity-80">
      {inner}
    </a>
  ) : (
    inner
  )
}

function Btn({
  children,
  primary,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        primary
          ? 'border-accent bg-accent font-semibold text-white hover:bg-accent-ink'
          : 'border-paper-sunk bg-paper text-ink-soft hover:bg-paper-soft'
      }`}
    >
      {children}
    </button>
  )
}
