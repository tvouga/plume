import { X, Info, Paperclip } from 'lucide-react'
import { useMessageAttachments } from '../data/hooks'
import type { Message, Recipient } from '../graph/types'
import { Avatar } from './Avatar'
import { displayName, senderOf, subjectOf } from '../lib/format'

function preciseTime(iso?: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function MessageInfoModal({
  message,
  onClose,
}: {
  message: Message
  onClose: () => void
}) {
  const { data: attachments } = useMessageAttachments(message)
  const sender = senderOf(message)
  const to = message.toRecipients ?? []
  const cc = message.ccRecipients ?? []
  const files = (attachments ?? []).filter((a) => !a.isInline)

  const sent = preciseTime(message.sentDateTime)
  const received = preciseTime(message.receivedDateTime)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md animate-pop-in flex-col overflow-hidden rounded-t-2xl bg-paper shadow-pop sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-paper-sunk px-4 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Info className="h-[18px] w-[18px] text-accent" />
            Message info
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-sunk"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Subject */}
          <div className="border-b border-paper-sunk px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Subject
            </p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">
              {subjectOf(message.subject)}
            </p>
          </div>

          {/* From */}
          <Section title="From">
            <PersonRow recipient={sender} />
          </Section>

          {/* To */}
          <Section title={`To${to.length > 1 ? ` · ${to.length}` : ''}`}>
            {to.length ? (
              to.map((r, i) => <PersonRow key={i} recipient={r} />)
            ) : (
              <Empty />
            )}
          </Section>

          {/* Cc */}
          {cc.length > 0 && (
            <Section title={`Cc · ${cc.length}`}>
              {cc.map((r, i) => (
                <PersonRow key={i} recipient={r} />
              ))}
            </Section>
          )}

          {/* Timestamps */}
          <Section title="Sent">
            <p className="px-1 text-sm text-ink-soft">{sent ?? received ?? '—'}</p>
          </Section>
          {received && received !== sent && (
            <Section title="Received">
              <p className="px-1 text-sm text-ink-soft">{received}</p>
            </Section>
          )}

          {/* Attachments */}
          {message.hasAttachments && (
            <Section title={`Attachments${files.length ? ` · ${files.length}` : ''}`}>
              {files.length ? (
                <ul className="flex flex-col gap-1.5">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 px-1 text-sm text-ink-soft"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      <span className="truncate">{f.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 text-sm text-ink-faint">Loading…</p>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-paper-sunk px-4 py-3 last:border-b-0">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
        {title}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function PersonRow({ recipient }: { recipient?: Recipient | null }) {
  if (!recipient?.emailAddress?.address) return <Empty />
  const name = displayName(recipient)
  const email = recipient.emailAddress.address
  const showEmail = name.toLowerCase() !== email.toLowerCase()
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} seed={email} email={email} size={34} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
        {showEmail && (
          <p className="truncate text-xs text-ink-faint">{email}</p>
        )}
      </div>
    </div>
  )
}

function Empty() {
  return <p className="px-1 text-sm text-ink-faint">—</p>
}
