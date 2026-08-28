import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../auth/AuthContext'
import { Brief } from '../components/agent/Brief'
import { Runway } from '../components/agent/Runway'
import { demoEvents, demoObligations } from './fixtures'

/**
 * A dev-only route (`/?demo`) that renders both agent surfaces against
 * fixtures, so the layouts can be worked on without a Microsoft tenant, an
 * Azure app registration, or a deployed worker. Never reachable in normal use.
 */
export function Demo() {
  const [view, setView] = useState<'brief' | 'runway'>('runway')

  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false },
      },
    })
    const email = 'you@example.com'
    qc.setQueryData(['me'], { id: 'me', displayName: 'You', mail: email, userPrincipalName: email })
    qc.setQueryData(['me', 'photo'], null)
    qc.setQueryData(['agent', 'feed', email], demoObligations)

    // The events query keys off midnight today, exactly as the hook computes it.
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    qc.setQueryData(['agent', 'events', start.toISOString()], demoEvents)
    return qc
  })

  const noop = () => {}

  return (
    <QueryClientProvider client={client}>
      {/* The surfaces still call useMailApi() even though every query is
          pre-seeded, so the auth context has to exist. It is never used. */}
      <AuthProvider>
      <div className="flex h-full flex-col bg-paper-soft">
        <div className="flex shrink-0 items-center gap-3 border-b border-paper-sunk bg-paper px-4 py-2.5">
          <span className="text-[13px] font-semibold text-ink">🪶 Plume — demo fixtures</span>
          <span className="rounded-full bg-stake-high-soft px-2 py-0.5 text-[11px] font-semibold text-stake-high">
            no mailbox connected
          </span>
          <div className="ml-auto flex gap-1">
            {(['brief', 'runway'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition ${
                  view === v ? 'bg-ink text-white' : 'text-ink-muted hover:bg-paper-soft'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-paper">
          {view === 'brief' ? (
            <div className="h-full overflow-y-auto">
              <Brief onOpenThread={noop} />
            </div>
          ) : (
            <Runway onOpenThread={noop} />
          )}
        </div>
      </div>
      </AuthProvider>
    </QueryClientProvider>
  )
}
