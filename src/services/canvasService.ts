import { mutateShapes, type TxResult } from './transactionService'
import { addShape, claimLock, commitPosition, releaseAllLocks, removeShape } from '../utils/shapeOps'
import type { Shape } from '../utils/types'

/**
 * Canvas mutations. Every one is a pure body from `shapeOps` handed to the transaction
 * wrapper — this file holds no array logic of its own, which is what lets R23 be covered
 * by unit tests instead of an emulator.
 *
 * Note what is *not* here: any per-frame write. In-flight drag positions go to the RTDB
 * session node (Decision 9). Streaming them through Firestore at 20 Hz would burn the
 * entire 20,000 writes/day quota in about seventeen minutes of cumulative dragging, and
 * with billing deliberately off there is no way to pay through it [R14].
 */

export function createShape(shape: Shape): Promise<TxResult> {
  return mutateShapes('create', (shapes) => addShape(shapes, shape))
}

/**
 * The one durable write per drag, on release — position and lock release in a **single**
 * transaction, so a drag costs exactly one Firestore write rather than two [R14].
 *
 * `updatedAt` is stamped out here, deliberately. Calling `Date.now()` inside the body
 * would make it non-deterministic across the retries Firestore performs under contention;
 * closing over one value keeps the body a pure function of the array, which is the whole
 * premise `shapeOps.test.ts` verifies [R23].
 */
export function commitShapePosition(
  id: string,
  x: number,
  y: number,
  uid: string,
): Promise<TxResult> {
  const updatedAt = Date.now()

  return mutateShapes('commit-position', (shapes) =>
    commitPosition(shapes, id, { x, y, updatedAt, updatedBy: uid }, uid),
  )
}

export function deleteShape(id: string): Promise<TxResult> {
  return mutateShapes('delete', (shapes) => removeShape(shapes, id))
}

/**
 * Take the soft lock. Resolves to `true` only if the lock is genuinely yours afterwards —
 * which covers the contended case, where the body legitimately changes nothing and the
 * caller must not start dragging [R10].
 */
export async function claimShapeLock(id: string, uid: string): Promise<boolean> {
  const result = await mutateShapes('claim-lock', (shapes) => claimLock(shapes, id, uid))
  if (!result.ok) return false

  // Not `result.applied`: re-claiming a lock you already hold applies nothing and is still
  // a success. Read the committed state instead of inferring from whether a write happened.
  return result.shapes.find((s) => s.id === id)?.draggedBy === uid
}

/**
 * Drop every lock this user holds. Used on sign-out and when a tab is hidden mid-drag —
 * without it, alt-tabbing away pins a shape at a frozen in-flight position for everyone
 * else, and the tab stays connected so `onDisconnect` never fires [R16].
 */
export function releaseMyLocks(uid: string): Promise<TxResult> {
  return mutateShapes('release-all-locks', (shapes) => releaseAllLocks(shapes, uid))
}
