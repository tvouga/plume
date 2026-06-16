import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useSendNew } from '../data/hooks'
import { textToHtml } from '../lib/format'

export function NewMessageModal({ onClose }: { onClose: () => void }) {
  const send = useSendNew()
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSend = to.trim().length > 0 && !send.isPending

  async function handleSend() {
    if (!canSend) return
    setError(null)
    try {
      await send.mutateAsync({
        to,
        cc: cc.trim() || undefined,
        subject: subject.trim() || '(no subject)',
        html: textToHtml(body),
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl animate-pop-in flex-col overflow-hidden rounded-t-2xl bg-paper shadow-pop sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-paper-sunk px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">New message</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-sunk"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-col divide-y divide-paper-sunk">
          <Field label="To">
            <input
              autoFocus
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@company.com"
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="ml-2 shrink-0 text-xs font-medium text-accent"
              >
                Cc
              </button>
            )}
          </Field>
          {showCc && (
            <Field label="Cc">
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
              />
            </Field>
          )}
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            />
          </Field>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          className="min-h-[180px] flex-1 resize-none px-4 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        />

        {error && (
          <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <footer className="flex items-center justify-end gap-2 border-t border-paper-sunk px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-ink-muted transition hover:bg-paper-sunk"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-50"
          >
            {send.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center px-4 py-3">
      <span className="w-14 shrink-0 text-sm font-medium text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  )
}
