import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Archive,
  Flag,
  ExternalLink,
  Loader2,
  Paperclip,
} from 'lucide-react'
import {
  useAttachments,
  useConversation,
  useFlag,
  useReply,
  useReplyRich,
} from '../data/hooks'
import type { RichReply } from './AdvancedComposer'
import type { Conversation, Message } from '../graph/types'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'
import { AdvancedComposer } from './AdvancedComposer'
import { AttachmentsPanel } from './AttachmentsPanel'
import { ForwardModal } from './ForwardModal'
import { MessageInfoModal } from './MessageInfoModal'
import { clearDraft, getDraft, setDraft } from '../lib/drafts'
import {
  cleanPreview,
  displayName,
  senderOf,
  subjectOf,
  textToHtml,
} from '../lib/format'

interface ThreadViewProps {
  conversation: Conversation
  myEmail: string
  onBack: () => void
  onArchive: (id: string) => void
}

export function ThreadView({
  conversation,
  myEmail,
  onBack,
  onArchive,
}: ThreadViewProps) {
  const { data: messages, isLoading } = useConversation(conversation.conversationId)
  const reply = useReply()
  const replyRich = useReplyRich()
  const flag = useFlag()
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [showAttachments, setShowAttachments] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null)
  const [infoMsg, setInfoMsg] = useState<Message | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [panelHeight, setPanelHeight] = useState(380)

  const hasAttachments = (messages ?? []).some((m) => m.hasAttachments)
  const attachments = useAttachments(
    conversation.conversationId,
    messages,
    showAttachments,
  )

  const latest = messages?.[messages.length - 1] ?? conversation.latest
  const flagged = conversation.latest.flag?.flagStatus === 'flagged'

  const me = myEmail.toLowerCase()

  // Stick to the newest message, like a chat (also when the editor opens and
  // the list reflows to a shorter height).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, advancedOpen, panelHeight])

  // Reset transient UI when the open conversation changes.
  useEffect(() => {
    setReplyTo(null)
    setForwardMsg(null)
    setInfoMsg(null)
    setAdvancedOpen(false)
  }, [conversation.conversationId])

  // Resize the editor pane, clamped so some of the thread stays visible.
  function resizePanel(next: number) {
    const max = (rootRef.current?.clientHeight ?? 800) - 180
    setPanelHeight(Math.max(240, Math.min(next, Math.max(240, max))))
  }

  async function handleReply(text: string) {
    await reply.mutateAsync({
      messageId: (replyTo ?? latest).id,
      html: textToHtml(text),
      all: true,
    })
    setReplyTo(null)
  }

  // From the advanced editor — HTML body plus optional Cc/Bcc and attachments.
  async function handleReplyRich(replyInput: RichReply) {
    await replyRich.mutateAsync({
      messageId: (replyTo ?? latest).id,
      all: true,
      ...replyInput,
    })
    setReplyTo(null)
  }

  const replyPreview = replyTo
    ? {
        name:
          (senderOf(replyTo)?.emailAddress?.address ?? '').toLowerCase() === me
            ? 'You'
            : displayName(senderOf(replyTo)),
        text: cleanPreview(replyTo.bodyPreview) || subjectOf(replyTo.subject),
      }
    : null

  return (
    <div
      ref={rootRef}
      className="flex h-full min-w-0 flex-1 flex-col bg-paper-soft"
    >
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-paper-sunk bg-paper/80 px-3 py-3 backdrop-blur sm:px-4">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-sunk md:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-ink">
            {subjectOf(conversation.latest.subject)}
          </h2>
          <p className="truncate text-xs text-ink-faint">
            {conversation.count} message{conversation.count > 1 ? 's' : ''}
          </p>
        </div>
        {hasAttachments && (
          <HeaderButton
            label="Attachments"
            onClick={() => setShowAttachments(true)}
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </HeaderButton>
        )}
        <HeaderButton
          label={flagged ? 'Unflag' : 'Flag'}
          active={flagged}
          onClick={() =>
            flag.mutate({ id: conversation.latest.id, flagged: !flagged })
          }
        >
          <Flag className={`h-[18px] w-[18px] ${flagged ? 'fill-current' : ''}`} />
        </HeaderButton>
        <HeaderButton
          label="Archive"
          onClick={() => onArchive(conversation.latest.id)}
        >
          <Archive className="h-[18px] w-[18px]" />
        </HeaderButton>
        {conversation.latest.webLink && (
          <a
            href={conversation.latest.webLink}
            target="_blank"
            rel="noreferrer"
            title="Open in Outlook web"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-sunk"
          >
            <ExternalLink className="h-[18px] w-[18px]" />
          </a>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-ink-faint">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            {messages?.map((m, i) => {
              const prev = messages[i - 1]
              const mine =
                (senderOf(m)?.emailAddress?.address ?? '').toLowerCase() === me
              const prevMine =
                prev &&
                (senderOf(prev)?.emailAddress?.address ?? '').toLowerCase() === me
              const prevSameSender =
                prev &&
                senderOf(prev)?.emailAddress?.address ===
                  senderOf(m)?.emailAddress?.address &&
                mine === prevMine
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  mine={mine}
                  showAvatar={!prevSameSender}
                  onReply={setReplyTo}
                  onForward={setForwardMsg}
                  onInfo={setInfoMsg}
                />
              )
            })}
          </div>
        )}
      </div>

      {advancedOpen ? (
        <AdvancedComposer
          initialText={getDraft(conversation.conversationId)?.text ?? ''}
          placeholder="Reply to everyone…"
          height={panelHeight}
          onResize={resizePanel}
          onCancel={(plain) => {
            // Keep the text — write it back so the simple box reflects it.
            if (plain.trim()) setDraft(conversation.conversationId, plain)
            else clearDraft(conversation.conversationId)
            setAdvancedOpen(false)
          }}
          onSend={async (replyInput) => {
            // Throws on failure → editor stays open and shows the error.
            await handleReplyRich(replyInput)
            clearDraft(conversation.conversationId)
            setAdvancedOpen(false)
          }}
        />
      ) : (
        <Composer
          key={conversation.conversationId}
          draftKey={conversation.conversationId}
          placeholder="Reply to everyone…"
          busy={reply.isPending}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleReply}
          onExpand={() => setAdvancedOpen(true)}
        />
      )}

      {showAttachments && (
        <AttachmentsPanel
          attachments={attachments.data ?? []}
          loading={attachments.isLoading}
          onClose={() => setShowAttachments(false)}
        />
      )}

      {forwardMsg && (
        <ForwardModal
          message={forwardMsg}
          onClose={() => setForwardMsg(null)}
        />
      )}

      {infoMsg && (
        <MessageInfoModal
          message={infoMsg}
          onClose={() => setInfoMsg(null)}
        />
      )}
    </div>
  )
}

function HeaderButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-paper-sunk ${
        active ? 'text-accent' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  )
}
