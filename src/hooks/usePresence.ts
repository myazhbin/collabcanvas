import { useEffect, useMemo, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { rtdb } from '../services/firebase'
import { SESSIONS_PATH, startPresence } from '../services/presenceService'
import { useAuth } from './useAuth'
import { useConnection } from './useConnection'
import { userColour } from '../utils/helpers'
import { dedupeByUid, isStale, type PresenceNode } from '../utils/presenceUtils'
import { PRESENCE } from '../utils/constants'
import { sessionId } from '../utils/session'
import type { SessionNode } from '../utils/types'

export type PresenceView = {
  online: PresenceNode[]
  sessions: Record<string, SessionNode>
}

export function usePresence(): PresenceView {
  const { user, displayName } = useAuth()
  const [sessions, setSessions] = useState<Record<string, SessionNode>>({})
  const { offset } = useConnection()

  const [sweep, setSweep] = useState(0)

  const uid = user?.uid

  useEffect(() => {
    if (!uid) return

    const stop = startPresence({ uid, name: displayName, colour: userColour(uid) })
    const unsubscribe = onValue(
      ref(rtdb, SESSIONS_PATH),
      (snap) => {
        setSessions((snap.val() as Record<string, SessionNode> | null) ?? {})
      },
      (err) => {
        console.error(
          `presence listen on /${SESSIONS_PATH} failed — check the DEPLOYED database rules against database.rules.json [R5]`,
          err,
        )
      },
    )
    const sweeper = setInterval(() => setSweep((n) => n + 1), PRESENCE.sweepMs)

    return () => {
      clearInterval(sweeper)
      unsubscribe()
      setSessions({})
      void stop()
    }
  }, [uid, displayName])

  const online = useMemo(() => {
    const now = Date.now()

    const live = Object.entries(sessions)
      .filter(([, node]) => typeof node?.uid === 'string' && node.uid.length > 0)
      .map(([key, node]): PresenceNode => ({ ...node, sessionId: key }))
      .filter((node) => node.sessionId === sessionId || !isStale(node.lastSeen, now, offset))

    return dedupeByUid(live)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, offset, sweep])

  return { online, sessions }
}
