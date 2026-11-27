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
 * Notion is connected per person, so every user grants their own access and
 * the agent only ever sees what they can. Renders nothing without a worker.
 */
export function NotionConnection() {
  const { data: status, isLoading } = useNotionStatus()
  const connect = useConnectNotion()
  const disconnect = useDisconnectNotion()
  // Notion sends the browser back through the worker with the outcome in the
  // query string. Read it once at mount, then strip it so a refresh can't replay it.
  const [flash] = useState(readNotionOutcome)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('notion')) return
    params.delete('notion')
    params.delete('reason')
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [])

  if (!agentConfigured || isLoading || !status) return flash ? <Flash {...flash} /> : null

  return (
    <div className="mb-6 flex flex-col gap-2">
      {flash && <Flash {...flash} />}
      {status.connected ? (
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-muted">
          <FileText className="h-3.5 w-3.5 text-accent-ink" />
          Notion connected
          {status.workspaceName && <> · <b className="font-medium text-ink-soft">{status.workspaceName}</b></>}
          {status.notionUser && <> as {status.notionUser}</>}
          <button
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="ml-1 text-ink-faint underline-offset-2 transition hover:text-ink-muted hover:underline"
          >
            Disconnect
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-paper-sunk bg-paper px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-accent-ink" />
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-soft">
            <b className="font-semibold text-ink">Connect your Notion</b> so triage knows your projects.
            You pick the pages; it sees only what you already can.
          </p>
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
          >
            {connect.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Connect Notion
          </button>
          {connect.error && (
            <p className="w-full text-xs text-stake-crit">{(connect.error as Error).message}</p>
          )}
        </div>
      )}
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
      className={`rounded-lg px-3 py-2 text-[12.5px] ${
        tone === 'ok' ? 'bg-stake-calm-soft text-stake-calm' : 'bg-stake-high-soft text-stake-high'
      }`}
    >
      {text}
    </p>
  )
}
