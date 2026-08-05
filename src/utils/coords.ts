import { WORLD, ZOOM } from './constants'

/**
 * All viewport math, pure and free of Konva. Two things depend on that:
 *
 * 1. The zoom-to-cursor invariant is the single easiest piece of this to get subtly
 *    wrong, and it costs ten milliseconds to assert here versus a browser to eyeball.
 * 2. PR 6 renders remote cursors as DOM over the stage, which means converting world
 *    coordinates to screen *outside* Konva. Two viewports resolving the same world
 *    point differently is R3, and it is invisible until two browsers pan apart.
 */

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }

/** The Konva Stage transform: a world point `p` paints at `p * scale + (x, y)`. */
export type Viewport = { scale: number; x: number; y: number }

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

function clampScale(scale: number): number {
  return Math.min(Math.max(scale, ZOOM.min), ZOOM.max)
}

/**
 * Zoom about a fixed screen point: whatever world coordinate sits under `pointer` before
 * the call sits under it after. Solve `pointer = anchor * scale + offset` for the new
 * offset and that falls out — the anchor is measured once, at the old scale.
 */
export function zoomAtPoint(vp: Viewport, pointer: Point, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor)

  // At either clamp this is a no-op, and returning `vp` itself keeps it exactly one.
  // Round-tripping through `screenToWorld` and back would otherwise drift the offset by
  // a fraction of a pixel per blocked wheel tick — invisible per tick, and a slow slide
  // out from under the pointer if you lean on the wheel at max zoom.
  if (scale === vp.scale) return vp

  const anchor = screenToWorld(pointer, vp)
  return { scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { scale: vp.scale, x: vp.x + dx, y: vp.y + dy }
}

/** The viewport that puts a world point in the middle of the stage. */
export function centreOn(target: Point, stage: Size, scale: number): Viewport {
  return {
    scale,
    x: stage.width / 2 - target.x * scale,
    y: stage.height / 2 - target.y * scale,
  }
}

/**
 * Keeps the world on screen. F1 calls the workspace bounded, not infinite — and without
 * this you can shove 10,000 px of canvas off the edge, then sit staring at empty grey
 * with no landmark to navigate back by.
 */
export function clampViewport(vp: Viewport, stage: Size, world: Size = WORLD): Viewport {
  return {
    scale: vp.scale,
    x: clampAxis(vp.x, stage.width, world.width * vp.scale),
    y: clampAxis(vp.y, stage.height, world.height * vp.scale),
  }
}

function clampAxis(offset: number, stageLength: number, worldLength: number): number {
  // Zoomed out far enough that the whole world fits: centre it, rather than letting it
  // sit in a corner with dead space on two sides.
  if (worldLength <= stageLength) return (stageLength - worldLength) / 2

  // `0` pins the world's leading edge to the stage's; `stageLength - worldLength` pins
  // the trailing edges. Anywhere between is a viewport fully inside the world.
  return Math.min(Math.max(offset, stageLength - worldLength), 0)
}
