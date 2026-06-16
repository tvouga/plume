import { useState } from 'react'
import { X, Loader2, Forward, Paperclip } from 'lucide-react'
import { useForward } from '../data/hooks'
import type { Message } from '../graph/types'
import { cleanPreview, displayName, senderOf, subjectOf } from '../lib/format'

export function ForwardModal({
  message,
  onClose,
}: {
  message: Message
  onClose: () => void
}) {
  const forward = useForward()
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSend = to.trim().length > 0 && !forward.isPending
  const fromName = displayName(senderOf(message))

  async function handleSend() {
    if (!canSend) return
    setError(null)
    try {
      await forward.mutateAsync({
        messageId: message.id,
        to,
        comment: note,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not forward. Try again.')
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
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Forward className="h-[18px] w-[18px] text-accent" />
            Forward message
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-sunk"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <label className="flex items-center border-b border-paper-sunk px-4 py-3">
          <span className="w-14 shrink-0 text-sm font-medium text-ink-faint">
            To
          </span>
          <input
            autoFocus
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@company.com"
            className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
        </label>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)…"
          className="min-h-[100px] resize-none px-4 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        />

        {/* Preview of what's being forwarded */}
        <div className="mx-4 mb-3 flex items-stretch gap-2.5 rounded-xl bg-paper-soft py-2.5 pl-3 pr-3">
          <div className="w-1 shrink-0 rounded-full bg-paper-sunk" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink-soft">
              {subjectOf(message.subject)}
            </p>
            <p className="truncate text-xs text-ink-faint">
              From {fromName}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
              {message.hasAttachments && (
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">
                {cleanPreview(message.bodyPreview)}
              </span>
            </div>
          </div>
        </div>

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
            {forward.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Forward
          </button>
        </footer>
      </div>
    </div>
  )
}
