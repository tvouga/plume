import { useEffect, useRef, useState } from 'react'
import { Maximize2, Reply, Send, X } from 'lucide-react'
import { clearDraft, getDraft, setDraft } from '../lib/drafts'

interface ComposerProps {
  placeholder?: string
  busy?: boolean
  /** Conversation id to persist an unsent draft against (WhatsApp-style). */
  draftKey?: string
  /** When set, shows a quoted preview of the message being replied to. */
  replyPreview?: { name: string; text: string } | null
  onCancelReply?: () => void
  onSend: (text: string) => void | Promise<void>
  /** Open the roomy advanced editor (managed by the parent). */
  onExpand?: () => void
}

/** The pinned, auto-growing reply box — the heart of the WhatsApp feel. */
export function Composer({
  placeholder = 'Reply…',
  busy,
  draftKey,
  replyPreview,
  onCancelReply,
  onSend,
  onExpand,
}: ComposerProps) {
  // Seed from any saved draft for this conversation. Composer is keyed by
  // conversation id upstream, so this initializer runs fresh per thread.
  const [text, setText] = useState(() =>
    draftKey ? (getDraft(draftKey)?.text ?? '') : '',
  )
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-grow up to a comfortable max height.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [text])

  // Focus the box the moment the user picks a message to reply to.
  useEffect(() => {
    if (replyPreview) ref.current?.focus()
  }, [replyPreview])

  function update(value: string) {
    setText(value)
    if (draftKey) setDraft(draftKey, value)
  }

  const canSend = text.trim().length > 0 && !busy

  async function submit() {
    if (!canSend) return
    const value = text
    setText('')
    if (draftKey) clearDraft(draftKey)
    await onSend(value)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Enter sends, Shift+Enter makes a new line — like a chat app.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-paper-sunk bg-paper px-3 py-3 sm:px-4">
      {replyPreview && (
        <div className="mb-2 flex items-stretch gap-2.5 rounded-xl bg-paper-soft py-2 pl-3 pr-2 animate-pop-in">
          <div className="w-1 shrink-0 rounded-full bg-accent" />
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Reply className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-accent">
                Replying to {replyPreview.name}
              </p>
              <p className="truncate text-[13px] text-ink-muted">
                {replyPreview.text}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-ink-faint transition hover:bg-paper-sunk hover:text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex w-full items-end gap-2">
        <button
          onClick={onExpand}
          aria-label="Advanced editor"
          title="Advanced editor"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-soft hover:text-ink"
        >
          <Maximize2 className="h-5 w-5" />
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => update(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="max-h-[180px] flex-1 resize-none rounded-2xl bg-paper-soft px-4 py-2.5 text-[15px] leading-relaxed text-ink outline-none ring-1 ring-transparent transition placeholder:text-ink-faint focus:bg-paper focus:ring-accent/30"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-soft transition active:scale-95 disabled:opacity-40"
        >
          <Send className="h-5 w-5 -translate-x-px translate-y-px" />
        </button>
      </div>
    </div>
  )
}
