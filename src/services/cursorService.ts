import { ref, update } from 'firebase/database'
import { connectionStore, rtdb } from './firebase'
import { isSessionAnnounced, SESSIONS_PATH } from './presenceService'
import { THROTTLE_MS } from '../utils/constants'
import { sessionId } from '../utils/session'
import { throttle } from '../utils/throttle'
import type { Point } from '../utils/coords'
import type { CursorPayload, DragPayload } from '../utils/types'

/**
 * The two high-frequency channels, both writing onto the **existing** session node that
 * presence owns — the same node, so `name` and `colour` are established once at announce
 * time and never resent per frame. At 20 Hz the difference between shipping an identity on
 * every tick and shipping two numbers is most of the wire budget.
 *
 * Everything expensive about this file is a conservation measure, and per PRD §4.5 those
 * are gate-critical code rather than optimisations: RTDB's bandwidth meter is **monthly**,
 * billing is deliberately off, and blowing it takes the database down for the rest of the
 * calendar month with no way to pay through it [R14].
 */

export type Channel<T> = {
  /** Publish a value, or `null` to clear the field. Movement-gated and throttled. */
  publish: (value: T | null) => void
  stop: () => void
}

/** Everything the two channels do *not* share. Both differences are load-bearing, and both
 *  are explained where they are chosen rather than here. */
type ChannelSpec<T> = {
  /** The one key on the session node this channel owns — see `SessionNode`. */
  field: 'cursor' | 'drag'
  /** The movement gate: true when a sample says nothing the last one already said. */
  isSame: (last: T, next: T) => boolean
  /** Whether a hidden tab suppresses `publish` outright, on top of clearing the field. */
  pauseWhileHidden: boolean
  /** Whether `stop()` clears the field before tearing down. */
  clearOnStop: boolean
}

/**
 * A throttled, movement-gated writer for one field on this tab's session node.
 *
 * The parts that are easy to get wrong and expensive to debug live here, once: the write
 * gates, the cancel-before-clear ordering, and the hidden-tab teardown.
 */
function startChannel<T>(spec: ChannelSpec<T>): Channel<T> {
  const node = ref(rtdb, `${SESSIONS_PATH}/${sessionId}`)
  let stopped = false
  let hidden = document.visibilityState === 'hidden'

  /** The last value handed to the throttle — the movement gate compares against this, not
   *  against the last one actually written, because a suppressed sample still lands via
   *  the trailing flush. */
  let last: T | null = null

  const write = (value: T | null) => {
    // Two gates, and neither is an optimisation.
    //
    // The socket: RTDB buffers writes in memory while offline and flushes the whole backlog
    // on reconnect, which for a position is pure waste — it pays for a trail the user
    // already left behind, and the reconnect itself carries the only sample that still
    // means anything [R9,R14].
    //
    // `isSessionAnnounced`: `update()` on a missing path **creates** it, so a write that
    // beats presence's announce manufactures a session node carrying a payload and no
    // `uid`, `name` or `colour` — the nameless ghost PR 5 hit.
    if (stopped || !connectionStore.getSnapshot().connected || !isSessionAnnounced()) return

    void update(node, { [spec.field]: value }).catch((err) => {
      console.warn(`${spec.field} write to /${SESSIONS_PATH}/${sessionId} failed`, err)
    })
  }

  const send = throttle(write, THROTTLE_MS)

  const clear = () => {
    // Cancel *before* writing the null. The other order lets a queued trailing flush land
    // after it and resurrect the value a frame later — as a cursor ghost on a tab that is
    // no longer showing one, or as a rectangle pinned at a stale in-flight position for
    // every other client until the next drag.
    send.cancel()
    if (last === null) return
    last = null
    write(null)
  }

  const publish = (value: T | null) => {
    if (stopped || (hidden && spec.pauseWhileHidden)) return
    if (value === null) {
      clear()
      return
    }

    // The movement gate. A pointer resting on the canvas produces nothing at all, and
    // neither does a space-drag pan — panning moves the viewport by exactly the pointer
    // delta, so the world point underneath is unchanged and correctly not resent.
    if (last !== null && spec.isSame(last, value)) return
    last = value
    send(value)
  }

  // A tab hidden mid-gesture stays connected, so `onDisconnect` never fires and whatever
  // this channel last wrote sits frozen on the node for everyone else [R16]. Clearing on
  // hide also resets `last`, so the first sample after coming back always writes even if
  // the pointer never left the pixel it was on.
  const onVisibility = () => {
    hidden = document.visibilityState === 'hidden'
    if (hidden) clear()
  }

  document.addEventListener('visibilitychange', onVisibility)

  const stop = () => {
    // Before `stopped`, which gates `write`.
    if (spec.clearOnStop) clear()
    stopped = true
    send.cancel()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  return { publish, stop }
}

/** Publishes a world-space position, or `null` to clear. */
export type CursorChannel = Channel<Point>

export function startCursorChannel(): CursorChannel {
  const channel = startChannel<CursorPayload>({
    field: 'cursor',
    // On position only: `t` changes every sample by construction and would defeat the gate.
    isSame: (last, next) => last.x === next.x && last.y === next.y,
    // A tab left in the background is the single realistic way to blow the monthly cap, so
    // a hidden tab publishes nothing at all rather than merely clearing once [R14,R16].
    pauseWhileHidden: true,
    // Deliberately no null write on teardown. This channel's lifetime is the presence
    // node's lifetime — both are keyed on the same uid — so the node is being removed
    // anyway, and a write racing that deletion is the one thing that leaves a ghost behind.
    clearOnStop: false,
  })

  return {
    publish: (world) =>
      channel.publish(
        world && {
          x: world.x,
          y: world.y,
          // Stamped at *sample* time and corrected to server time, which is what makes the
          // HUD's number a real end-to-end latency rather than a restatement of the send
          // interval — see `CursorPayload`.
          t: Date.now() + connectionStore.getSnapshot().offset,
        },
      ),
    stop: channel.stop,
  }
}

/**
 * The in-flight drag channel — PRD Decision 9, confirmed.
 *
 * Positions stream onto the same session node as the cursor, at the same 20 Hz, and
 * Firestore sees exactly one transactional write per drag when the pointer is released.
 * The arithmetic is what forces this: Firestore's Spark tier allows 20,000 writes/day, so
 * a 20 Hz drag stream would exhaust an entire day's quota in about seventeen minutes of
 * cumulative dragging, and with billing off there is no way to pay through it [R14].
 *
 * The alternative — commit only on release, stream nothing — is cheaper to build but makes
 * remote rectangles *snap* instead of move, which fails acceptance item 5.
 */
export type DragChannel = Channel<DragPayload>

export function startDragChannel(): DragChannel {
  return startChannel<DragPayload>({
    field: 'drag',
    isSame: (last, next) => last.id === next.id && last.x === next.x && last.y === next.y,
    // Nothing to suppress: a hidden tab receives no pointer events, so there are no samples
    // to hold back. The clear on hide is what matters here, and it happens either way —
    // and it is only half the fix, since `CanvasProvider` releases the Firestore
    // `draggedBy` lock on that same event [R16].
    pauseWhileHidden: false,
    // Unlike the cursor, a leftover `drag` key survives on a node presence is *not*
    // removing — restarting the drag channel is not a sign-out — and it would keep a
    // rectangle pinned at a stale position for everyone else.
    clearOnStop: true,
  })
}
