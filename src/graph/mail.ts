import type { GraphClient } from './client'
import type {
  Attachment,
  AttachmentKind,
  Conversation,
  GraphCollection,
  GraphUser,
  Message,
  Recipient,
} from './types'

const LIST_SELECT =
  'id,conversationId,subject,bodyPreview,from,sender,toRecipients,ccRecipients,receivedDateTime,isRead,isDraft,hasAttachments,flag,inferenceClassification'
const FULL_SELECT = `${LIST_SELECT},body,sentDateTime,webLink`

/** Named mail folders Plume can read from. */
export type FolderKey = 'inbox' | 'archive' | 'sentitems' | 'drafts'

/** Outlook Focused Inbox split — only meaningful for the inbox. */
export type Classification = 'focused' | 'other'

export function createMailApi(graph: GraphClient) {
  return {
    async getMe(): Promise<GraphUser> {
      return graph.get<GraphUser>(
        '/me?$select=id,displayName,mail,userPrincipalName',
      )
    },

    /**
     * Another user's directory photo as an object URL (or null). Uses a photo
     * token (User.ReadBasic.All); returns null for external addresses or when
     * the org has no photo.
     */
    async getUserPhotoUrl(email: string, token: string): Promise<string | null> {
      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
            email,
          )}/photo/$value`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) return null
        return URL.createObjectURL(await res.blob())
      } catch {
        return null
      }
    },

    /** Avatar as an object URL, or null if the user has no photo. */
    async getMyPhotoUrl(): Promise<string | null> {
      try {
        const token = await graph.token()
        const res = await fetch(
          'https://graph.microsoft.com/v1.0/me/photos/96x96/$value',
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) return null
        return URL.createObjectURL(await res.blob())
      } catch {
        return null
      }
    },

    /** Latest messages in a folder, rolled up into conversations. */
    async listConversations(
      folder: FolderKey = 'inbox',
      top = 60,
      classification?: Classification,
    ): Promise<Conversation[]> {
      const base = `/me/mailFolders/${folder}/messages?$select=${LIST_SELECT}&$top=${top}&$orderby=receivedDateTime desc`

      // Focused/Other only applies to the inbox (same signal Outlook uses).
      if (classification && folder === 'inbox') {
        try {
          const data = await graph.get<GraphCollection<Message>>(
            `${base}&$filter=inferenceClassification eq '${classification}'`,
          )
          return rollUp(data.value)
        } catch {
          // Some mailboxes reject filter+orderby; split client-side instead.
          const data = await graph.get<GraphCollection<Message>>(base)
          return rollUp(data.value).filter(
            (c) =>
              (c.latest.inferenceClassification ?? 'focused') === classification,
          )
        }
      }

      const data = await graph.get<GraphCollection<Message>>(base)
      return rollUp(data.value)
    },

    /**
     * Unified "Home" view: Focused inbox + Sent merged into one stream, so a
     * thread surfaces whether the most recent message was received or sent.
     * "Other" (low-priority) inbox mail is intentionally left out.
     */
    async listHome(top = 50): Promise<Conversation[]> {
      const select = `$select=${LIST_SELECT}&$orderby=receivedDateTime desc`
      const [inbox, sent] = await Promise.all([
        graph.get<GraphCollection<Message>>(
          `/me/mailFolders/inbox/messages?${select}&$top=${top}`,
        ),
        graph.get<GraphCollection<Message>>(
          `/me/mailFolders/sentitems/messages?${select}&$top=${top}`,
        ),
      ])
      const focusedInbox = inbox.value.filter(
        (m) => (m.inferenceClassification ?? 'focused') === 'focused',
      )
      return rollUp([...focusedInbox, ...sent.value])
    },

    /** Every message in a single conversation, oldest first. */
    async getConversation(conversationId: string): Promise<Message[]> {
      const escaped = conversationId.replace(/'/g, "''")
      const data = await graph.get<GraphCollection<Message>>(
        `/me/messages?$filter=conversationId eq '${escaped}'&$select=${FULL_SELECT}&$top=50`,
      )
      return [...data.value].sort(
        (a, b) =>
          new Date(a.receivedDateTime).getTime() -
          new Date(b.receivedDateTime).getTime(),
      )
    },

    async getMessage(id: string): Promise<Message> {
      return graph.get<Message>(`/me/messages/${id}?$select=${FULL_SELECT}`)
    },

    /** All attachments on a message, with file bytes (for the gallery). */
    async listAttachments(messageId: string, date: string): Promise<Attachment[]> {
      const data = await graph.get<GraphCollection<Record<string, unknown>>>(
        `/me/messages/${messageId}/attachments`,
      )
      return data.value.map((a) => mapAttachment(a, messageId, date))
    },

    /** Attachment metadata only (no bytes) — cheap, for inline bubble lists. */
    async listAttachmentMeta(
      messageId: string,
      date: string,
    ): Promise<Attachment[]> {
      const data = await graph.get<GraphCollection<Record<string, unknown>>>(
        `/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`,
      )
      return data.value.map((a) => mapAttachment(a, messageId, date))
    },

    /** A single attachment with its bytes — fetched on demand to download. */
    async getAttachment(
      messageId: string,
      attachmentId: string,
      date: string,
    ): Promise<Attachment> {
      const a = await graph.get<Record<string, unknown>>(
        `/me/messages/${messageId}/attachments/${attachmentId}`,
      )
      return mapAttachment(a, messageId, date)
    },

    async search(query: string, top = 40): Promise<Conversation[]> {
      const q = encodeURIComponent(`"${query}"`)
      const data = await graph.get<GraphCollection<Message>>(
        `/me/messages?$search=${q}&$select=${LIST_SELECT}&$top=${top}`,
      )
      return rollUp(data.value)
    },

    async markRead(id: string, isRead = true): Promise<void> {
      await graph.patch(`/me/messages/${id}`, { isRead })
    },

    async setFlag(id: string, flagged: boolean): Promise<void> {
      await graph.patch(`/me/messages/${id}`, {
        flag: { flagStatus: flagged ? 'flagged' : 'notFlagged' },
      })
    },

    /** Move a message to a well-known folder (archive / deleteditems). */
    async move(id: string, destinationId: FolderKey | 'deleteditems'): Promise<void> {
      await graph.post(`/me/messages/${id}/move`, { destinationId })
    },

    archive: (id: string) =>
      graph.post(`/me/messages/${id}/move`, { destinationId: 'archive' }),

    trash: (id: string) =>
      graph.post(`/me/messages/${id}/move`, { destinationId: 'deleteditems' }),

    /** Reply to a message in-thread (HTML). Graph handles quoting + threading. */
    async reply(messageId: string, html: string, all = true): Promise<void> {
      const endpoint = all ? 'replyAll' : 'reply'
      await graph.post(`/me/messages/${messageId}/${endpoint}`, {
        message: { body: { contentType: 'html', content: html } },
      })
    },

    /**
     * Rich reply: HTML body plus optional Cc/Bcc and file attachments.
     *
     * Sent in ONE atomic reply/replyAll action carrying a `message` object —
     * not the create-draft-then-modify flow, which races Exchange store
     * replication ("object not found in the store"). Supplying `message.body`
     * means the reply body is our HTML (the prior thread stays visible in the
     * app); we send either a body or a comment, never both (Graph rejects that).
     */
    async replyRich(input: {
      messageId: string
      html: string
      all?: boolean
      cc?: string
      bcc?: string
      attachments?: { name: string; contentType: string; contentBytes: string }[]
    }): Promise<void> {
      const endpoint = (input.all ?? true) ? 'replyAll' : 'reply'
      const message: Record<string, unknown> = {
        body: { contentType: 'html', content: input.html },
      }
      if (input.cc) message.ccRecipients = parseRecipients(input.cc)
      if (input.bcc) message.bccRecipients = parseRecipients(input.bcc)
      if (input.attachments?.length) {
        message.attachments = input.attachments.map((a) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.contentBytes,
        }))
      }
      await graph.post(`/me/messages/${input.messageId}/${endpoint}`, { message })
    },

    /**
     * Forward a message to new recipients. Graph keeps the original message
     * body and all of its attachments; `comment` is an optional note on top.
     */
    async forward(
      messageId: string,
      to: string,
      comment: string,
    ): Promise<void> {
      await graph.post(`/me/messages/${messageId}/forward`, {
        comment,
        toRecipients: parseRecipients(to),
      })
    },

    /** Compose and send a brand-new message. */
    async sendNew(input: {
      to: string
      cc?: string
      subject: string
      html: string
    }): Promise<void> {
      await graph.post('/me/sendMail', {
        message: {
          subject: input.subject,
          body: { contentType: 'html', content: input.html },
          toRecipients: parseRecipients(input.to),
          ccRecipients: input.cc ? parseRecipients(input.cc) : undefined,
        },
        saveToSentItems: true,
      })
    },
  }
}

export type MailApi = ReturnType<typeof createMailApi>

// --- helpers ---------------------------------------------------------------

function mapAttachment(
  a: Record<string, unknown>,
  messageId: string,
  date: string,
): Attachment {
  const odata = String(a['@odata.type'] ?? '')
  const contentType = String(a.contentType ?? '')
  const kind: AttachmentKind = odata.includes('reference')
    ? 'reference'
    : odata.includes('item')
      ? 'item'
      : 'file'
  return {
    id: String(a.id ?? ''),
    messageId,
    name: String(a.name ?? 'attachment'),
    contentType,
    size: Number(a.size ?? 0),
    isInline: Boolean(a.isInline),
    kind,
    contentBytes: typeof a.contentBytes === 'string' ? a.contentBytes : undefined,
    contentId: typeof a.contentId === 'string' ? a.contentId : undefined,
    sourceUrl: typeof a.sourceUrl === 'string' ? a.sourceUrl : undefined,
    date,
  }
}

function rollUp(messages: Message[]): Conversation[] {
  const byConv = new Map<string, Conversation>()
  for (const m of messages) {
    const key = m.conversationId || m.id
    const existing = byConv.get(key)
    if (!existing) {
      byConv.set(key, {
        conversationId: key,
        latest: m,
        count: 1,
        unread: !m.isRead,
        hasAttachments: m.hasAttachments,
      })
    } else {
      existing.count += 1
      existing.unread = existing.unread || !m.isRead
      existing.hasAttachments = existing.hasAttachments || m.hasAttachments
      if (
        new Date(m.receivedDateTime).getTime() >
        new Date(existing.latest.receivedDateTime).getTime()
      ) {
        existing.latest = m
      }
    }
  }
  return [...byConv.values()].sort(
    (a, b) =>
      new Date(b.latest.receivedDateTime).getTime() -
      new Date(a.latest.receivedDateTime).getTime(),
  )
}

export function parseRecipients(value: string): Recipient[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }))
}
