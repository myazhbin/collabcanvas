import { useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { userColour } from '../../utils/helpers'
import { Avatar, AVATAR_CLASS } from './Avatar'
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
            <Avatar
              key={node.uid}
              name={node.name}
              colour={userColour(node.uid, node.colour)}
              ring={isYou ? 'dark' : 'white'}
              title={isYou ? `${node.name} (you)` : node.name}
            />
          )
        })}

        {overflow > 0 && (
          <span className={`${AVATAR_CLASS} bg-neutral-300 text-neutral-700 ring-2 ring-white`}>
            +{overflow}
          </span>
        )}
      </div>

      <span className="text-xs text-neutral-500">{ordered.length} online</span>
    </div>
  )
}
