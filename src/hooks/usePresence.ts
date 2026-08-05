import { useEffect, useMemo, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { rtdb } from '../services/firebase'
import { SESSIONS_PATH, startPresence } from '../services/presenceService'
import { useAuth } from './useAuth'
import { useConnection } from './useConnection'
import { generateUserColor } from '../utils/helpers'
import { dedupeByUid, isStale, type PresenceNode } from '../utils/presenceUtils'
import { PRESENCE } from '../utils/constants'
import { sessionId } from '../utils/session'
import type { SessionNode } from '../utils/types'

export type PresenceView = {
  /** One entry per human, already deduped and staleness-filtered. */
  online: PresenceNode[]
  /** Every live session node, keyed by sessionId — PR 6 renders one cursor per key. */
  sessions: Record<string, SessionNode>
}

/**
 * Publishes this tab's session node and reads back everyone else's.
 *
 * The listener mounts inside an effect keyed on `user?.uid`, never `[]`. Mounted at `[]`
 * it attaches during the window where `onAuthStateChanged` has not yet resolved, gets
 * denied by the rules, and presents as "nobody is online" with one console error — on
 * the deployed build only, because localhost under permissive rules works fine [R4]. It
 * also has to come *down* on sign-out, or every still-mounted listener floods the console
 * with permission-denied [R19].
 */
export function usePresence(): PresenceView {
  const { user, displayName } = useAuth()
  const [sessions, setSessions] = useState<Record<string, SessionNode>>({})
  // For the staleness filter's clock-skew correction only — the connection *badge* reads
  // the same store directly, in the navbar.
  const { offset } = useConnection()

  // Re-evaluates staleness on a timer. A peer that dies sends nothing, so nothing
  // triggers a listener callback, so without this their entry sits in the list forever
  // no matter how good the filter is.
  const [sweep, setSweep] = useState(0)

  const uid = user?.uid

  useEffect(() => {
    if (!uid) return

    const stop = startPresence({ uid, name: displayName, colour: generateUserColor(uid) })
    const unsubscribe = onValue(
      ref(rtdb, SESSIONS_PATH),
      (snap) => {
        setSessions((snap.val() as Record<string, SessionNode> | null) ?? {})
      },
      (err) => {
        // Without this callback a denied listen resolves to nothing at all — no throw, no
        // log, just a permanently empty list that looks exactly like "nobody else is
        // here". That silence is most of what makes R5 expensive: the rules are the last
        // thing you suspect. Say it out loud instead.
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
      // The wire is a trust boundary. A node can arrive without a uid — caught mid-write,
      // or left by a client whose announce failed — and there is nothing sensible to do
      // with it: it cannot be grouped, cannot be coloured, and renders as a nameless
      // ghost. Dropping it is not the same as the staleness filter, which must fail
      // OPEN [R17]; this one is about a node that is unusable, not one that might be old.
      .filter(([, node]) => typeof node?.uid === 'string' && node.uid.length > 0)
      .map(([key, node]): PresenceNode => ({ ...node, sessionId: key }))
      // Never filter your own session [R17]. Your node's `lastSeen` is a sentinel for the
      // moment between writing it and the server resolving it, and dropping yourself from
      // your own presence list in that window looks like the feature is broken.
      .filter((node) => node.sessionId === sessionId || !isStale(node.lastSeen, now, offset))

    return dedupeByUid(live)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sweep` is the ticker
  }, [sessions, offset, sweep])

  return { online, sessions }
}
