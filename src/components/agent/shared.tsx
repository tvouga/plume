import { Sparkles } from 'lucide-react'

export function SectionHead({
  title,
  count,
  hint,
}: {
  title: string
  count?: number
  hint?: string
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h2>
      <span className="h-px flex-1 bg-paper-sunk" />
      <span className="text-[11px] tabular-nums text-ink-faint">{hint ?? count}</span>
    </div>
  )
}

/** Shown until VITE_AGENT_URL points at a deployed worker. */
export function SetupHint() {
  return (
    <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-accent-soft bg-accent-soft px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />
      <p className="text-[13px] leading-relaxed text-accent-ink">
        <b className="font-semibold">Running on rules, not a model.</b> Triage, deadlines and
        commitments below come from local heuristics — no Notion context and no drafts. Deploy the
        worker and set <code className="rounded bg-paper/70 px-1 py-0.5 text-[11.5px]">VITE_AGENT_URL</code> to
        turn on the real thing.
      </p>
    </div>
  )
}
