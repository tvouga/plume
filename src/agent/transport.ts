import type { Atlas, LedgerRecord, TriageInput } from './types'
import { heuristicTriage } from './heuristics'

/**
 * Everything the agent layer needs from the outside world sits behind this
 * interface, so the UI never knows whether a model was involved. Two
 * implementations ship: the worker, and a local heuristic baseline.
 */
export interface AgentTransport {
  /** Whether a real model is reachable. Surfaces show a setup hint when false. */
  readonly kind: 'worker' | 'heuristic'
  triage(inputs: TriageInput[], token: string): Promise<LedgerRecord[]>
  deepen(input: DeepenInput, token: string): Promise<Partial<LedgerRecord>>
  atlas(token: string): Promise<Atlas | null>
}

export interface DeepenInput {
  messageId: string
  conversationId: string
  subject: string
  /** Oldest first, already sanitized to text. */
  thread: { from: string; sentAt: string; text: string; fromMe: boolean }[]
  myName: string
  myEmail: string
}

const BASE = (import.meta.env.VITE_AGENT_URL as string | undefined)?.replace(/\/$/, '')

class WorkerTransport implements AgentTransport {
  readonly kind = 'worker' as const
  private readonly base: string
  constructor(base: string) {
    this.base = base
  }

  private async post<T>(path: string, body: unknown, token: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText)
      throw new Error(`agent ${path} failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }

  triage(inputs: TriageInput[], token: string) {
    return this.post<LedgerRecord[]>('/api/agent/triage', { inputs }, token)
  }

  deepen(input: DeepenInput, token: string) {
    return this.post<Partial<LedgerRecord>>('/api/agent/deepen', input, token)
  }

  async atlas(token: string): Promise<Atlas | null> {
    const res = await fetch(`${this.base}/api/agent/atlas`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return (await res.json()) as Atlas
  }
}

/**
 * No worker configured. Plume still triages — just with rules instead of a
 * model, and with no Notion context. Every surface works; it's simply blunter.
 */
class HeuristicTransport implements AgentTransport {
  readonly kind = 'heuristic' as const
  async triage(inputs: TriageInput[]) {
    const now = new Date()
    return inputs.map((i) => heuristicTriage(i, now))
  }
  async deepen() {
    return {}
  }
  async atlas() {
    return null
  }
}

export const agentTransport: AgentTransport = BASE
  ? new WorkerTransport(BASE)
  : new HeuristicTransport()

export const agentConfigured = Boolean(BASE)
