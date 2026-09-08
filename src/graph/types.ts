// Subset of Microsoft Graph mail types that Plume actually uses.

export interface EmailAddress {
  name?: string
  address: string
}

export interface Recipient {
  emailAddress: EmailAddress
}

export interface ItemBody {
  contentType: 'text' | 'html'
  content: string
}

export interface Message {
  id: string
  conversationId: string
  subject: string | null
  bodyPreview: string
  body?: ItemBody
  from?: Recipient
  sender?: Recipient
  toRecipients: Recipient[]
  ccRecipients?: Recipient[]
  receivedDateTime: string
  sentDateTime?: string
  isRead: boolean
  isDraft?: boolean
  hasAttachments: boolean
  /** Outlook's Focused Inbox signal: 'focused' | 'other'. */
  inferenceClassification?: 'focused' | 'other'
  flag?: { flagStatus?: 'notFlagged' | 'flagged' | 'complete' }
  webLink?: string
  /** Outlook categories — the human-visible half of Plume's ledger. */
  categories?: string[]
  /** Present only when a query $expands them (see agent/ledger.ts). */
  singleValueExtendedProperties?: { id: string; value: string }[]
}

/** Graph returns event times as a local-ish string plus a zone name. */
export interface GraphDateTime {
  dateTime: string
  timeZone: string
}

export interface GraphEvent {
  id: string
  subject: string | null
  start: GraphDateTime
  end: GraphDateTime
  isAllDay?: boolean
  organizer?: Recipient
}

export interface GraphUser {
  id: string
  displayName: string
  mail: string | null
  userPrincipalName: string
}

/** A conversation = the most recent message plus rollup metadata. */
export interface Conversation {
  conversationId: string
  latest: Message
  count: number
  unread: boolean
  hasAttachments: boolean
  /** Local, unsent reply draft (client-side only — not from Graph). */
  draft?: { text: string; updatedAt: number }
}

export interface GraphCollection<T> {
  value: T[]
  '@odata.nextLink'?: string
}

export type AttachmentKind = 'file' | 'reference' | 'item'

/** A normalized attachment across a whole conversation. */
export interface Attachment {
  id: string
  messageId: string
  name: string
  contentType: string
  size: number
  isInline: boolean
  kind: AttachmentKind
  /** base64 payload for file attachments (absent for reference/item). */
  contentBytes?: string
  /** Content-ID for inline images, referenced by cid: in the HTML body. */
  contentId?: string
  /** external URL for reference attachments (OneDrive / SharePoint links). */
  sourceUrl?: string
  /** the parent message's date — used to group the gallery by month. */
  date: string
  /** display name of whoever sent the parent message. */
  from?: string
}
