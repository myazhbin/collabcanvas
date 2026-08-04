// Explicit extensions: unlike its neighbours this module is imported by the emulator
// tests too, so it compiles under tsconfig.node.json as well — and that project is
// nodenext, where extensionless relative imports are an error.
import { canDrag } from './shapeLocks.ts'
import type { Shape } from './types.ts'

/**
 * The transaction bodies, as pure functions of the array.
 *
 * This file exists so R23 can be tested without Firestore. Firestore **re-runs a
 * transaction callback** whenever the document changes underneath it, which makes every
 * one of these a function that may be applied more than once, against a different starting
 * array each time. Two properties follow, and both are asserted next door:
 *
 * - **Never mutate the input.** A body that edits the array in place corrupts the state the
 *   SDK is about to hand back on retry, and the corruption is invisible until two people
 *   write at once.
 * - **Idempotent.** Applying an op twice must equal applying it once, because under
 *   contention it genuinely can happen.
 *
 * Every op returns a **new** array — and returns the *same* array reference when nothing
 * changed, so a caller can cheaply tell a real edit from a no-op.
 */

/** Add a shape, unless one with that id is already present (the retry case). */
export function addShape(shapes: Shape[], shape: Shape): Shape[] {
  if (shapes.some((s) => s.id === shape.id)) return shapes
  return [...shapes, shape]
}

/**
 * Patch one shape by id. A missing id is a **safe no-op**, not a crash: the shape may have
 * been deleted by someone else between the drag starting and the commit landing, and a
 * throw there would surface as a failed transaction for an action the user completed.
 */
export function patchShape(
  shapes: Shape[],
  id: string,
  fields: Partial<Omit<Shape, 'id'>>,
): Shape[] {
  const index = shapes.findIndex((s) => s.id === id)
  if (index === -1) return shapes

  const next = [...shapes]
  next[index] = { ...next[index], ...fields }
  return next
}

export function removeShape(shapes: Shape[], id: string): Shape[] {
  if (!shapes.some((s) => s.id === id)) return shapes
  return shapes.filter((s) => s.id !== id)
}

/**
 * Take the soft lock, but only if it is free or already yours [R10].
 *
 * Refusing to steal is the whole point: two users grabbing one rectangle must produce a
 * clean lockout, not the continuous oscillation that plain last-write-wins gives you. The
 * "already yours" branch matters just as much — re-claiming your own lock has to succeed,
 * or a retry mid-drag locks you out of the shape you are holding.
 */
export function claimLock(shapes: Shape[], id: string, uid: string): Shape[] {
  const shape = shapes.find((s) => s.id === id)
  if (!shape) return shapes
  if (shape.draggedBy !== null && shape.draggedBy !== uid) return shapes
  if (shape.draggedBy === uid) return shapes

  return patchShape(shapes, id, { draggedBy: uid })
}

/** Release only your own lock — never someone else's. */
export function releaseLock(shapes: Shape[], id: string, uid: string): Shape[] {
  const shape = shapes.find((s) => s.id === id)
  if (!shape || shape.draggedBy !== uid) return shapes

  return patchShape(shapes, id, { draggedBy: null })
}

/**
 * Commit a drag: write the position **and** release the lock, but only if the lock permits
 * the write in the first place.
 *
 * This is what makes the lockout authoritative rather than advisory. `draggable` on the
 * Konva node is the guard a user actually feels, but it is derived from state that can be
 * briefly stale — presence has not loaded, or two claims cross on the wire. Without the
 * check here the loser of a contested grab still commits on release, and F4's "clean
 * lockout" degrades into exactly the oscillation the lock exists to prevent [R10].
 */
export function commitPosition(
  shapes: Shape[],
  id: string,
  fields: Partial<Omit<Shape, 'id'>>,
  uid: string,
): Shape[] {
  const shape = shapes.find((s) => s.id === id)
  if (!shape) return shapes
  if (!canDrag(shape, uid)) return shapes

  return releaseLock(patchShape(shapes, id, fields), id, uid)
}

/** Drop every lock held by a uid — the teardown a crashed or departed client needs. */
export function releaseAllLocks(shapes: Shape[], uid: string): Shape[] {
  if (!shapes.some((s) => s.draggedBy === uid)) return shapes
  return shapes.map((s) => (s.draggedBy === uid ? { ...s, draggedBy: null } : s))
}
