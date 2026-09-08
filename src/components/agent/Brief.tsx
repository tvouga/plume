import { useMemo } from 'react'
import { AlertCircle, FileText, Inbox, Loader2, Sparkles } from 'lucide-react'
import { useAgentFeed, useNow } from '../../agent/hooks'
import { agentConfigured } from '../../agent/transport'
import { byProject, handled, needsYou, waitingOn } from '../../agent/select'
import type { Obligation } from '../../agent/types'
import { ObligationCard } from './ObligationCard'
import { SectionHead, SetupHint } from './shared'
import { Avatar } from '../Avatar'
import type { Conversation } from '../../graph/types'
import { relativeTime } from '../../lib/format'

function greeting(d: Date): string {
  const day = d.toLocaleDateString(undefined, { weekday: 'long' })
  const h = d.getHours()
  return `${day} ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}`
}

/**
 * The Brief: obligations grouped by what they demand of you. Deliberately not
 * a re-sorted inbox — the raw stream stays exactly where it was.
 */
export function Brief({ onOpenThread }: { onOpenThread: (c: Conversation) => void }) {
  const { data, isLoading, isFetching } = useAgentFeed()
  const now = useNow()

  const groups = useMemo(() => {
    const all: Obligation[] = data ?? []
    return {
      needs: needsYou(all, now),
      waiting: waitingOn(all, now),
      projects: byProject(all, now),
      done: handled(all, now),
    }
  }, [data, now])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-ink-faint">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const handledCount = groups.done.reduce((n, b) => n + b.items.length, 0)

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-7">
      <header className="mb-7">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-ink">
          {greeting(now)}
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
        </h1>
        <p className="mt-1.5 text-[14.5px] text-ink-muted">
          <b className="font-semibold text-ink">{groups.needs.length}</b> need you
          <span className="mx-1.5 text-ink-faint">·</span>
          <b className="font-semibold text-ink">{groups.waiting.length}</b> you&rsquo;re owed
          <span className="mx-1.5 text-ink-faint">·</span>
          {handledCount} handled without you
        </p>
      </header>

      {!agentConfigured && <SetupHint />}

      {groups.needs.length > 0 && (
        <section className="mb-7">
          <SectionHead title="Needs you" count={groups.needs.length} />
          <div className="flex flex-col gap-2.5">
            {groups.needs.slice(0, 8).map((o) => (
              <ObligationCard key={o.messageId} obligation={o} onOpenThread={onOpenThread} />
            ))}
          </div>
        </section>
      )}

      {groups.needs.length === 0 && (
        <div className="mb-7 flex flex-col items-center rounded-xl border border-paper-sunk bg-paper px-8 py-10 text-center">
          <Sparkles className="h-8 w-8 text-stake-calm" />
          <p className="mt-3 text-[15px] font-medium text-ink">Nothing needs you.</p>
          <p className="mt-1 text-sm text-ink-muted">Everything that arrived has been handled or is waiting on someone else.</p>
        </div>
      )}

      {groups.waiting.length > 0 && (
        <section className="mb-7">
          <SectionHead title="You're waiting on" count={groups.waiting.length} />
          <div className="flex flex-col gap-1.5">
            {groups.waiting.map(({ obligation, commitment, ageDays }) => (
              <button
                key={commitment.id}
                onClick={() => onOpenThread(obligation.conversation)}
                className="flex items-center gap-2.5 rounded-xl border border-paper-sunk bg-paper px-3 py-2.5 text-left transition hover:bg-paper-soft"
              >
                <Avatar
                  name={commitment.counterparty}
                  seed={commitment.counterpartyEmail ?? commitment.counterparty}
                  email={commitment.counterpartyEmail}
                  size={28}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {commitment.counterparty} — {commitment.what}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    promised {relativeTime(commitment.promisedAt)}
                    {commitment.dueAt ? ' · had a date' : ' · no date given'}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11.5px] font-semibold tabular-nums ${
                    ageDays >= 5
                      ? 'bg-stake-crit-soft text-stake-crit'
                      : 'bg-stake-high-soft text-stake-high'
                  }`}
                >
                  {ageDays}d
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {groups.projects.length > 0 && (
        <section className="mb-7">
          <SectionHead title="By project" hint="from Notion" />
          <div className="flex flex-col gap-1.5">
            {groups.projects.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-xl border border-paper-sunk bg-paper px-3 py-2.5 transition hover:bg-paper-soft"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                  {p.name}
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">
                  {p.obligations.length} threads
                  {p.needsYouCount > 0 && (
                    <b className="ml-1.5 font-semibold text-accent">{p.needsYouCount} need you</b>
                  )}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {groups.done.length > 0 && (
        <section className="mb-4">
          <SectionHead title="Handled without you" count={handledCount} />
          <div className="overflow-hidden rounded-xl border border-paper-sunk bg-paper">
            {groups.done.map((b) => (
              <div
                key={b.key}
                className="flex items-center gap-2.5 border-b border-paper-sunk px-3 py-2 last:border-b-0"
              >
                <span className="w-[104px] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  {b.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">
                  {b.items.slice(0, 3).map((o) => o.from).join(' · ')}
                  {b.items.length > 3 && ` +${b.items.length - 3} more`}
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">
                  {b.items.length}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(data?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center py-16 text-center text-ink-faint">
          <Inbox className="h-9 w-9" />
          <p className="mt-3 text-sm font-medium text-ink-muted">Nothing in the mailbox yet.</p>
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Nothing here sends itself. Snoozed items return tomorrow; &ldquo;not important&rdquo; is
        remembered and teaches the next triage.
      </p>
    </div>
  )
}
