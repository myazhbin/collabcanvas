import { describe, expect, it } from 'vitest'
import { PLACEMENT, SHAPE, WORLD } from './constants'
import { clampShapeToWorld, shouldPlace } from './placement'

const at = (x: number, y: number) => ({ x, y })

const place = (
  down: { x: number; y: number },
  up: { x: number; y: number },
  targetIsStage = true,
) => shouldPlace({ down, up, targetIsStage })

describe('shouldPlace', () => {
  it('places on a motionless click on the background', () => {
    expect(place(at(400, 300), at(400, 300))).toBe(true)
  })

  it('places on a 4 px click — a hand is never perfectly still', () => {
    expect(place(at(400, 300), at(404, 300))).toBe(true)
    expect(place(at(400, 300), at(400, 296))).toBe(true)
  })

  it('does NOT place after 50 px of travel — that gesture was a pan [R13]', () => {
    expect(place(at(400, 300), at(450, 300))).toBe(false)
    expect(place(at(400, 300), at(400, 350))).toBe(false)
  })

  it('does NOT place on a shape, however still the click — that is a selection [R13]', () => {
    expect(place(at(400, 300), at(400, 300), false)).toBe(false)
  })

  it('measures true distance, not each axis separately', () => {
    expect(place(at(400, 300), at(404, 304))).toBe(false)

    expect(place(at(400, 300), at(405.66, 300))).toBe(false)
  })

  it('is symmetric — dragging up-left is the same gesture as down-right', () => {
    expect(place(at(400, 300), at(350, 250))).toBe(false)
    expect(place(at(400, 300), at(397, 297))).toBe(true)
  })

  it('rejects exactly at the tolerance, so the bound is closed on one side only', () => {
    const t = PLACEMENT.tolerancePx
    expect(place(at(0, 0), at(t, 0))).toBe(false)
    expect(place(at(0, 0), at(t - 0.001, 0))).toBe(true)
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
    const justInside = WORLD.width - 20
    expect(clampShapeToWorld(box(justInside, 5000)).x).toBe(WORLD.width - SHAPE.width)
  })

  it('clamps each axis independently', () => {
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
