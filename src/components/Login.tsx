import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

function Feather({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  )
}

export function Login() {
  const { signIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    setBusy(true)
    setError(null)
    try {
      await signIn()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Sign-in was cancelled or failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-paper-soft px-6">
      <div className="w-full max-w-sm animate-fade-in text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-soft">
          <Feather className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Plume</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          Your work email, as light as a conversation.
        </p>

        <button
          onClick={handle}
          disabled={busy}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-ink px-4 py-3 text-[15px] font-medium text-white shadow-soft transition active:scale-[0.99] disabled:opacity-60"
        >
          <MicrosoftMark />
          {busy ? 'Opening Microsoft…' : 'Sign in with Microsoft'}
        </button>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <p className="mt-8 text-xs leading-relaxed text-ink-faint">
          Plume talks directly to Microsoft. Your mail never passes through any
          other server.
        </p>
      </div>
    </div>
  )
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" className="h-[18px] w-[18px]" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
