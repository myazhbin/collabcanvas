// Explicit extension: reached from the emulator tests, and that project is nodenext,
// where an extensionless relative import is an error.
import type { DragPayload, SessionNode, Shape } from './types.ts'

/**
 * Reconcile an incoming Firestore snapshot against what is already on screen.
 *
 * Two separate problems, both invisible in a single browser:
 *
 * **R7 — the whole array arrives every time.** One document means `onSnapshot` has no
 * per-shape delta; moving one rectangle delivers all 500. Calling `setState(incoming)`
 * replaces every object identity, so a memoised `Rectangle` sees new props and every one
 * re-renders. This function hands back the **previous object reference** for anything that
 * did not actually change, which is what turns the memo into skipped work — the difference
 * between 60 FPS and 6 at the 500-object target.
 *
 * **R6 — the echo fights your own pointer.** Your commit comes back to you as a snapshot.
 * Applying it mid-drag snaps the rectangle to the last committed position while your hand
 * is still moving, so the shape stutters against the cursor. Ids in `dragging` therefore
 * keep their local version until the drag resolves.
 *
 * Pure, and returns the next dragging set rather than mutating the one it was given —
 * a shape deleted underneath a drag has to be released, or its id stays suppressed forever
 * and that shape is silently frozen for the rest of the session.
 */
export type ShapeDiff = {
  /** The **previous array itself** when nothing moved, so `===` is the caller's no-op test. */
  shapes: Shape[]
  dragging: ReadonlySet<string>
}

export function shapeDiff(
  previous: Shape[],
  incoming: Shape[],
  dragging: ReadonlySet<string> = new Set(),
): ShapeDiff {
  const before = new Map(previous.map((s) => [s.id, s]))
  const next: Shape[] = []

  // Order comes from the incoming array — it is the authority on what exists and in what
  // order, even when individual entries are served from the previous state.
  let changed = incoming.length !== previous.length

  for (let i = 0; i < incoming.length; i++) {
    const arriving = incoming[i]
    const held = before.get(arriving.id)

    if (!held) {
      next.push(arriving)
      changed = true
      continue
    }

    // Echo suppression [R6]. Keep what is on screen; the drag owns this shape until it
    // finishes. Deliberately ahead of the equality check, so an echo can never sneak
    // through just because it happens to match.
    if (dragging.has(arriving.id)) {
      next.push(held)
      if (previous[i] !== held) changed = true
      continue
    }

    if (isSameShape(held, arriving)) {
      // The load-bearing line: same reference out, so `memo` skips it [R7].
      next.push(held)
      if (previous[i] !== held) changed = true
      continue
    }

    next.push(arriving)
    changed = true
  }

  // A shape that vanished while you were dragging it must not stay in the set, or its id
  // suppresses a future shape that happens to reuse it and, more importantly, never
  // releases. Rebuilt rather than mutated, so callers can hold the old set safely.
  const survivors = new Set(incoming.map((s) => s.id))
  let nextDragging = dragging
  if ([...dragging].some((id) => !survivors.has(id))) {
    nextDragging = new Set([...dragging].filter((id) => survivors.has(id)))
  }

  return { shapes: changed ? next : previous, dragging: nextDragging }
}

/**
 * The in-flight half of the handoff: every shape some *other* session is currently
 * dragging, mapped to the live position off its session node.
 *
 * PRD §4.3 — a remote shape renders at `session.drag` if any session is dragging that id,
 * otherwise at the committed Firestore value. Own session excluded, because Konva is
 * already moving that node under the pointer and applying a network round trip on top
 * makes your own drag lag your hand.
 */
export function collectRemoteDrags(
  // Only `drag` is read, and a node may legally be missing entirely — the wire is a trust
  // boundary here exactly as it is in the presence list.
  sessions: Record<string, Partial<Pick<SessionNode, 'drag'>> | null>,
  mySessionId: string,
  // Keyed by shape id, so the id drops out of the value.
): Map<string, Omit<DragPayload, 'id'>> {
  const drags = new Map<string, Omit<DragPayload, 'id'>>()

  for (const [key, node] of Object.entries(sessions)) {
    if (key === mySessionId) continue

    const drag = node?.drag
    if (!drag || typeof drag.id !== 'string') continue
    if (!Number.isFinite(drag.x) || !Number.isFinite(drag.y)) continue

    drags.set(drag.id, { x: drag.x, y: drag.y })
  }

  return drags
}

/**
 * Field-by-field rather than a JSON compare: it is faster, and it does not depend on key
 * order, which Firestore does not promise to preserve across a round trip.
 */
function isSameShape(a: Shape, b: Shape): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.fill === b.fill &&
    a.draggedBy === b.draggedBy &&
    a.updatedAt === b.updatedAt &&
    a.updatedBy === b.updatedBy &&
    a.createdBy === b.createdBy
  )
}
