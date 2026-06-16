import { Archive, Paperclip } from 'lucide-react'
import type { Conversation } from '../graph/types'
import { Avatar } from './Avatar'
import {
  cleanPreview,
  displayName,
  relativeTime,
  senderOf,
  subjectOf,
} from '../lib/format'

interface ConversationListProps {
  conversations: Conversation[]
  selectedId: string | null
  myEmail: string
  onSelect: (c: Conversation) => void
  onArchive: (id: string) => void
}

export function ConversationList({
  conversations,
  selectedId,
  myEmail,
  onSelect,
  onArchive,
}: ConversationListProps) {
  return (
    <ul className="flex flex-col">
      {conversations.map((c) => (
        <ConversationItem
          key={c.conversationId}
          conv={c}
          selected={c.conversationId === selectedId}
          myEmail={myEmail}
          onSelect={() => onSelect(c)}
          onArchive={() => onArchive(c.latest.id)}
        />
      ))}
    </ul>
  )
}

function ConversationItem({
  conv,
  selected,
  myEmail,
  onSelect,
  onArchive,
}: {
  conv: Conversation
  selected: boolean
  myEmail: string
  onSelect: () => void
  onArchive: () => void
}) {
  const m = conv.latest
  const sender = senderOf(m)
  // If the latest message is from me, label the conversation by the recipient.
  const fromMe =
    (sender?.emailAddress?.address ?? '').toLowerCase() === myEmail.toLowerCase()
  const counterpart = fromMe ? m.toRecipients?.[0] : sender
  const name = displayName(counterpart)
  const seed = counterpart?.emailAddress?.address ?? name
  const unread = conv.unread

  return (
    <li className="group relative">
      <button
        onClick={onSelect}
        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition sm:px-4 ${
          selected ? 'bg-accent-soft' : 'hover:bg-paper-soft'
        }`}
      >
        <div className="relative">
          <Avatar
            name={name}
            seed={seed}
            email={counterpart?.emailAddress?.address}
            size={46}
          />
          {unread && (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-paper bg-accent" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`truncate text-[15px] ${
                unread ? 'font-semibold text-ink' : 'font-medium text-ink-soft'
              }`}
            >
              {fromMe ? `To: ${name}` : name}
            </span>
            <span className="ml-auto shrink-0 text-xs text-ink-faint">
              {relativeTime(
                conv.draft
                  ? new Date(conv.draft.updatedAt).toISOString()
                  : m.receivedDateTime,
              )}
            </span>
          </div>

          <div
            className={`mt-0.5 truncate text-sm ${
              unread ? 'font-medium text-ink-soft' : 'text-ink-muted'
            }`}
          >
            {subjectOf(m.subject)}
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-faint">
            {conv.draft ? (
              <span className="truncate">
                <span className="font-medium text-emerald-600">Draft: </span>
                {conv.draft.text.replace(/\s+/g, ' ').trim()}
              </span>
            ) : (
              <>
                {conv.hasAttachments && (
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{cleanPreview(m.bodyPreview)}</span>
              </>
            )}
            {conv.count > 1 && (
              <span className="ml-auto shrink-0 rounded-full bg-paper-sunk px-1.5 text-[11px] font-medium text-ink-muted">
                {conv.count}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Quick archive on hover (desktop) */}
      <button
        onClick={onArchive}
        title="Archive"
        aria-label="Archive"
        className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-ink-muted shadow-soft transition hover:text-accent group-hover:flex"
      >
        <Archive className="h-4 w-4" />
      </button>
    </li>
  )
}
