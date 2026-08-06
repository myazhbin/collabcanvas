import { onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database'
import { rtdb } from './firebase'
import { CANVAS_ID, PRESENCE } from '../utils/constants'
import { createSerialQueue } from '../utils/serialQueue'
import { sessionId } from '../utils/session'
import type { SessionNode } from '../utils/types'

type PresenceIdentity = { uid: string; name: string; colour: string }

export const SESSIONS_PATH = `sessions/${CANVAS_ID}`

type SessionWrite = Omit<SessionNode, 'lastSeen'> & { lastSeen: object }

type ActiveSession = { teardown: () => Promise<void>; isAnnounced: () => boolean }
let active: ActiveSession | null = null

const serialise = createSerialQueue()

export function startPresence(identity: PresenceIdentity): () => Promise<void> {
  const node = ref(rtdb, `${SESSIONS_PATH}/${sessionId}`)
  let stopped = false
  let connected = false

  let announced = false

  const announce = () =>
    serialise(async () => {
      if (stopped || !connected) return

      await onDisconnect(node).remove()
      if (stopped) return

      const payload: SessionWrite = {
        uid: identity.uid,
        name: identity.name,
        colour: identity.colour,
        cursor: null,
        drag: null,
        lastSeen: serverTimestamp(),
      }
      await set(node, payload)
      announced = true
    }).catch((err) => {
      announced = false
      console.error(
        `presence announce to /${SESSIONS_PATH}/${sessionId} failed — if this is permission_denied, the DEPLOYED database rules do not match database.rules.json [R5]`,
        err,
      )
    })

  const unsubscribe = onValue(ref(rtdb, '.info/connected'), (snap) => {
    connected = snap.val() === true

    if (!connected) {
      announced = false
      return
    }

    void announce()
  })

  const heartbeat = setInterval(() => {
    if (stopped || !connected) return

    if (!announced) {
      void announce()
      return
    }

    void update(node, { lastSeen: serverTimestamp() }).catch((err) => {
      announced = false
      console.warn('presence heartbeat failed; will re-announce', err)
    })
  }, PRESENCE.heartbeatMs)

  const teardown = async () => {
    if (stopped) return
    stopped = true
    clearInterval(heartbeat)
    unsubscribe()
    if (active?.teardown === teardown) active = null

    await serialise(async () => {
      await onDisconnect(node).cancel()
      await remove(node)
    })
  }

  active = { teardown, isAnnounced: () => announced && !stopped }
  return teardown
}

export function isSessionAnnounced(): boolean {
  return active?.isAnnounced() ?? false
}

export async function leavePresence(): Promise<void> {
  await active?.teardown()
}
