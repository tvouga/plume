import { useState } from 'react'
import {
  Loader2,
  Download,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  File,
  Music,
  Film,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react'
import type { Attachment, Message } from '../graph/types'
import { useMessageAttachments } from '../data/hooks'
import { useMailApi } from '../data/useMailApi'
import {
  downloadAttachment,
  fileCategory,
  formatBytes,
  type FileCategory,
} from '../lib/files'

const ICONS: Record<FileCategory, typeof File> = {
  image: ImageIcon,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slide: Presentation,
  archive: FileArchive,
  audio: Music,
  video: Film,
  file: File,
}

const ICON_COLOR: Record<FileCategory, string> = {
  image: 'text-emerald-600',
  pdf: 'text-red-600',
  doc: 'text-blue-600',
  sheet: 'text-green-600',
  slide: 'text-orange-600',
  archive: 'text-amber-600',
  audio: 'text-purple-600',
  video: 'text-pink-600',
  file: 'text-ink-muted',
}

/** Compact, downloadable attachment chips shown inside a message bubble. */
export function MessageAttachments({
  message,
  mine,
}: {
  message: Message
  mine: boolean
}) {
  const { data, isLoading } = useMessageAttachments(message)
  const mail = useMailApi()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!message.hasAttachments) return null

  const items = (data ?? []).filter(
    (a) =>
      !a.isInline ||
      (a.contentType.startsWith('image/') && a.size > 30_000),
  )

  async function handleDownload(a: Attachment) {
    if (busyId) return
    setBusyId(a.id)
    try {
      const full = await mail.getAttachment(
        message.id,
        a.id,
        message.receivedDateTime,
      )
      downloadAttachment(full)
    } finally {
      setBusyId(null)
    }
  }

  // While metadata loads, keep it quiet — no flash of "Has attachments".
  if (isLoading && items.length === 0) {
    return (
      <div
        className={`mt-2 flex items-center gap-1.5 text-xs ${
          mine ? 'text-mine-ink/70' : 'text-ink-faint'
        }`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    )
  }
  if (items.length === 0) return null

  const rowBg = mine ? 'bg-black/[0.05] hover:bg-black/[0.08]' : 'bg-paper-soft hover:bg-paper-sunk'

  return (
    <div className="mt-2 space-y-1">
      {items.map((a) => {
        const cat = fileCategory(a)
        const Icon = ICONS[cat]
        const busy = busyId === a.id
        return (
          <button
            key={a.id}
            onClick={() => handleDownload(a)}
            title={`Download ${a.name}`}
            className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${rowBg}`}
          >
            {a.kind === 'reference' ? (
              <ExternalLink className="h-4 w-4 shrink-0 text-accent" />
            ) : busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-muted" />
            ) : (
              <Icon className={`h-4 w-4 shrink-0 ${ICON_COLOR[cat]}`} />
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {a.name}
            </span>
            {a.size > 0 && (
              <span className="shrink-0 text-[11px] text-ink-faint">
                {formatBytes(a.size)}
              </span>
            )}
            <Download className="h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
          </button>
        )
      })}
    </div>
  )
}
