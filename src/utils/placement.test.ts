import { describe, expect, it } from 'vitest'
import { PLACEMENT, SHAPE, WORLD } from './constants'
import { clampShapeToWorld, shouldPlace } from './placement'

/**
 * Tier 2 · PR 7 — R13.
 *
 * The guard has two independent conditions and it is genuinely easy to ship only one,
 * because each looks complete on its own: with just the distance test, clicking a shape
 * stacks a duplicate on top of it; with just the target test, every pan ends by dropping
 * a rectangle where you released. Both bugs are invisible until someone uses the canvas
 * for more than one gesture.
 */
const at = (x: number, y: number) => ({ x, y })

describe('shouldPlace', () => {
  it('places on a motionless click on the background', () => {
    expect(shouldPlace({ down: at(400, 300), up: at(400, 300), targetIsStage: true })).toBe(true)
  })

  it('places on a 4 px click — a hand is never perfectly still', () => {
    expect(shouldPlace({ down: at(400, 300), up: at(404, 300), targetIsStage: true })).toBe(true)
    expect(shouldPlace({ down: at(400, 300), up: at(400, 296), targetIsStage: true })).toBe(true)
  })

  it('does NOT place after 50 px of travel — that gesture was a pan [R13]', () => {
    expect(shouldPlace({ down: at(400, 300), up: at(450, 300), targetIsStage: true })).toBe(false)
    expect(shouldPlace({ down: at(400, 300), up: at(400, 350), targetIsStage: true })).toBe(false)
  })

  it('does NOT place on a shape, however still the click — that is a selection [R13]', () => {
    expect(shouldPlace({ down: at(400, 300), up: at(400, 300), targetIsStage: false })).toBe(false)
  })

  it('measures true distance, not each axis separately', () => {
    // 4 px across and 4 px down is 5.66 px of real travel. A per-axis implementation
    // reads both components as "under 5" and places; this is the case that catches it.
    expect(shouldPlace({ down: at(400, 300), up: at(404, 304), targetIsStage: true })).toBe(false)

    // And the same total distance on one axis is equally rejected, so the above is not
    // passing for some unrelated reason.
    expect(shouldPlace({ down: at(400, 300), up: at(405.66, 300), targetIsStage: true })).toBe(false)
  })

  it('is symmetric — dragging up-left is the same gesture as down-right', () => {
    expect(shouldPlace({ down: at(400, 300), up: at(350, 250), targetIsStage: true })).toBe(false)
    expect(shouldPlace({ down: at(400, 300), up: at(397, 297), targetIsStage: true })).toBe(true)
  })

  it('rejects exactly at the tolerance, so the bound is closed on one side only', () => {
    const t = PLACEMENT.tolerancePx
    expect(shouldPlace({ down: at(0, 0), up: at(t, 0), targetIsStage: true })).toBe(false)
    expect(shouldPlace({ down: at(0, 0), up: at(t - 0.001, 0), targetIsStage: true })).toBe(true)
  })
})

describe('clampShapeToWorld', () => {
  const box = (x: number, y: number) => ({ x, y, w: SHAPE.width, h: SHAPE.height })

  it('leaves a shape comfortably inside the world alone', () => {
    expect(clampShapeToWorld(box(5000, 4000))).toEqual({ x: 5000, y: 4000 })
  })

  it('pulls a shape back from past the top-left corner', () => {
    expect(clampShapeToWorld(box(-500, -900))).toEqual({ x: 0, y: 0 })
  })

  it('pulls a shape back from past the bottom-right corner', () => {
    expect(clampShapeToWorld(box(99_999, 99_999))).toEqual({
      x: WORLD.width - SHAPE.width,
      y: WORLD.height - SHAPE.height,
    })
  })

  it('clamps the whole rectangle, not just its origin', () => {
    // Origin inside the world, body hanging over the edge. Clamping only the corner would
    // call this legal and leave 100 px of rectangle outside.
    const justInside = WORLD.width - 20
    expect(clampShapeToWorld(box(justInside, 5000)).x).toBe(WORLD.width - SHAPE.width)
  })

  it('clamps each axis independently', () => {
    // Off the left edge but vertically fine — the y must not be disturbed.
    expect(clampShapeToWorld(box(-40, 6000))).toEqual({ x: 0, y: 6000 })
    expect(clampShapeToWorld(box(6000, -40))).toEqual({ x: 6000, y: 0 })
  })

  it('treats a shape flush against either edge as already legal', () => {
    expect(clampShapeToWorld(box(0, 0))).toEqual({ x: 0, y: 0 })

    const flush = { x: WORLD.width - SHAPE.width, y: WORLD.height - SHAPE.height }
    expect(clampShapeToWorld(box(flush.x, flush.y))).toEqual(flush)
  })

  it('pins a shape larger than the world to the origin instead of inverting the range', () => {
    const huge = { x: 50, y: 50, w: 999_999, h: 999_999 }
    expect(clampShapeToWorld(huge)).toEqual({ x: 0, y: 0 })
  })
})
