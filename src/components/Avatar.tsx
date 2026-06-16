import { useEffect, useMemo, useState } from 'react'
import { avatarColor, initials } from '../lib/format'
import { useAvatar } from '../data/hooks'

interface AvatarProps {
  name: string
  seed?: string
  /** Email used to look up a real photo (directory / Gravatar). */
  email?: string
  size?: number
  /** Explicit photo URL (e.g. the signed-in user) — wins over lookups. */
  src?: string | null
}

export function Avatar({ name, seed, email, size = 44, src }: AvatarProps) {
  const fallbackSeed = seed ?? email ?? name
  const { data: candidates } = useAvatar(email, fallbackSeed)

  // The ordered list of image URLs to try, newest source first.
  const sources = useMemo(
    () => (src ? [src] : (candidates ?? [])),
    [src, candidates],
  )
  const [idx, setIdx] = useState(0)
  useEffect(() => setIdx(0), [sources])

  const current = sources[idx]
  const bg = avatarColor(fallbackSeed)

  return (
    <div
      className="relative shrink-0 select-none overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {/* Initials sit underneath so there's never a blank circle while loading. */}
      <div
        className="flex h-full w-full items-center justify-center font-medium text-white"
        style={{ background: bg, fontSize: size * 0.38 }}
        aria-hidden
      >
        {initials(name)}
      </div>
      {current && (
        <img
          src={current}
          alt={name}
          loading="lazy"
          onError={() => setIdx((i) => i + 1)}
          className="absolute inset-0 h-full w-full bg-paper-sunk object-cover"
        />
      )}
    </div>
  )
}
