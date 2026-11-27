import { useEffect, useState } from 'react'
import { FileText, Loader2, Sparkles } from 'lucide-react'
import { useConnectNotion, useDisconnectNotion, useNotionStatus } from '../../agent/hooks'
import { agentConfigured } from '../../agent/transport'

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

/**
 * Notion lives in the account menu, not on the page: each person connects
 * their own, and the agent only ever sees what they can. Nothing renders
 * without a worker to hold the connection.
 */
export function NotionMenuItem({ onDone }: { onDone: () => void }) {
  const { data: status } = useNotionStatus()
  const connect = useConnectNotion()
  const disconnect = useDisconnectNotion()
  if (!agentConfigured || !status) return null

  const row =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-paper-soft disabled:opacity-60'
  return status.connected ? (
    <button
      className={row}
      disabled={disconnect.isPending}
      onClick={() => disconnect.mutate(undefined, { onSettled: onDone })}
      title={status.notionUser ? `Connected as ${status.notionUser}` : undefined}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Disconnect Notion</span>
      {status.workspaceName && <span className="shrink-0 text-xs text-ink-faint">{status.workspaceName}</span>}
    </button>
  ) : (
    <button className={row} disabled={connect.isPending} onClick={() => connect.mutate()}>
      {connect.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <FileText className="h-4 w-4 shrink-0" />}
      Connect Notion
    </button>
  )
}

/**
 * The one moment Notion earns screen space: coming back from its consent
 * screen. A small toast that clears itself, and the query string with it.
 */
export function NotionReturnToast() {
  const [flash, setFlash] = useState(readNotionOutcome)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('notion')) {
      params.delete('notion')
      params.delete('reason')
      const qs = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    }
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 6000)
    return () => clearTimeout(id)
  }, [flash])
  if (!flash) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <Flash {...flash} />
    </div>
  )
}

function readNotionOutcome(): { tone: 'ok' | 'warn'; text: string } | null {
  const params = new URLSearchParams(window.location.search)
  const outcome = params.get('notion')
  if (!outcome) return null
  if (outcome === 'connected') {
    return { tone: 'ok', text: 'Notion connected. The next triage will use your pages.' }
  }
  if (outcome === 'cancelled') {
    return { tone: 'warn', text: 'Notion connection cancelled — nothing was shared.' }
  }
  return { tone: 'warn', text: `Notion didn't connect: ${params.get('reason') || 'unknown error'}` }
}

function Flash({ tone, text }: { tone: 'ok' | 'warn'; text: string }) {
  return (
    <p
      className={`rounded-lg px-3 py-2 text-[12.5px] shadow-soft ${
        tone === 'ok' ? 'bg-stake-calm-soft text-stake-calm' : 'bg-stake-high-soft text-stake-high'
      }`}
    >
      {text}
    </p>
  )
}
