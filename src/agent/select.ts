import type { CalendarEvent, Commitment, Obligation } from './types'

/** Snoozed until later, or explicitly dismissed — invisible on every surface. */
export function isHidden(o: Obligation, now: Date): boolean {
  if (o.record.dismissed) return true
  return Boolean(o.record.snoozeUntil && new Date(o.record.snoozeUntil) > now)
}

/** Things that are actually yours to do, hottest first. */
export function needsYou(obligations: Obligation[], now: Date): Obligation[] {
  return obligations
    .filter((o) => !isHidden(o, now))
    .filter((o) => o.record.category === 'action' || o.record.category === 'reply')
    .sort((a, b) => {
      // A real deadline always outranks a high score without one.
      const ad = a.record.dueAt ? new Date(a.record.dueAt).getTime() : Infinity
      const bd = b.record.dueAt ? new Date(b.record.dueAt).getTime() : Infinity
      if (ad !== bd) return ad - bd
      return b.record.importance - a.record.importance
    })
}

export interface WaitingItem {
  obligation: Obligation
  commitment: Commitment
  /** Whole days since the promise was made. */
  ageDays: number
}

/** What you're owed, longest-silent first. The ball someone else is holding. */
export function waitingOn(obligations: Obligation[], now: Date): WaitingItem[] {
  const out: WaitingItem[] = []
  for (const o of obligations) {
    if (o.record.dismissed) continue
    for (const c of o.record.commitments) {
      if (c.direction !== 'owed-to-you' || c.state !== 'open') continue
      out.push({
        obligation: o,
        commitment: c,
        ageDays: Math.floor((now.getTime() - new Date(c.promisedAt).getTime()) / 86_400_000),
      })
    }
  }
  return out.sort((a, b) => b.ageDays - a.ageDays)
}

/** Commitments you made that are still open — the Runway's "you owe" lane. */
export function youOwe(obligations: Obligation[]): { obligation: Obligation; commitment: Commitment }[] {
  const out: { obligation: Obligation; commitment: Commitment }[] = []
  for (const o of obligations) {
    if (o.record.dismissed) continue
    for (const c of o.record.commitments) {
      if (c.direction === 'you-owe' && c.state === 'open') out.push({ obligation: o, commitment: c })
    }
  }
  return out
}

export interface ProjectGroup {
  id: string
  name: string
  url?: string
  obligations: Obligation[]
  needsYouCount: number
}

/** Collapse mail along the Notion axis instead of the chronological one. */
export function byProject(obligations: Obligation[], now: Date): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>()
  for (const o of obligations) {
    const id = o.record.projectId
    if (!id || isHidden(o, now)) continue
    let g = groups.get(id)
    if (!g) {
      g = { id, name: o.record.projectName ?? 'Untitled', url: o.record.projectUrl, obligations: [], needsYouCount: 0 }
      groups.set(id, g)
    }
    g.obligations.push(o)
    if (o.record.category === 'action' || o.record.category === 'reply') g.needsYouCount++
  }
  return [...groups.values()].sort((a, b) => b.needsYouCount - a.needsYouCount || b.obligations.length - a.obligations.length)
}

/** Everything the agent dealt with, bucketed for the digest. */
export function handled(obligations: Obligation[], now: Date): { key: string; label: string; items: Obligation[] }[] {
  const buckets: Record<string, { label: string; items: Obligation[] }> = {
    snoozed: { label: 'Snoozed for later', items: [] },
    fyi: { label: 'Read, nothing needed', items: [] },
    noise: { label: 'Filed without you', items: [] },
  }
  for (const o of obligations) {
    if (o.record.snoozeUntil && new Date(o.record.snoozeUntil) > now) buckets.snoozed.items.push(o)
    else if (o.record.dismissed || o.record.category === 'noise') buckets.noise.items.push(o)
    else if (o.record.category === 'fyi') buckets.fyi.items.push(o)
  }
  return Object.entries(buckets)
    .filter(([, b]) => b.items.length > 0)
    .map(([key, b]) => ({ key, label: b.label, items: b.items }))
}

/** The meeting an obligation would wreck, if any. Powers the Runway tethers. */
export function gatingEvent(o: Obligation, events: CalendarEvent[]): CalendarEvent | undefined {
  if (!o.record.dueAt) return undefined
  const due = new Date(o.record.dueAt).getTime()
  // The first meeting starting at or just after the deadline is what it feeds.
  return events
    .filter((e) => !e.isAllDay)
    .find((e) => {
      const start = new Date(e.start).getTime()
      return start >= due - 30 * 60_000 && start <= due + 90 * 60_000
    })
}

/**
 * Stack items into rows so none overlap horizontally. Straightforward interval
 * packing — without it, two deadlines an hour apart draw on top of each other.
 */
export function packLanes<T>(items: T[], extent: (t: T) => { left: number; right: number }, gap = 1): number[] {
  const rowEnds: number[] = []
  const lanes: number[] = []
  const order = items.map((_, i) => i).sort((a, b) => extent(items[a]).left - extent(items[b]).left)
  const byIndex = new Array<number>(items.length).fill(0)
  for (const i of order) {
    const { left, right } = extent(items[i])
    let row = rowEnds.findIndex((end) => left >= end + gap)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(right)
    } else {
      rowEnds[row] = right
    }
    byIndex[i] = row
  }
  lanes.push(...byIndex)
  return lanes
}
