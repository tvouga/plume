import DOMPurify from 'dompurify'
import type { Message, Recipient } from '../graph/types'

export function displayName(r?: Recipient | null): string {
  if (!r?.emailAddress) return 'Unknown'
  return r.emailAddress.name?.trim() || r.emailAddress.address
}

export function firstName(r?: Recipient | null): string {
  return displayName(r).split(/[\s@.]/)[0] || 'Someone'
}

export function senderOf(m: Message): Recipient | undefined {
  return m.from ?? m.sender
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic, calm avatar colors derived from the address.
const AVATAR_COLORS = [
  '#5b8def', '#7c6cf0', '#d36bb0', '#e08a4b',
  '#3fae8e', '#4f9bd9', '#9b7bd4', '#c2698f',
  '#6aa84f', '#d2904b',
]

export function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function relativeTime(iso: string): string {
  const then = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - then.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  const sameDay = then.toDateString() === now.toDateString()
  if (sameDay) {
    return then.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (hr < 24 * 7) {
    return then.toLocaleDateString([], { weekday: 'short' })
  }
  const sameYear = then.getFullYear() === now.getFullYear()
  return then.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Sanitize an HTML email body so it's safe to dangerouslySetInnerHTML. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    ADD_DATA_URI_TAGS: ['img'], // keep resolved inline images (data: URLs)
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  })
}

/**
 * Swap `cid:` references for resolved data URLs so inline images (pasted
 * screenshots etc.) display. `map` is keyed by attachment Content-ID.
 */
export function resolveCidImages(
  html: string,
  map: Record<string, string>,
): string {
  if (!html.includes('cid:')) return html
  return html.replace(/cid:([^"'>\s)]+)/gi, (whole, id: string) => {
    const key = id.replace(/^<|>$/g, '')
    return map[key] ?? map[id] ?? whole
  })
}

/** Escape plain text typed by the user into safe HTML for sending. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\n/g, '<br>')
}

/** A short subject for display ("(no subject)" when empty). */
export function subjectOf(subject: string | null): string {
  const s = (subject ?? '').trim()
  return s || '(no subject)'
}

// --- Quoted-reply trimming --------------------------------------------------
// Each message bubble should show only its *new* content. Replies/forwards from
// Outlook & co. embed the entire prior thread (a "From:/De:" header block plus
// the original body), which is redundant since every earlier message is already
// its own bubble. These helpers cut a body off at the start of the quote.

// A line that begins a quoted message's header, across common locales.
const QUOTE_HEADER =
  /^\s*(from|de|von|da|van|gesendet|sent|envoyé|enviado|inviato|wysłane|发件人|差出人)\s*:/i

// Boundaries different clients use to wrap quoted history.
const QUOTE_SELECTOR =
  '#divRplyFwdMsg, .gmail_quote, .moz-cite-prefix, blockquote'

function isDivider(el: Element | null): boolean {
  if (!el) return false
  if (el.tagName === 'HR') return true
  return /border-top/i.test(el.getAttribute('style') ?? '')
}

/** Remove `node`, every following sibling, and every ancestor's later siblings. */
function truncateFrom(node: Element, stop: Element): void {
  let cur: Node | null = node
  let removeSelf = true
  while (cur && cur !== stop) {
    const parent: (Node & ParentNode) | null = cur.parentNode
    if (!parent) break
    while (cur.nextSibling) parent.removeChild(cur.nextSibling)
    if (removeSelf) {
      parent.removeChild(cur)
      removeSelf = false
    }
    cur = parent
  }
}

/** Strip Outlook/Gmail-style quoted history from an HTML email body. */
export function trimQuotedHtml(html: string): string {
  if (typeof window === 'undefined' || !html) return html
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return html
  }
  const body = doc.body

  const candidates: Element[] = []
  const wrapped = body.querySelector(QUOTE_SELECTOR)
  if (wrapped) candidates.push(wrapped)

  // First block-level element whose own text opens with a "From:/De:" header.
  for (const el of Array.from(body.querySelectorAll('p, div, span, td'))) {
    const txt = (el.textContent ?? '').replace(/ /g, ' ').trim()
    if (QUOTE_HEADER.test(txt)) {
      candidates.push(el)
      break
    }
  }
  if (!candidates.length) return html

  // Pick whichever boundary appears first in the document.
  let boundary = candidates[0]
  for (const c of candidates.slice(1)) {
    if (
      boundary.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING
    ) {
      boundary = c
    }
  }

  // If the header sits inside a divider wrapper (Outlook desktop's bordered
  // box), climb to the wrapper so it's removed too — not left as an empty line.
  while (
    boundary.parentElement &&
    boundary.parentElement !== body &&
    !boundary.previousElementSibling &&
    isDivider(boundary.parentElement)
  ) {
    boundary = boundary.parentElement
  }

  // Also drop a divider line (──── / bordered div) sitting just above the quote.
  while (isDivider(boundary.previousElementSibling)) {
    boundary = boundary.previousElementSibling as Element
  }

  truncateFrom(boundary, body)

  // Tidy any dangling dividers / empty blocks left at the end.
  let last = body.lastElementChild
  while (last && (isDivider(last) || (last.textContent ?? '').trim() === '')) {
    last.remove()
    last = body.lastElementChild
  }

  const trimmed = body.innerHTML.trim()
  return trimmed.length > 0 ? trimmed : html
}

// Plain-text variants of the same boundaries (kept strict to avoid cutting
// ordinary prose that merely starts with a word like "From").
const TEXT_QUOTE_LINE =
  /^\s*(-{2,}\s*(original message|message d.origine|forwarded message)|on .+ wrote:\s*$|le .+ a écrit\s*:?\s*$)/i

/**
 * Clean a one-line list preview: drop Outlook's underscore/dash divider runs
 * (which stretch the row) and trim a trailing quoted-message header when there
 * is real intro text before it.
 */
export function cleanPreview(preview: string): string {
  if (!preview) return ''
  let s = preview.replace(/ /g, ' ')
  // Remove the long ─────/_____ dividers Outlook inserts before a quote.
  s = s.replace(/[_–—-]{3,}/g, ' ')
  // If there's meaningful text before a "From:/De:" header, keep only that.
  const m = s.match(/\b(from|de|von|sent|envoyé|gesendet|à|objet|subject)\s*:/i)
  if (m && m.index !== undefined && s.slice(0, m.index).trim().length >= 2) {
    s = s.slice(0, m.index)
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** Strip quoted history from a plain-text email body. */
export function trimQuotedText(text: string): string {
  if (!text) return text
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (
      i > 0 &&
      (QUOTE_HEADER.test(line) ||
        /^_{5,}$/.test(line) ||
        /^>/.test(line) ||
        TEXT_QUOTE_LINE.test(line))
    ) {
      const kept = lines.slice(0, i).join('\n').trimEnd()
      return kept.length > 0 ? kept : text
    }
  }
  return text
}
