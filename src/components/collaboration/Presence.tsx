import { useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { generateUserColor } from '../../utils/helpers'
import type { PresenceNode } from '../../utils/presenceUtils'

const MAX_SHOWN = 5

/**
 * The online stack. One avatar per **uid**, not per tab — `usePresence` has already
 * collapsed them, because two tabs of one account are two session nodes and one human
 * [R2]. Cursors go the other way in PR 6: one per session.
 */
export function Presence({ online }: { online: PresenceNode[] }) {
  const { user } = useAuth()

  // You first, so your own avatar holds still while others come and go.
  const ordered = useMemo(() => {
    const mine = online.filter((node) => node.uid === user?.uid)
    const others = online.filter((node) => node.uid !== user?.uid)
    return [...mine, ...others]
  }, [online, user?.uid])

  if (ordered.length === 0) return null

  const shown = ordered.slice(0, MAX_SHOWN)
  const overflow = ordered.length - shown.length

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5">
        {shown.map((node) => {
          const isYou = node.uid === user?.uid
          return (
            <span
              key={node.uid}
              title={isYou ? `${node.name} (you)` : node.name}
              // The written colour, with the local derivation as a fallback — a node
              // read back mid-write can be missing it, and an empty fill renders black.
              style={{ backgroundColor: node.colour || generateUserColor(node.uid) }}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ${
                isYou ? 'ring-neutral-900' : 'ring-white'
              }`}
            >
              {initial(node.name)}
            </span>
          )
        })}

        {overflow > 0 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-300 text-[10px] font-semibold text-neutral-700 ring-2 ring-white">
            +{overflow}
          </span>
        )}
      </div>

      <span className="text-xs text-neutral-500">
        {ordered.length} online
      </span>
    </div>
  )
}

function initial(name: string): string {
  return name?.trim()?.[0]?.toUpperCase() ?? '?'
}
