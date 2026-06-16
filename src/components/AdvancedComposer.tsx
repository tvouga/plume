import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Quote,
  Paperclip,
  Minimize2,
  Loader2,
  Send,
  X,
} from 'lucide-react'
import { textToHtml } from '../lib/format'
import { fileToBase64, formatBytes } from '../lib/files'

export interface RichReply {
  html: string
  cc?: string
  bcc?: string
  attachments?: { name: string; contentType: string; contentBytes: string }[]
}

interface AdvancedComposerProps {
  /** Existing plain-text draft to seed the editor with. */
  initialText: string
  placeholder?: string
  /** Current pane height in px (parent-controlled so the thread reflows). */
  height: number
  /** Drag-resize callback — parent clamps and applies the new height. */
  onResize: (height: number) => void
  /** Closed without sending — hand back the plain text so nothing is lost. */
  onCancel: (plainText: string) => void
  /** Send the composed reply. Resolves on success, rejects on failure. */
  onSend: (reply: RichReply) => Promise<void>
}

type Cmd =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'formatBlock'

const TOOLS: { cmd: Cmd; arg?: string; icon: typeof Bold; label: string }[] = [
  { cmd: 'bold', icon: Bold, label: 'Bold' },
  { cmd: 'italic', icon: Italic, label: 'Italic' },
  { cmd: 'underline', icon: Underline, label: 'Underline' },
  { cmd: 'insertUnorderedList', icon: List, label: 'Bulleted list' },
  { cmd: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
  { cmd: 'formatBlock', arg: 'blockquote', icon: Quote, label: 'Quote' },
]

/**
 * A roomier, rich-text reply surface that slides up from the bottom bar.
 * Supports formatting, Cc/Bcc and attachments, and produces HTML so the
 * styling survives into the sent email.
 */
export function AdvancedComposer({
  initialText,
  placeholder = 'Write your message…',
  height,
  onResize,
  onCancel,
  onSend,
}: AdvancedComposerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [empty, setEmpty] = useState(initialText.trim().length === 0)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed once from the existing draft, turning plain lines into paragraphs.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (initialText.trim()) el.innerHTML = textToHtml(initialText)
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function sync() {
    setEmpty((ref.current?.textContent ?? '').trim().length === 0)
  }

  function exec(cmd: Cmd, arg?: string) {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    sync()
  }

  function addLink() {
    const url = window.prompt('Link URL')
    if (!url) return
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
    ref.current?.focus()
    document.execCommand('createLink', false, href)
    sync()
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length) setFiles((prev) => [...prev, ...picked])
    e.target.value = '' // allow re-picking the same file
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

  const plainText = () => ref.current?.innerText ?? ''

  async function send() {
    const el = ref.current
    if (!el || el.textContent?.trim().length === 0 || sending) return
    setSending(true)
    setError(null)
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          contentType: f.type || 'application/octet-stream',
          contentBytes: await fileToBase64(f),
        })),
      )
      await onSend({
        html: el.innerHTML,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        attachments: attachments.length ? attachments : undefined,
      })
      // On success the parent unmounts this panel.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Try again.')
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  // Drag the top divider to grow/shrink the pane (and reflow the thread above).
  function onResizeStart(e: React.PointerEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const move = (ev: PointerEvent) => onResize(startH + (startY - ev.clientY))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    // An in-flow bottom pane: the message list above flexes to fill whatever
    // height is left, so scrolling reaches the very bottom of the thread.
    <div
      style={{ height }}
      className="flex shrink-0 flex-col overflow-hidden bg-paper shadow-[0_-8px_24px_rgba(28,27,34,0.06)]"
    >
        {/* Draggable divider — grab to resize the pane. */}
        <div
          onPointerDown={onResizeStart}
          title="Drag to resize"
          className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center border-t border-paper-sunk"
        >
          <span className="h-1 w-10 rounded-full bg-paper-sunk transition group-hover:bg-ink-faint" />
        </div>

        {/* Toolbar */}
        <header className="flex items-center gap-1 border-b border-paper-sunk px-2 py-2">
          {TOOLS.map(({ cmd, arg, icon: Icon, label }) => (
            <button
              key={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(cmd, arg)}
              title={label}
              aria-label={label}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-paper-soft hover:text-ink"
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          ))}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={addLink}
            title="Insert link"
            aria-label="Insert link"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-paper-soft hover:text-ink"
          >
            <Link2 className="h-[18px] w-[18px]" />
          </button>

          <span className="mx-1 h-5 w-px bg-paper-sunk" />

          <button
            onClick={() => fileRef.current?.click()}
            title="Attach files"
            aria-label="Attach files"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-paper-soft hover:text-ink"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />

          <button
            onClick={() => onCancel(plainText())}
            title="Collapse"
            aria-label="Collapse to simple editor"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-paper-soft hover:text-ink"
          >
            <Minimize2 className="h-[18px] w-[18px]" />
          </button>
        </header>

        {/* Recipients: To is reply-all by default; reveal Cc / Bcc on demand. */}
        <div className="flex flex-col divide-y divide-paper-sunk border-b border-paper-sunk">
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="w-10 shrink-0 text-xs font-medium text-ink-faint">
              To
            </span>
            <span className="flex-1 text-[13px] text-ink-muted">
              Everyone in the thread
            </span>
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="shrink-0 text-xs font-medium text-accent"
              >
                Cc
              </button>
            )}
            {!showBcc && (
              <button
                onClick={() => setShowBcc(true)}
                className="shrink-0 text-xs font-medium text-accent"
              >
                Bcc
              </button>
            )}
          </div>
          {showCc && (
            <RecipientField
              label="Cc"
              value={cc}
              onChange={setCc}
              onClear={() => {
                setCc('')
                setShowCc(false)
              }}
            />
          )}
          {showBcc && (
            <RecipientField
              label="Bcc"
              value={bcc}
              onChange={setBcc}
              onClear={() => {
                setBcc('')
                setShowBcc(false)
              }}
            />
          )}
        </div>

        {/* Editor */}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onKeyDown={onKeyDown}
          data-placeholder={empty ? placeholder : ''}
          className="email-html rich-editor flex-1 overflow-y-auto px-5 py-4 outline-none"
        />

        {/* Attachment chips */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-paper-sunk px-4 py-2.5">
            {files.map((f, i) => (
              <span
                key={i}
                className="flex max-w-[220px] items-center gap-2 rounded-lg bg-paper-soft py-1.5 pl-2.5 pr-1.5 text-sm"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <span className="truncate text-ink-soft">{f.name}</span>
                {f.size > 0 && (
                  <span className="shrink-0 text-xs text-ink-faint">
                    {formatBytes(f.size)}
                  </span>
                )}
                <button
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.name}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint transition hover:bg-paper-sunk hover:text-ink-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {error && (
          <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 border-t border-paper-sunk px-4 py-3">
          <span className="hidden text-xs text-ink-faint sm:block">
            ⌘↵ to send · ⌘B / ⌘I / ⌘U to format
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCancel(plainText())}
              className="rounded-xl px-4 py-2 text-sm font-medium text-ink-muted transition hover:bg-paper-sunk"
            >
              Collapse
            </button>
            <button
              onClick={send}
              disabled={empty || sending}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </button>
          </div>
        </footer>
    </div>
  )
}

function RecipientField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="w-10 shrink-0 text-xs font-medium text-ink-faint">
        {label}
      </span>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="name@company.com"
        className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
      />
      <button
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint transition hover:bg-paper-sunk hover:text-ink-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
