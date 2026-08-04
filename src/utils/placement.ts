import { PLACEMENT, WORLD } from './constants'
import type { Point, Size } from './coords'

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

/**
 * Pull a shape back inside the world.
 *
 * F1 calls the workspace **bounded**, and `clampViewport` already stops you panning past
 * the edge — which is precisely what makes an out-of-bounds shape unreachable rather than
 * merely untidy: it sits at a world coordinate the viewport is not allowed to travel to,
 * so it renders nowhere and cannot be selected, moved or deleted again.
 *
 * Clamps the **whole** rectangle, not just its origin: pinning the top-left to the world
 * edge still leaves the body hanging over it, since a shape is placed by its corner but
 * seen as its full extent.
 */
export function clampShapeToWorld(
  shape: { x: number; y: number; w: number; h: number },
  world: Size = WORLD,
): Point {
  return {
    x: clampAxis(shape.x, shape.w, world.width),
    y: clampAxis(shape.y, shape.h, world.height),
  }
}

function clampAxis(position: number, extent: number, worldLength: number): number {
  // A shape bigger than the world would otherwise give an inverted range, where the upper
  // bound sits below the lower one and `Math.min`/`Math.max` compose into nonsense. Not
  // reachable at 120×80 in a 10,000 px world, but the guard costs nothing and this is
  // exactly the kind of assumption a later resize invalidates silently.
  const furthest = Math.max(0, worldLength - extent)
  return Math.min(Math.max(position, 0), furthest)
}
