import { useState } from 'react'
import {
  X,
  Download,
  Loader2,
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
import type { Attachment } from '../graph/types'
import {
  downloadAttachment,
  fileCategory,
  formatBytes,
  groupByMonth,
  imageDataUrl,
  isImage,
  openAttachment,
  type FileCategory,
} from '../lib/files'

type Tab = 'media' | 'files' | 'links'

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

interface AttachmentsPanelProps {
  attachments: Attachment[]
  loading: boolean
  onClose: () => void
}

export function AttachmentsPanel({
  attachments,
  loading,
  onClose,
}: AttachmentsPanelProps) {
  const media = attachments.filter(isImage)
  const files = attachments.filter((a) => a.kind === 'file' && !isImage(a))
  const links = attachments.filter((a) => a.kind === 'reference')

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'media', label: 'Media', count: media.length },
    { key: 'files', label: 'Docs', count: files.length },
    { key: 'links', label: 'Links', count: links.length },
  ]
  const available = tabs.filter((t) => t.count > 0)

  const [tab, setTab] = useState<Tab>('media')
  const [lightbox, setLightbox] = useState<Attachment | null>(null)
  const active = available.some((t) => t.key === tab) ? tab : available[0]?.key

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-lg animate-pop-in flex-col overflow-hidden rounded-t-2xl bg-paper shadow-pop sm:h-[80vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-paper-sunk px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Attachments</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-sunk"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Tabs */}
        {available.length > 0 && (
          <div className="flex gap-1 border-b border-paper-sunk px-3 py-2">
            {available.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active === t.key
                    ? 'bg-ink text-white'
                    : 'text-ink-muted hover:bg-paper-soft'
                }`}
              >
                {t.label}
                <span
                  className={`text-xs ${
                    active === t.key ? 'text-white/70' : 'text-ink-faint'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-ink-faint">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : available.length === 0 ? (
            <Empty />
          ) : active === 'media' ? (
            <MediaGrid items={media} onOpen={setLightbox} />
          ) : active === 'files' ? (
            <FileList items={files} />
          ) : (
            <LinkList items={links} />
          )}
        </div>
      </div>
    </div>

      {lightbox && (
        <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}

function MediaGrid({
  items,
  onOpen,
}: {
  items: Attachment[]
  onOpen: (a: Attachment) => void
}) {
  return (
    <div className="space-y-6">
      {groupByMonth(items).map((group) => (
        <section key={group.label}>
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">
            {group.label}
          </h3>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {group.items.map((a) => (
              <button
                key={a.id}
                onClick={() => onOpen(a)}
                title={a.from ? `From ${a.from}` : a.name}
                className="group relative aspect-square overflow-hidden rounded-lg bg-paper-sunk"
              >
                <img
                  src={imageDataUrl(a)}
                  alt={a.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
                {a.from && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-left text-[11px] font-medium text-white">
                    {a.from}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function FileList({ items }: { items: Attachment[] }) {
  return (
    <div className="space-y-6">
      {groupByMonth(items).map((group) => (
        <section key={group.label}>
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">
            {group.label}
          </h3>
          <ul className="space-y-1">
            {group.items.map((a) => (
              <li key={a.id}>
                <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-paper-soft">
                  <FileGlyph category={fileCategory(a)} />
                  <button
                    onClick={() => openAttachment(a)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-medium text-ink">
                      {a.name}
                    </div>
                    <div className="truncate text-xs text-ink-faint">
                      {[a.from, formatBytes(a.size), shortDate(a.date)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </button>
                  <button
                    onClick={() => downloadAttachment(a)}
                    title="Download"
                    aria-label={`Download ${a.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-paper-sunk hover:text-accent"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function LinkList({ items }: { items: Attachment[] }) {
  return (
    <ul className="space-y-1">
      {items.map((a) => (
        <li key={a.id}>
          <button
            onClick={() => openAttachment(a)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-paper-soft"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">
                {a.name}
              </div>
              <div className="truncate text-xs text-ink-faint">
                {[a.from, a.sourceUrl ?? 'Cloud link', shortDate(a.date)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

const GLYPHS: Record<FileCategory, { icon: typeof File; color: string }> = {
  image: { icon: ImageIcon, color: 'text-emerald-600 bg-emerald-50' },
  pdf: { icon: FileText, color: 'text-red-600 bg-red-50' },
  doc: { icon: FileText, color: 'text-blue-600 bg-blue-50' },
  sheet: { icon: FileSpreadsheet, color: 'text-green-600 bg-green-50' },
  slide: { icon: Presentation, color: 'text-orange-600 bg-orange-50' },
  archive: { icon: FileArchive, color: 'text-amber-600 bg-amber-50' },
  audio: { icon: Music, color: 'text-purple-600 bg-purple-50' },
  video: { icon: Film, color: 'text-pink-600 bg-pink-50' },
  file: { icon: File, color: 'text-ink-muted bg-paper-sunk' },
}

function FileGlyph({ category }: { category: FileCategory }) {
  const { icon: Icon, color } = GLYPHS[category]
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
    >
      <Icon className="h-5 w-5" />
    </div>
  )
}

function Lightbox({
  attachment,
  onClose,
}: {
  attachment: Attachment
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-ink/90 backdrop-blur"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm">{attachment.name}</div>
          {(attachment.from || attachment.date) && (
            <div className="truncate text-xs text-white/60">
              {[attachment.from, longDate(attachment.date)]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              downloadAttachment(attachment)
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10"
            aria-label="Download"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <img
          src={imageDataUrl(attachment)}
          alt={attachment.name}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <ImageIcon className="h-10 w-10 text-ink-faint" />
      <p className="mt-3 text-sm font-medium text-ink-muted">
        No attachments in this conversation.
      </p>
    </div>
  )
}
