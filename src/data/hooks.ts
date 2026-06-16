import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useMailApi } from './useMailApi'
import { useAuth } from '../auth/AuthContext'
import type { Classification, FolderKey } from '../graph/mail'
import type { Conversation, Message } from '../graph/types'
import { displayName, senderOf } from '../lib/format'
import { emailHash, generatedUrl, gravatarUrl, isEmail } from '../lib/avatars'

const REFETCH_MS = 30_000 // gentle background polling for new mail

export function useMe() {
  const mail = useMailApi()
  return useQuery({
    queryKey: ['me'],
    queryFn: () => mail.getMe(),
    staleTime: Infinity,
  })
}

export function useMyPhoto() {
  const mail = useMailApi()
  return useQuery({
    queryKey: ['me', 'photo'],
    queryFn: () => mail.getMyPhotoUrl(),
    staleTime: Infinity,
  })
}

export type ViewKey = FolderKey | 'home'

export function useConversations(
  view: ViewKey,
  search: string,
  classification?: Classification,
) {
  const mail = useMailApi()
  const trimmed = search.trim()
  return useQuery({
    queryKey: ['conversations', view, classification ?? null, trimmed],
    queryFn: () => {
      if (trimmed) return mail.search(trimmed)
      if (view === 'home') return mail.listHome()
      return mail.listConversations(view, 60, classification)
    },
    refetchInterval: trimmed ? false : REFETCH_MS,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  })
}

export function useConversation(conversationId: string | null) {
  const mail = useMailApi()
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => mail.getConversation(conversationId as string),
    enabled: Boolean(conversationId),
  })
}

/**
 * Every attachment across a conversation, fetched only when asked (e.g. when
 * the gallery opens). Tiny inline signature logos are filtered out.
 */
export function useAttachments(
  conversationId: string | null,
  messages: Message[] | undefined,
  enabled: boolean,
) {
  const mail = useMailApi()
  const withAtt = (messages ?? []).filter((m) => m.hasAttachments)
  const ids = withAtt.map((m) => m.id)
  return useQuery({
    queryKey: ['attachments', conversationId, ids],
    queryFn: async () => {
      const lists = await Promise.all(
        withAtt.map(async (m) => {
          const from = displayName(senderOf(m))
          const atts = await mail.listAttachments(m.id, m.receivedDateTime)
          return atts.map((a) => ({ ...a, from }))
        }),
      )
      return lists
        .flat()
        .filter(
          (a) =>
            a.kind !== 'item' &&
            (!a.isInline ||
              (a.contentType.startsWith('image/') && a.size > 30_000)),
        )
    },
    enabled: enabled && Boolean(conversationId) && ids.length > 0,
    staleTime: 5 * 60_000,
  })
}

/**
 * Resolve a message's inline images (cid:) to data URLs. Only fires when the
 * HTML body actually references cid:, so plain messages cost nothing.
 */
export function useInlineImages(message: Message) {
  const mail = useMailApi()
  const body = message.body?.contentType === 'html' ? message.body.content : ''
  const hasCid = /cid:/i.test(body)
  return useQuery({
    queryKey: ['inline-images', message.id],
    queryFn: async (): Promise<Record<string, string>> => {
      const atts = await mail.listAttachments(message.id, message.receivedDateTime)
      const map: Record<string, string> = {}
      for (const a of atts) {
        if (!a.contentBytes || !a.contentType.startsWith('image/')) continue
        const url = `data:${a.contentType};base64,${a.contentBytes}`
        // Key by Content-ID (normalizing angle brackets) and by file name —
        // emails reference cid: by either, depending on the sending client.
        if (a.contentId) map[a.contentId.replace(/^<|>$/g, '')] = url
        if (a.name) map[a.name] = url
      }
      return map
    },
    // NOTE: do NOT gate on message.hasAttachments — Graph reports `false` for
    // messages whose only attachments are inline images, which is exactly this
    // case. Fetch whenever the body references cid:.
    enabled: hasCid,
    staleTime: 5 * 60_000,
  })
}

/** Lightweight attachment metadata for one message (for the inline bubble list). */
export function useMessageAttachments(message: Message) {
  const mail = useMailApi()
  return useQuery({
    queryKey: ['msg-attachments', message.id],
    queryFn: () =>
      mail.listAttachmentMeta(message.id, message.receivedDateTime),
    enabled: message.hasAttachments,
    staleTime: 5 * 60_000,
  })
}

/**
 * Ordered list of avatar URLs to try for a person: directory photo → Gravatar
 * → generated face. The <Avatar> component walks the list on load errors.
 */
export function useAvatar(email: string | undefined, fallbackSeed: string) {
  const mail = useMailApi()
  const { getPhotoToken } = useAuth()
  return useQuery({
    queryKey: ['avatar', email ?? `seed:${fallbackSeed}`],
    queryFn: async (): Promise<string[]> => {
      const candidates: string[] = []
      const hash = isEmail(email) ? await emailHash(email) : null

      if (isEmail(email)) {
        // 1) Microsoft directory photo (graceful — only if scope is granted).
        const token = await getPhotoToken()
        if (token) {
          const blobUrl = await mail.getUserPhotoUrl(email, token)
          if (blobUrl) candidates.push(blobUrl)
        }
        // 2) Gravatar (404s fall through to the generated face).
        if (hash) candidates.push(gravatarUrl(hash))
      }

      // 3) Always-available generated avatar, seeded by the hash (no PII).
      candidates.push(generatedUrl(hash ?? fallbackSeed))
      return candidates
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}

/** Invalidate list + thread views after a change. */
function useRefresh() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['conversations'] })
    qc.invalidateQueries({ queryKey: ['conversation'] })
  }
}

export function useMarkRead() {
  const mail = useMailApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
      mail.markRead(id, isRead),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useArchive() {
  const mail = useMailApi()
  const refresh = useRefresh()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mail.archive(id),
    // Optimistically drop the conversation from every list view.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['conversations'] })
      const snapshots = qc.getQueriesData<Conversation[]>({
        queryKey: ['conversations'],
      })
      for (const [key, data] of snapshots) {
        if (!data) continue
        qc.setQueryData<Conversation[]>(
          key,
          data.filter((c) => c.latest.id !== id),
        )
      }
      return { snapshots }
    },
    onError: (_e, _id, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => refresh(),
  })
}

export function useTrash() {
  const mail = useMailApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) => mail.trash(id),
    onSettled: () => refresh(),
  })
}

export function useFlag() {
  const mail = useMailApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, flagged }: { id: string; flagged: boolean }) =>
      mail.setFlag(id, flagged),
    onSettled: () => refresh(),
  })
}

export function useReply() {
  const mail = useMailApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({
      messageId,
      html,
      all,
    }: {
      messageId: string
      html: string
      all?: boolean
    }) => mail.reply(messageId, html, all ?? true),
    onSuccess: () => refresh(),
  })
}

export function useReplyRich() {
  const mail = useMailApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: {
      messageId: string
      html: string
      all?: boolean
      cc?: string
      bcc?: string
      attachments?: { name: string; contentType: string; contentBytes: string }[]
    }) => mail.replyRich(input),
    onSuccess: () => refresh(),
  })
}

export function useForward() {
  const mail = useMailApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({
      messageId,
      to,
      comment,
    }: {
      messageId: string
      to: string
      comment: string
    }) => mail.forward(messageId, to, comment),
    onSuccess: () => refresh(),
  })
}

export function useSendNew() {
  const mail = useMailApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: {
      to: string
      cc?: string
      subject: string
      html: string
    }) => mail.sendNew(input),
    onSuccess: () => refresh(),
  })
}
