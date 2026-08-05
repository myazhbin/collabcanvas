// Explicit extension: reached from the emulator tests via `shapeOps`, and that project is
// nodenext, where an extensionless relative import is an error.
import type { Shape } from './types.ts'

/**
 * The soft lock, as one primitive [R10].
 *
 * PRD F4 settles conflicts with last-write-wins at the shape level, and plain LWW is *not*
 * adequate on its own: two people dragging one rectangle produce continuous oscillation as
 * each commit overwrites the other, not a rare self-correcting jump. `draggedBy` is what
 * makes LWW acceptable — the second person is locked out cleanly instead of fighting.
 *
 * Returns the uid actually keeping you out, so the caller can colour the outline with it,
 * and `null` in all three ways a `draggedBy` fails to bind.
 */
export function lockHolder(
  shape: Pick<Shape, 'draggedBy'>,
  myUid: string | null,
  /**
   * uids with a live session right now. Optional, and supplying it is what stops a crash
   * locking a shape forever — see below.
   */
  liveUids?: ReadonlySet<string>,
): string | null {
  const holder = shape.draggedBy

  // Free. The overwhelmingly common case, and `undefined` counts — a shape written before
  // the field existed, or one read back mid-write, must not be permanently unmovable.
  if (holder === null || holder === undefined) return null

  // Yours already. Written as a bare truthiness check the whole function reads as "locked"
  // and you get locked out of the shape you are personally holding — which looks like the
  // drag simply stopped working, and only on the second grab.
  if (holder === myUid) return null

  /**
   * **Stale lock.** `draggedBy` lives in Firestore, and `onDisconnect` cannot reach it —
   * it only removes the RTDB session node. So a client that crashes, loses power or has
   * its lid closed mid-drag leaves a lock nothing will ever clear, and that rectangle is
   * immovable for every user from then on.
   *
   * The session node disappearing *is* the signal. If the holder has no live session, the
   * lock is a leftover and the shape is free. This is the mechanism by which
   * `onDisconnect` prevents a permanent lock [R10] — the RTDB node is the liveness proof
   * for a lock held in Firestore.
   *
   * Omitting the set is not evidence of anything, so it keeps honouring the lock: presence
   * not having loaded yet must not silently unlock the whole canvas.
   */
  if (liveUids && !liveUids.has(holder)) return null

  return holder
}

export function canDrag(
  shape: Pick<Shape, 'draggedBy'>,
  myUid: string | null,
  liveUids?: ReadonlySet<string>,
): boolean {
  return lockHolder(shape, myUid, liveUids) === null
}
