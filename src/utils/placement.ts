import { PLACEMENT } from './constants'
import type { Point } from './coords'

/**
 * Whether a completed mouse gesture was a *click on the empty canvas* — the only gesture
 * that may drop a rectangle.
 *
 * Two conditions, and R13 is what happens when you implement only one of them:
 *
 * - **Distance.** A pan is a press, a travel and a release, and the release still lands on
 *   the background. Without the distance test every pan ends by dropping a rectangle
 *   wherever you let go.
 * - **Target.** A press on an existing shape is a selection or the start of a drag, never
 *   a placement. Without the target test, clicking a rectangle stacks a second one exactly
 *   on top of it — which looks like nothing happened until you drag the top one away.
 *
 * The tolerance exists because a click is not motionless: a real hand moves a pixel or two
 * between press and release, and demanding exactly zero makes placement feel broken on a
 * trackpad. It is measured in **screen** pixels, not world units, because it models a
 * human hand rather than anything about the canvas — at 400% zoom a 4 px twitch must stay
 * a click, not become a 1-world-unit drag.
 */
export type PlacementGesture = {
  down: Point
  up: Point
  /** Whether the press landed on the Stage itself rather than on a shape. */
  targetIsStage: boolean
}

export function shouldPlace({ down, up, targetIsStage }: PlacementGesture): boolean {
  if (!targetIsStage) return false

  // True Euclidean distance, not per-axis. Comparing dx and dy separately would accept a
  // gesture that moved 4 px across *and* 4 px down, which is 5.7 px of real travel.
  const dx = up.x - down.x
  const dy = up.y - down.y

  return Math.hypot(dx, dy) < PLACEMENT.tolerancePx
}
