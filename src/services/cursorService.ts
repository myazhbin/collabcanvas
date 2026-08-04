import { ref, update } from 'firebase/database'
import { connectionStore, rtdb } from './firebase'
import { isSessionAnnounced, SESSIONS_PATH } from './presenceService'
import { THROTTLE_MS } from '../utils/constants'
import { sessionId } from '../utils/session'
import { throttle } from '../utils/throttle'
import type { Point } from '../utils/coords'
import type { CursorPayload } from '../utils/types'

/**
 * The cursor channel writes `cursor` onto the **existing** session node — the same node
 * presence owns, so `name` and `colour` are established once at announce time and never
 * resent per frame. At 20 Hz the difference between shipping an identity on every tick
 * and shipping two numbers is most of the wire budget.
 *
 * Everything expensive about this file is a conservation measure, and per PRD §4.5 those
 * are gate-critical code rather than optimisations: RTDB's bandwidth meter is **monthly**,
 * billing is deliberately off, and blowing it takes the database down for the rest of the
 * calendar month with no way to pay through it [R14].
 */
export type CursorChannel = {
  /** Publish a world-space position, or `null` to clear. Movement-gated and throttled. */
  publish: (world: Point | null) => void
  stop: () => void
}

/**
 * The three gates every write to this tab's session node shares.
 *
 * `isSessionAnnounced` is the one that is easy to leave out and expensive to debug:
 * `update()` on a missing path **creates** it, so any write that beats presence's announce
 * manufactures a node with a payload and no identity on it.
 */
function canWriteSession(): boolean {
  return connectionStore.getSnapshot().connected && isSessionAnnounced()
}

function sessionNode() {
  return ref(rtdb, `${SESSIONS_PATH}/${sessionId}`)
}

export function startCursorChannel(): CursorChannel {
  const node = ref(rtdb, `${SESSIONS_PATH}/${sessionId}`)
  let stopped = false
  let hidden = document.visibilityState === 'hidden'

  /** The last position handed to the throttle — the movement gate compares against this,
   *  not against the last one actually written, because a suppressed sample still lands
   *  via the trailing flush. */
  let last: Point | null = null

  const write = (cursor: CursorPayload | null) => {
    // Gate on the socket rather than letting the SDK queue. RTDB buffers writes in memory
    // while offline and flushes the whole backlog on reconnect — which for a cursor is
    // pure waste: it pays for a trail of positions the user already left behind, and the
    // reconnect itself carries the only one that still means anything [R9,R14].
    if (stopped || !canWriteSession()) return

    void update(node, { cursor }).catch((err) => {
      console.warn(`cursor write to /${SESSIONS_PATH}/${sessionId} failed`, err)
    })
  }

  const send = throttle(write, THROTTLE_MS)

  const clear = () => {
    // Cancel *before* writing the null. The other order lets a queued trailing flush
    // land after it and resurrect the cursor a frame later — which is exactly the ghost
    // that a hidden tab is supposed to stop showing.
    send.cancel()
    if (last === null) return
    last = null
    write(null)
  }

  const publish = (world: Point | null) => {
    if (stopped || hidden) return
    if (world === null) {
      clear()
      return
    }

    // The movement gate. A pointer resting on the canvas produces nothing at all, and
    // neither does a space-drag pan — panning moves the viewport by exactly the pointer
    // delta, so the world point underneath is unchanged and correctly not resent.
    if (last !== null && last.x === world.x && last.y === world.y) return
    last = { x: world.x, y: world.y }

    send({ x: world.x, y: world.y, t: Date.now() + connectionStore.getSnapshot().offset })
  }

  const onVisibility = () => {
    hidden = document.visibilityState === 'hidden'
    if (hidden) {
      clear()
      return
    }
    // Resume. `last` is already null from the clear, so the first move after coming back
    // always writes, even if the pointer never left the pixel it was on.
    last = null
  }

  document.addEventListener('visibilitychange', onVisibility)
  // A tab that goes to the background and stays there is the single realistic way to
  // blow the monthly cap, so start in whatever state the document is actually in rather
  // than assuming this mounted while visible [R14,R16].
  if (hidden) send.cancel()

  const stop = () => {
    stopped = true
    send.cancel()
    document.removeEventListener('visibilitychange', onVisibility)
    // Deliberately no null write here. This channel's lifetime is the presence node's
    // lifetime — both are keyed on the same uid — so the node is being removed anyway,
    // and a write racing a deletion is the one thing that can leave a ghost behind.
  }

  return { publish, stop }
}

/**
 * The in-flight drag channel — PRD Decision 9, confirmed.
 *
 * Positions stream onto the **same session node** as the cursor, at the same 20 Hz, and
 * Firestore sees exactly one transactional write per drag when the pointer is released.
 * The arithmetic is what forces this: Firestore's Spark tier allows 20,000 writes/day, so
 * a 20 Hz drag stream would exhaust an entire day's quota in about seventeen minutes of
 * cumulative dragging, and with billing off there is no way to pay through it [R14].
 *
 * The alternative — commit only on release, stream nothing — is cheaper to build but makes
 * remote rectangles *snap* instead of move, which fails acceptance item 5.
 */
export type DragPayload = { id: string; x: number; y: number }

export type DragChannel = {
  /** Stream a world position for the shape being dragged, or `null` on release. */
  publish: (drag: DragPayload | null) => void
  stop: () => void
}

export function startDragChannel(): DragChannel {
  const node = sessionNode()
  let stopped = false
  let last: DragPayload | null = null

  const write = (drag: DragPayload | null) => {
    if (stopped || !canWriteSession()) return

    void update(node, { drag }).catch((err) => {
      console.warn(`drag write to /${SESSIONS_PATH}/${sessionId} failed`, err)
    })
  }

  const send = throttle(write, THROTTLE_MS)

  const clear = () => {
    // Cancel the pending flush before writing null, or a queued in-flight position lands
    // *after* the release and pins the rectangle at a stale spot for every other client
    // until the next drag. This is the same ordering the cursor clear depends on.
    send.cancel()
    if (last === null) return
    last = null
    write(null)
  }

  const publish = (drag: DragPayload | null) => {
    if (stopped) return
    if (drag === null) {
      clear()
      return
    }

    // Movement-gated like the cursor: a held-but-motionless pointer writes nothing.
    if (last !== null && last.id === drag.id && last.x === drag.x && last.y === drag.y) return
    last = { ...drag }
    send({ ...drag })
  }

  // A tab hidden mid-drag stays connected, so `onDisconnect` never fires and the shape
  // would sit frozen at its last in-flight position for everyone else. Clearing the RTDB
  // half here is only part of the fix — the Firestore `draggedBy` lock is released by
  // CanvasProvider on the same event [R16].
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') clear()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const stop = () => {
    // Clear before tearing down rather than after: unlike the cursor, a leftover `drag`
    // key survives on a node that presence is *not* removing (a drag channel restart is
    // not a sign-out), and it would keep a rectangle pinned for everyone else.
    clear()
    stopped = true
    send.cancel()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  return { publish, stop }
}
