import { useSyncExternalStore } from 'react'

/**
 * Local, device-only reply drafts — just like WhatsApp. A draft is the unsent
 * text for a conversation; it prefills the reply box and floats the
 * conversation to the top until sent or cleared. Stored in localStorage so it
 * survives refreshes; never uploaded anywhere.
 */
export interface Draft {
  text: string
  updatedAt: number
}

const PREFIX = 'plume:draft:'

type Listener = () => void
const listeners = new Set<Listener>()
let version = 0

function emit() {
  version += 1
  for (const l of listeners) l()
}

export function getDraft(conversationId: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + conversationId)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

export function setDraft(conversationId: string, text: string): void {
  if (!text.trim()) {
    clearDraft(conversationId)
    return
  }
  try {
    const draft: Draft = { text, updatedAt: Date.now() }
    localStorage.setItem(PREFIX + conversationId, JSON.stringify(draft))
  } catch {
    /* storage full / unavailable — drafts are best-effort */
  }
  emit()
}

export function clearDraft(conversationId: string): void {
  try {
    localStorage.removeItem(PREFIX + conversationId)
  } catch {
    /* ignore */
  }
  emit()
}

function readAll(): Record<string, Draft> {
  const out: Record<string, Draft> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (raw) out[key.slice(PREFIX.length)] = JSON.parse(raw) as Draft
    }
  } catch {
    /* ignore */
  }
  return out
}

// Cache the snapshot so useSyncExternalStore sees a stable reference until a
// write bumps the version.
let cache: Record<string, Draft> = {}
let cacheVersion = -1

function getSnapshot(): Record<string, Draft> {
  if (cacheVersion !== version) {
    cache = readAll()
    cacheVersion = version
  }
  return cache
}

function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Reactive map of every saved draft, keyed by conversationId. */
export function useAllDrafts(): Record<string, Draft> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
