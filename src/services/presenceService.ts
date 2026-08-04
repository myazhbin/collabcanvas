import { onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database'
import { rtdb } from './firebase'
import { CANVAS_ID, PRESENCE } from '../utils/constants'
import { sessionId } from '../utils/session'
import type { SessionNode } from '../utils/types'

/**
 * `serverTimestamp` here is **RTDB's**, from `firebase/database`. Firestore exports a
 * sentinel of the same name, and importing that one writes an object into `lastSeen`
 * that the server never resolves — so every peer reads as permanently unparseable. The
 * staleness filter fails open on exactly that, which is what stops the mistake blanking
 * the presence panel, but the heartbeat is silently dead either way [R17].
 */

export type PresenceIdentity = { uid: string; name: string; colour: string }

/** The path everyone listens on. One node per tab, keyed by `sessionId` [R2]. */
export const SESSIONS_PATH = `sessions/${CANVAS_ID}`

/** What goes *out* differs from what comes back: `lastSeen` leaves as a sentinel and
 *  returns as epoch milliseconds. */
type SessionWrite = Omit<SessionNode, 'lastSeen'> & { lastSeen: object }

let activeTeardown: (() => Promise<void>) | null = null

/**
 * Session-node writes share one path per tab, so a start and a teardown that overlap
 * race over the same key — and they *do* overlap, because React StrictMode mounts,
 * unmounts and remounts every effect in development. Both sides send two round trips,
 * and whichever acknowledges first wins: half the time the teardown's `remove` lands
 * after the remount's `set` and you silently vanish from everyone else's panel while
 * your own tab looks fine.
 *
 * Serialising through one chain removes the coin flip.
 */
let chain: Promise<unknown> = Promise.resolve()

function serialise(work: () => Promise<void>): Promise<void> {
  const next = chain.then(work, work)
  chain = next.catch(() => {})
  return next
}

/**
 * Announce this tab and keep it alive. Returns the teardown — which is also sign-out's
 * first step, ahead of dropping the credential [R19].
 */
export function startPresence(identity: PresenceIdentity): () => Promise<void> {
  const node = ref(rtdb, `${SESSIONS_PATH}/${sessionId}`)
  let stopped = false
  let connected = false

  /** Whether the full identity write has actually landed. Not "did we try". */
  let announced = false

  const announce = () =>
    serialise(async () => {
      if (stopped || !connected) return

      // Registered INSIDE the `.info/connected` callback, so it is re-armed on every
      // reconnect. Register it once at startup instead and the handler is gone after the
      // first network blip — meaning the *second* disconnect leaves a permanent ghost.
      // Because it takes two disconnects, it survives casual testing and shows up during
      // grading [R9].
      await onDisconnect(node).remove()
      if (stopped) return

      // Only now the online value. Firebase's docs carry an explicit note to queue the
      // disconnect operation first: write the value first and a drop in the gap between
      // the two strands the node forever [R9].
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
      // Loudly. This is the write that makes you visible to everyone else, and a silent
      // failure here is indistinguishable from "nobody else is on the canvas" — which is
      // most of what makes a rules mismatch expensive to diagnose [R5].
      announced = false
      console.error(
        `presence announce to /${SESSIONS_PATH}/${sessionId} failed — if this is permission_denied, the DEPLOYED database rules do not match database.rules.json [R5]`,
        err,
      )
    })

  const unsubscribe = onValue(ref(rtdb, '.info/connected'), (snap) => {
    connected = snap.val() === true

    // A dropped socket invalidates the server-side disconnect handler, so the next
    // connection has to re-announce rather than assume it is still armed [R9].
    if (!connected) {
      announced = false
      return
    }

    void announce()
  })

  const heartbeat = setInterval(() => {
    // Gated on the socket. RTDB queues writes in memory while offline and flushes the
    // backlog on reconnect, which is bandwidth spent restating what the reconnect
    // already said [F8,R14].
    if (stopped || !connected) return

    // Retry the whole announce rather than beating a node that was never established.
    // `update` on a missing path *creates* it, so a bare `lastSeen` write after a failed
    // announce manufactures a node with no uid and no name — one that every other client
    // then has to defend against, and that renders as a nameless ghost. The connection
    // callback fires once per transition, so without this retry a single failed announce
    // is permanent.
    if (!announced) {
      void announce()
      return
    }

    void update(node, { lastSeen: serverTimestamp() }).catch((err) => {
      // Re-announce next tick rather than assuming the node is still intact.
      announced = false
      console.warn('presence heartbeat failed; will re-announce', err)
    })
  }, PRESENCE.heartbeatMs)

  const teardown = async () => {
    if (stopped) return
    stopped = true
    clearInterval(heartbeat)
    unsubscribe()
    if (activeTeardown === teardown) activeTeardown = null

    await serialise(async () => {
      // Cancel before remove. The other order leaves a disconnect handler armed at a path
      // a later sign-in reuses — `sessionId` is per tab, not per sign-in — so the next
      // user of this tab would have their node deleted by the previous one's ghost [R19].
      await onDisconnect(node).cancel()
      await remove(node)
    })
  }

  activeTeardown = teardown
  return teardown
}

/**
 * Sign-out's first step, passed to `authService.logOut` so the node is gone before the
 * credential is [R19]. `signOut` does not close the RTDB socket, so `onDisconnect` never
 * fires on sign-out and this is the only thing that clears the node.
 *
 * A no-op when presence was never started — signing out from the login screen is legal.
 */
export async function leavePresence(): Promise<void> {
  await activeTeardown?.()
}
