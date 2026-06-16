import type { Attachment } from '../graph/types'

export type FileCategory =
  | 'image'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'archive'
  | 'audio'
  | 'video'
  | 'file'

export function isImage(a: Attachment): boolean {
  return a.kind === 'file' && a.contentType.startsWith('image/') && !!a.contentBytes
}

export function fileCategory(a: Attachment): FileCategory {
  const t = a.contentType.toLowerCase()
  const n = a.name.toLowerCase()
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('audio/')) return 'audio'
  if (t.startsWith('video/')) return 'video'
  if (t.includes('pdf') || n.endsWith('.pdf')) return 'pdf'
  if (t.includes('sheet') || /\.(xlsx?|csv|numbers)$/.test(n)) return 'sheet'
  if (t.includes('presentation') || /\.(pptx?|key)$/.test(n)) return 'slide'
  if (t.includes('word') || /\.(docx?|pages|txt|rtf|md)$/.test(n)) return 'doc'
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'archive'
  return 'file'
}

export function formatBytes(n: number): string {
  if (!n) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = n
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

/** Read a picked File as base64 (no data: prefix) for Graph fileAttachment. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      // Strip the "data:<type>;base64," prefix that readAsDataURL adds.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Inline data URL for an image attachment (safe for <img src>). */
export function imageDataUrl(a: Attachment): string {
  return `data:${a.contentType};base64,${a.contentBytes}`
}

function toBlobUrl(a: Attachment): string {
  const binary = atob(a.contentBytes ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], {
    type: a.contentType || 'application/octet-stream',
  })
  return URL.createObjectURL(blob)
}

/** Trigger a browser download of a file attachment. */
export function downloadAttachment(a: Attachment): void {
  if (a.kind === 'reference' && a.sourceUrl) {
    window.open(a.sourceUrl, '_blank', 'noopener')
    return
  }
  if (!a.contentBytes) return
  const url = toBlobUrl(a)
  const link = document.createElement('a')
  link.href = url
  link.download = a.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Open a file attachment in a new tab (falls back to download). */
export function openAttachment(a: Attachment): void {
  if (a.kind === 'reference' && a.sourceUrl) {
    window.open(a.sourceUrl, '_blank', 'noopener')
    return
  }
  if (!a.contentBytes) return
  const url = toBlobUrl(a)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function monthKey(iso: string): number {
  const d = new Date(iso)
  return d.getFullYear() * 12 + d.getMonth()
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

/** Group dated items into month sections, newest month first. */
export function groupByMonth<T extends { date: string }>(
  items: T[],
): { label: string; items: T[] }[] {
  const map = new Map<number, { label: string; items: T[] }>()
  for (const it of items) {
    const k = monthKey(it.date)
    if (!map.has(k)) map.set(k, { label: monthLabel(it.date), items: [] })
    map.get(k)!.items.push(it)
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, value]) => value)
}
