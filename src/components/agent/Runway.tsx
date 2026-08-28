import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarX2, Loader2 } from 'lucide-react'
import { useAgentFeed, useDayEvents, useNow } from '../../agent/hooks'
import { agentConfigured } from '../../agent/transport'
import { gatingEvent, isHidden, needsYou, packLanes, waitingOn } from '../../agent/select'
import type { CalendarEvent, Obligation } from '../../agent/types'
import { ObligationCard } from './ObligationCard'
import { SetupHint } from './shared'
import type { Conversation } from '../../graph/types'

const CARD_W = 210
const CARD_H = 92
const LANE_GAP = 10
const EVENT_H = 28
const OWED_ROW = 38
const MIN_TRACK = 900

/** Widest the day can get. Beyond this, items go to the "beyond today" rail. */
const EARLIEST = 7
const LATEST = 20

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * The Runway: today as a strip, with obligations placed at the moment they come
 * due and tethered to the meeting they would wreck. Position carries meaning
 * here — that's the entire difference from the Brief.
 */
export function Runway({ onOpenThread }: { onOpenThread: (c: Conversation) => void }) {
  const now = useNow()
  const { data, isLoading } = useAgentFeed()
  const { data: events, isError: noCalendar } = useDayEvents(now)
  const [trackRef, width] = useWidth<HTMLDivElement>()
  const [openId, setOpenId] = useState<string | null>(null)

  const dayStart = useMemo(() => {
    const d = new Date(now)
    const firstEvent = events?.find((e) => !e.isAllDay)
    const h = firstEvent ? Math.min(EARLIEST + 1, new Date(firstEvent.start).getHours()) : EARLIEST + 1
    d.setHours(Math.max(EARLIEST, Math.min(h, now.getHours())), 0, 0, 0)
    return d
  }, [now, events])

  const dayEnd = useMemo(() => {
    const d = new Date(now)
    const lastEnd = events?.reduce(
      (max, e) => (e.isAllDay ? max : Math.max(max, new Date(e.end).getHours() + 1)),
      18,
    )
    d.setHours(Math.min(LATEST, Math.max(18, lastEnd ?? 18)), 0, 0, 0)
    return d
  }, [now, events])

  // Time -> pixels. Memoized so the placement pass below can depend on it
  // honestly instead of silently re-running on every render.
  const x = useCallback(
    (iso: string | number) => {
      const t = typeof iso === 'number' ? iso : new Date(iso).getTime()
      const span = dayEnd.getTime() - dayStart.getTime()
      return ((t - dayStart.getTime()) / span) * width
    },
    [dayStart, dayEnd, width],
  )

  const buckets = useMemo(() => {
    const all: Obligation[] = (data ?? []).filter((o) => !isHidden(o, now))
    const live = needsYou(all, now)
    const overdue: Obligation[] = []
    const today: Obligation[] = []
    const later: Obligation[] = []
    const undated: Obligation[] = []
    for (const o of live) {
      if (!o.record.dueAt) {
        undated.push(o)
        continue
      }
      const t = new Date(o.record.dueAt).getTime()
      if (t < dayStart.getTime() || t < now.getTime()) overdue.push(o)
      else if (t > dayEnd.getTime()) later.push(o)
      else today.push(o)
    }
    return { overdue, today, later, undated, waiting: waitingOn(all, now) }
  }, [data, now, dayStart, dayEnd])

  const placed = useMemo(() => {
    if (width <= 0) return []
    const items = buckets.today.map((o) => {
      const cx = x(o.record.dueAt as string)
      const left = Math.max(0, Math.min(width - CARD_W, cx - CARD_W / 2))
      return { obligation: o, cx, left }
    })
    const lanes = packLanes(items, (i) => ({ left: i.left, right: i.left + CARD_W }), 8)
    return items.map((i, idx) => ({ ...i, lane: lanes[idx] }))
  }, [buckets.today, width, x])

  const laneCount = placed.reduce((n, p) => Math.max(n, p.lane + 1), 0)
  const aboveH = Math.max(1, laneCount) * (CARD_H + LANE_GAP)
  const spineY = aboveH + 6
  const eventY = spineY + 28
  const owedTop = eventY + EVENT_H + 22
  const owedRows = Math.min(4, buckets.waiting.length)
  const trackH = owedTop + 20 + Math.max(1, owedRows) * OWED_ROW + 10

  const hours = useMemo(() => {
    const out: Date[] = []
    for (let h = dayStart.getHours(); h <= dayEnd.getHours(); h++) {
      const d = new Date(dayStart)
      d.setHours(h, 0, 0, 0)
      out.push(d)
    }
    return out
  }, [dayStart, dayEnd])

  const nowX = x(now.getTime())
  const nextDeadline = buckets.today[0]?.record.dueAt

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-ink-faint">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-paper-sunk px-6 py-3.5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {now.toLocaleDateString(undefined, { weekday: 'long' })}{' '}
            <span className="font-normal text-ink-faint tabular-nums">
              {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {nextDeadline ? (
              <>
                Next hard deadline{' '}
                <b className="font-semibold text-stake-crit">{relativeShort(nextDeadline, now)}</b>
              </>
            ) : (
              'Nothing with a deadline left today'
            )}
            <span className="mx-1.5 text-ink-faint">·</span>
            {buckets.overdue.length} already late
            <span className="mx-1.5 text-ink-faint">·</span>
            {buckets.waiting.length} owed to you
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {!agentConfigured && (
          <div className="px-6 pt-5">
            <SetupHint />
          </div>
        )}
        {noCalendar && (
          <div className="mx-6 mt-5 flex items-center gap-2 rounded-xl border border-stake-high-line bg-stake-high-soft px-4 py-2.5 text-[13px] text-stake-high">
            <CalendarX2 className="h-4 w-4 shrink-0" />
            Calendar unavailable — sign out and back in to grant <code>Calendars.Read</code>. The
            runway still plots deadlines; it just can&rsquo;t show what they block.
          </div>
        )}

        <div className="flex" style={{ minWidth: MIN_TRACK }}>
          {/* Behind you: everything already late, permanently in view. */}
          <aside className="w-[168px] shrink-0 border-r border-dashed border-paper-sunk bg-paper-soft p-3">
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-stake-crit">
              ◀ Already late
            </div>
            {buckets.overdue.length === 0 ? (
              <p className="text-[11.5px] leading-relaxed text-ink-faint">Nothing overdue.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {buckets.overdue.slice(0, 4).map((o) => (
                  <button
                    key={o.messageId}
                    onClick={() => setOpenId(o.messageId)}
                    className="rounded-lg border border-stake-crit-line bg-paper p-2 text-left transition hover:bg-stake-crit-soft"
                  >
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-stake-crit">
                      {relativeShort(o.record.dueAt as string, now)}
                    </div>
                    <div className="mt-1 line-clamp-3 text-[11.5px] font-semibold leading-snug text-ink">
                      {o.record.ask || o.subject}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* The day itself. */}
          <div ref={trackRef} className="relative flex-1" style={{ height: trackH }}>
            {width > 0 && (
              <>
                {/* spine + hours */}
                <div className="absolute left-0 right-0 h-px bg-paper-sunk" style={{ top: spineY }} />
                {hours.map((h) => (
                  <div key={h.toISOString()}>
                    <div
                      className="absolute w-px bg-paper-sunk"
                      style={{ left: x(h.getTime()), top: spineY - 6, height: 7 }}
                    />
                    <div
                      className="absolute -translate-x-1/2 text-[10px] tabular-nums text-ink-faint"
                      style={{ left: x(h.getTime()), top: spineY + 8 }}
                    >
                      {h.getHours().toString().padStart(2, '0')}
                    </div>
                  </div>
                ))}

                {/* the part of today already spent */}
                <div
                  className="absolute top-0 bg-ink/[0.025]"
                  style={{ left: 0, width: Math.max(0, nowX), bottom: 0 }}
                />

                {/* meetings */}
                {(events ?? [])
                  .filter((e) => !e.isAllDay)
                  .map((e) => {
                    const left = x(e.start)
                    const w = Math.max(66, x(e.end) - left)
                    if (left > width || left + w < 0) return null
                    const gated = placed.some(
                      (p) => gatingEvent(p.obligation, events ?? [])?.id === e.id,
                    )
                    return (
                      <div
                        key={e.id}
                        title={e.subject}
                        className={`absolute flex items-center overflow-hidden whitespace-nowrap rounded-md border px-2 text-[11.5px] font-semibold ${
                          gated
                            ? 'border-accent bg-accent text-white'
                            : 'border-accent-soft bg-accent-soft text-accent-ink'
                        }`}
                        style={{ left, width: w, top: eventY, height: EVENT_H }}
                      >
                        {e.subject}
                      </div>
                    )
                  })}

                {/* obligations, tethered down to what they gate */}
                {placed.map(({ obligation, cx, left, lane }) => {
                  const top = spineY - (lane + 1) * (CARD_H + LANE_GAP)
                  const gate = gatingEvent(obligation, events ?? [])
                  const tetherTop = top + CARD_H
                  const tetherEnd = gate ? eventY : spineY
                  const hot = obligation.record.stakes === 'critical'
                  return (
                    <div key={obligation.messageId}>
                      <div
                        className="absolute w-px"
                        style={{
                          left: cx,
                          top: tetherTop,
                          height: Math.max(0, tetherEnd - tetherTop),
                          backgroundImage: `repeating-linear-gradient(to bottom, ${
                            hot ? '#e08098' : '#b9b3d9'
                          } 0 3px, transparent 3px 6px)`,
                        }}
                      />
                      <div
                        className={`absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ${
                          hot ? 'bg-stake-crit' : 'bg-accent'
                        }`}
                        style={{ left: cx, top: tetherEnd }}
                      />
                      <button
                        onClick={() => setOpenId(obligation.messageId)}
                        className={`absolute overflow-hidden rounded-xl border bg-paper p-2.5 text-left shadow-soft transition hover:shadow-pop ${
                          hot ? 'border-stake-crit-line' : 'border-paper-sunk'
                        }`}
                        style={{ left, top, width: CARD_W, height: CARD_H }}
                      >
                        <div
                          className={`truncate text-[9.5px] font-bold uppercase tracking-wider ${
                            hot ? 'text-stake-crit' : 'text-stake-high'
                          }`}
                        >
                          {relativeShort(obligation.record.dueAt as string, now)}
                          {gate && ` · gates ${gate.subject}`}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[12.5px] font-semibold leading-snug text-ink">
                          {obligation.record.ask || obligation.subject}
                        </div>
                        <div className="mt-1 truncate text-[11px] text-ink-muted">
                          {obligation.from}
                          {obligation.record.projectName && ` · ${obligation.record.projectName}`}
                        </div>
                      </button>
                    </div>
                  )
                })}

                {/* owed to you, growing rightward to now */}
                <div
                  className="absolute left-3 text-[10px] font-bold uppercase tracking-widest text-ink-muted"
                  style={{ top: owedTop }}
                >
                  Owed to you ▶
                </div>
                {buckets.waiting.slice(0, 4).map((w, i) => {
                  const bad = w.ageDays >= 5
                  return (
                    <button
                      key={w.commitment.id}
                      onClick={() => onOpenThread(w.obligation.conversation)}
                      className={`absolute flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-r-lg border border-l-0 px-3 text-[11.5px] transition hover:brightness-[0.98] ${
                        bad
                          ? 'border-stake-crit-line bg-stake-crit-soft text-stake-crit'
                          : 'border-stake-high-line bg-stake-high-soft text-stake-high'
                      }`}
                      style={{
                        left: 0,
                        width: Math.max(90, nowX),
                        top: owedTop + 20 + i * OWED_ROW,
                        height: 32,
                      }}
                    >
                      <span className="truncate font-medium text-ink-soft">
                        <b className="font-semibold text-ink">{w.commitment.counterparty}</b> ·{' '}
                        {w.commitment.what}
                      </span>
                      <span className="ml-auto shrink-0 font-bold tabular-nums">{w.ageDays}d</span>
                    </button>
                  )
                })}

                {/* now */}
                <div className="absolute top-0 z-10 w-0.5 bg-accent/85" style={{ left: nowX, bottom: 0 }} />
                <div
                  className="absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold tracking-wide text-white"
                  style={{ left: nowX, top: -2 }}
                >
                  NOW
                </div>
              </>
            )}
          </div>

          {/* Beyond today. */}
          <aside className="w-[180px] shrink-0 border-l border-dashed border-paper-sunk bg-paper-soft p-3">
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-ink-faint">
              Beyond today
            </div>
            {buckets.later.length === 0 ? (
              <p className="text-[11.5px] leading-relaxed text-ink-faint">Nothing dated yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {buckets.later.slice(0, 5).map((o) => (
                  <button
                    key={o.messageId}
                    onClick={() => setOpenId(o.messageId)}
                    className="rounded-lg border border-paper-sunk bg-paper p-2 text-left transition hover:bg-paper-soft"
                  >
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-stake-high">
                      {new Date(o.record.dueAt as string).toLocaleDateString(undefined, {
                        weekday: 'short',
                      })}
                    </div>
                    <div className="mt-1 line-clamp-3 text-[11.5px] font-semibold leading-snug text-ink">
                      {o.record.ask || o.subject}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>

        <IfYouDoNothing items={[...buckets.overdue, ...buckets.today]} events={events ?? []} now={now} />

        {buckets.undated.length > 0 && (
          <section className="border-t border-paper-sunk px-6 py-4">
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
              No fixed time · {buckets.undated.length}
            </h2>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {buckets.undated.slice(0, 8).map((o) => (
                <div key={o.messageId} className="w-[260px] shrink-0">
                  <ObligationCard obligation={o} onOpenThread={onOpenThread} compact />
                </div>
              ))}
            </div>
          </section>
        )}

        {openId && (
          <OpenCard
            obligation={(data ?? []).find((o) => o.messageId === openId)}
            onClose={() => setOpenId(null)}
            onOpenThread={onOpenThread}
          />
        )}
      </div>
    </div>
  )
}

/** The forecast, not a summary: what actually breaks if today goes unattended. */
function IfYouDoNothing({
  items,
  events,
  now,
}: {
  items: Obligation[]
  events: CalendarEvent[]
  now: Date
}) {
  const top = items.filter((o) => o.record.stakes !== 'low').slice(0, 3)
  if (top.length === 0) return null
  return (
    <div className="flex flex-wrap border-t border-paper-sunk bg-paper-soft">
      <div className="w-[168px] shrink-0 px-4 py-3.5 text-[10.5px] font-bold uppercase leading-snug tracking-widest text-ink-muted">
        If you do
        <br />
        nothing
      </div>
      {top.map((o) => {
        const gate = gatingEvent(o, events)
        return (
          <div
            key={o.messageId}
            className="flex min-w-[220px] flex-1 items-start gap-2.5 border-l border-paper-sunk px-4 py-3.5"
          >
            <span
              className={`mt-1.5 block h-[7px] w-[7px] shrink-0 rounded-full ${
                o.record.stakes === 'critical' ? 'bg-stake-crit' : 'bg-stake-high'
              }`}
            />
            <div className="min-w-0 text-[12.5px] leading-snug text-ink-soft">
              <b className="block font-semibold text-ink">
                {o.record.gates || `${o.from} gets no answer`}
              </b>
              <span className="text-[11px] text-ink-faint">
                {o.record.dueAt ? relativeShort(o.record.dueAt, now) : 'no date given'}
                {gate && ` · before ${gate.subject}`}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** A tethered card opens into the full Brief card, rather than navigating away. */
function OpenCard({
  obligation,
  onClose,
  onOpenThread,
}: {
  obligation?: Obligation
  onClose: () => void
  onOpenThread: (c: Conversation) => void
}) {
  if (!obligation) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/20 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg animate-pop-in rounded-2xl bg-paper p-1 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <ObligationCard obligation={obligation} onOpenThread={onOpenThread} />
      </div>
    </div>
  )
}

function relativeShort(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime()
  const late = ms < 0
  const abs = Math.abs(ms)
  const mins = Math.round(abs / 60_000)
  if (mins < 60) return late ? `${mins}m late` : `in ${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return late ? `${h}h late` : `in ${h}h ${mins % 60}m`
  const d = Math.round(h / 24)
  return late ? `${d}d late` : `in ${d}d`
}
