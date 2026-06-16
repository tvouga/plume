import { useMemo, useState } from 'react'
import {
  PenSquare,
  Search,
  X,
  Loader2,
  Home,
  Inbox,
  Archive as ArchiveIcon,
  Send as SendIcon,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  useArchive,
  useConversations,
  useMarkRead,
  useMe,
  useMyPhoto,
} from '../data/hooks'
import type { Conversation } from '../graph/types'
import { useAllDrafts } from '../lib/drafts'
import { Avatar } from './Avatar'
import { ConversationList } from './ConversationList'
import { ThreadView } from './ThreadView'
import { NewMessageModal } from './NewMessageModal'
import type { ViewKey } from '../data/hooks'

const VIEWS: { key: ViewKey; label: string; icon: typeof Inbox }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'archive', label: 'Archive', icon: ArchiveIcon },
  { key: 'sentitems', label: 'Sent', icon: SendIcon },
]

export function AppShell() {
  const { signOut } = useAuth()
  const { data: me } = useMe()
  const { data: photo } = useMyPhoto()
  const [folder, setFolder] = useState<ViewKey>('home')
  const [inboxTab, setInboxTab] = useState<'focused' | 'other'>('focused')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [composing, setComposing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const classification = folder === 'inbox' ? inboxTab : undefined
  const { data: conversations, isLoading, isFetching } = useConversations(
    folder,
    search,
    classification,
  )
  const archive = useArchive()
  const markRead = useMarkRead()
  const drafts = useAllDrafts()

  const myEmail = me?.mail ?? me?.userPrincipalName ?? ''

  // Attach local drafts and float drafted conversations to the top, using the
  // draft's edit time — WhatsApp behaviour.
  const displayed = useMemo(() => {
    const list = conversations ?? []
    if (Object.keys(drafts).length === 0) return list
    const withDrafts = list.map((c) =>
      drafts[c.conversationId]
        ? { ...c, draft: drafts[c.conversationId] }
        : c,
    )
    const effTime = (c: Conversation) => {
      const received = new Date(c.latest.receivedDateTime).getTime()
      return c.draft ? Math.max(received, c.draft.updatedAt) : received
    }
    return [...withDrafts].sort((a, b) => effTime(b) - effTime(a))
  }, [conversations, drafts])

  function openConversation(c: Conversation) {
    setSelected(c)
    if (c.unread) markRead.mutate({ id: c.latest.id, isRead: true })
  }

  function handleArchive(id: string) {
    archive.mutate(id)
    if (selected?.latest.id === id) setSelected(null)
  }

  const empty = !isLoading && displayed.length === 0

  return (
    <div className="flex h-full overflow-hidden bg-paper-soft">
      {/* Left: list panel */}
      <aside
        className={`flex w-full flex-col border-r border-paper-sunk bg-paper md:w-[380px] lg:w-[420px] ${
          selected ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top bar */}
        <div className="relative flex items-center gap-3 px-4 pb-2 pt-4">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full ring-2 ring-transparent transition hover:ring-paper-sunk"
          >
            <Avatar
              name={me?.displayName ?? 'Me'}
              seed={myEmail}
              email={myEmail}
              src={photo ?? undefined}
              size={40}
            />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold text-ink">
              {me?.displayName ?? 'Plume'}
            </h1>
            <p className="truncate text-xs text-ink-faint">{myEmail}</p>
          </div>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute left-4 top-16 z-20 w-48 animate-pop-in rounded-xl bg-paper p-1 shadow-pop">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    signOut()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-paper-soft"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl bg-paper-soft px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search">
                <X className="h-4 w-4 text-ink-faint" />
              </button>
            )}
          </div>
        </div>

        {/* Folder tabs */}
        {!search && (
          <div className="flex gap-1 px-3 pb-2">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setFolder(key)
                  setSelected(null)
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  folder === key
                    ? 'bg-ink text-white'
                    : 'text-ink-muted hover:bg-paper-soft'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Outlook-style Focused / Other split, inbox only */}
        {!search && folder === 'inbox' && (
          <div className="flex gap-5 border-b border-paper-sunk px-4">
            {(['focused', 'other'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setInboxTab(t)
                  setSelected(null)
                }}
                className={`-mb-px border-b-2 py-2 text-sm font-medium capitalize transition ${
                  inboxTab === t
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-faint hover:text-ink-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-ink-faint">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : empty ? (
            <EmptyList search={search} folder={folder} />
          ) : (
            <ConversationList
              conversations={displayed}
              selectedId={selected?.conversationId ?? null}
              myEmail={myEmail}
              onSelect={openConversation}
              onArchive={handleArchive}
            />
          )}
        </div>

        {/* Compose FAB */}
        <button
          onClick={() => setComposing(true)}
          className="absolute bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-pop transition active:scale-95 md:bottom-5 md:right-5"
          aria-label="New message"
        >
          <PenSquare className="h-6 w-6" />
        </button>
      </aside>

      {/* Right: thread panel */}
      <main className={`min-w-0 flex-1 ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected ? (
          <ThreadView
            conversation={selected}
            myEmail={myEmail}
            onBack={() => setSelected(null)}
            onArchive={handleArchive}
          />
        ) : (
          <NothingSelected />
        )}
      </main>

      {composing && <NewMessageModal onClose={() => setComposing(false)} />}
    </div>
  )
}

function EmptyList({ search, folder }: { search: string; folder: ViewKey }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <Inbox className="h-10 w-10 text-ink-faint" />
      <p className="mt-3 text-sm font-medium text-ink-muted">
        {search
          ? 'No messages match your search.'
          : folder === 'inbox' || folder === 'home'
            ? 'Inbox zero. Nicely done.'
            : 'Nothing here yet.'}
      </p>
    </div>
  )
}

function NothingSelected() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center bg-paper-soft text-center md:flex">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-paper shadow-soft">
        <Inbox className="h-7 w-7 text-ink-faint" />
      </div>
      <p className="mt-4 text-[15px] font-medium text-ink-muted">
        Pick a conversation
      </p>
      <p className="mt-1 text-sm text-ink-faint">
        Your messages open here, like a chat.
      </p>
    </div>
  )
}
