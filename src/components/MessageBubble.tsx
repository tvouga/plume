import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Forward, Info, Reply } from 'lucide-react'
import type { Message } from '../graph/types'
import { useInlineImages } from '../data/hooks'
import { Avatar } from './Avatar'
import { MessageAttachments } from './MessageAttachments'
import {
  displayName,
  fullTime,
  resolveCidImages,
  sanitize,
  senderOf,
  textToHtml,
  trimQuotedHtml,
  trimQuotedText,
} from '../lib/format'

interface MessageBubbleProps {
  message: Message
  mine: boolean
  showAvatar: boolean
  onReply: (message: Message) => void
  onForward: (message: Message) => void
  onInfo: (message: Message) => void
}

const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 10

export function MessageBubble({
  message,
  mine,
  showAvatar,
  onReply,
  onForward,
  onInfo,
}: MessageBubbleProps) {
  const [expanded, setExpanded] = useState(false)
  const sender = senderOf(message)
  const name = displayName(sender)
  const seed = sender?.emailAddress?.address ?? name

  // Long-press / right-click context menu (WhatsApp-style).
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const timer = useRef<number | null>(null)

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function openMenu(x: number, y: number) {
    clearTimer()
    setMenu({ x, y })
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 2) return // right-click handled by onContextMenu
    pressStart.current = { x: e.clientX, y: e.clientY }
    clearTimer()
    timer.current = window.setTimeout(
      () => openMenu(e.clientX, e.clientY),
      LONG_PRESS_MS,
    )
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return
    const dx = Math.abs(e.clientX - pressStart.current.x)
    const dy = Math.abs(e.clientY - pressStart.current.y)
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearTimer()
  }

  function endPress() {
    clearTimer()
    pressStart.current = null
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    openMenu(e.clientX, e.clientY)
  }

  // Close the menu on scroll, resize, or Escape — anything that would move it.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const { data: inlineImages } = useInlineImages(message)

  const html = useMemo(() => {
    if (message.body?.contentType === 'html') {
      const trimmed = trimQuotedHtml(message.body.content)
      const resolved = inlineImages
        ? resolveCidImages(trimmed, inlineImages)
        : trimmed
      return sanitize(resolved)
    }
    if (message.body?.content) {
      return textToHtml(trimQuotedText(message.body.content))
    }
    return textToHtml(message.bodyPreview)
  }, [message, inlineImages])

  const long = html.length > 1400

  return (
    <div className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-9 shrink-0">
        {showAvatar && !mine && (
          <Avatar
            name={name}
            seed={seed}
            email={sender?.emailAddress?.address}
            size={36}
          />
        )}
      </div>

      <div
        className={`flex max-w-[min(82%,46rem)] flex-col ${
          mine ? 'items-end' : 'items-start'
        }`}
      >
        {showAvatar && (
          <div
            className={`mb-1 flex items-center gap-2 px-1 text-xs text-ink-faint ${
              mine ? 'flex-row-reverse' : ''
            }`}
          >
            <span className="font-medium text-ink-muted">{mine ? 'You' : name}</span>
            <span>·</span>
            <span>{fullTime(message.receivedDateTime)}</span>
          </div>
        )}

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onContextMenu={onContextMenu}
          className={`overflow-hidden rounded-2xl px-4 py-3 shadow-soft transition select-text [-webkit-touch-callout:none] ${
            menu ? 'ring-2 ring-accent/40' : ''
          } ${
            mine
              ? 'rounded-br-md bg-mine text-ink'
              : 'rounded-bl-md bg-paper text-ink-soft'
          }`}
        >
          <div
            className={`email-html ${mine ? 'text-ink [&_a]:text-mine-ink' : ''} ${
              long && !expanded ? 'max-h-72 overflow-hidden' : ''
            }`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {long && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className={`mt-1 text-xs font-medium underline underline-offset-2 ${
                mine ? 'text-mine-ink' : 'text-accent'
              }`}
            >
              {expanded ? 'Show less' : 'Show full message'}
            </button>
          )}
          <MessageAttachments message={message} mine={mine} />
        </div>
      </div>

      {menu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu(null)
              }}
            />
            <div
              role="menu"
              className="fixed z-50 min-w-[150px] animate-pop-in overflow-hidden rounded-xl bg-paper p-1 shadow-pop"
              style={{
                left: Math.min(menu.x, window.innerWidth - 166),
                top: Math.min(menu.y, window.innerHeight - 64),
              }}
            >
              <button
                onClick={() => {
                  onReply(message)
                  setMenu(null)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-paper-soft"
              >
                <Reply className="h-[18px] w-[18px] text-ink-muted" />
                Reply
              </button>
              <button
                onClick={() => {
                  onForward(message)
                  setMenu(null)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-paper-soft"
              >
                <Forward className="h-[18px] w-[18px] text-ink-muted" />
                Forward
              </button>
              <button
                onClick={() => {
                  onInfo(message)
                  setMenu(null)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-paper-soft"
              >
                <Info className="h-[18px] w-[18px] text-ink-muted" />
                Info
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
