import { describe, expect, it } from 'vitest'
import { WORLD, ZOOM } from './constants'
import {
  centreOn,
  clampViewport,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  type Viewport,
} from './coords'

/**
 * Part 1 · Tier 2 · PR 4 — the zoom-to-cursor invariant and the scale clamps.
 * PR 6 adds part 2: the world↔screen round trip and the two-viewport agreement that
 * make up R3 proper.
 */

const STAGE = { width: 1280, height: 720 }

describe('zoomAtPoint', () => {
  it('holds the world point under the pointer fixed, at every scale', () => {
    const pointer = { x: 940, y: 210 }

    // Across scales and with a pan already applied, because the bug this catches — an
    // anchor measured at the *new* scale instead of the old — is exact at scale 1 with
    // no offset, which is precisely the case you would try by hand.
    for (const scale of [0.25, 1, 2.5, 4]) {
      for (const factor of [ZOOM.step, 1 / ZOOM.step, 1.5]) {
        const vp: Viewport = { scale, x: -3210.5, y: 878.25 }
        const before = screenToWorld(pointer, vp)
        const after = screenToWorld(pointer, zoomAtPoint(vp, pointer, factor))

        expect(after.x).toBeCloseTo(before.x, 6)
        expect(after.y).toBeCloseTo(before.y, 6)
      }
    }
  })

  it('leaves that point on the same pixel, read the other way round', () => {
    const vp: Viewport = { scale: 0.8, x: 140, y: -60 }
    const pointer = { x: 300, y: 400 }
    const anchor = screenToWorld(pointer, vp)

    const zoomed = worldToScreen(anchor, zoomAtPoint(vp, pointer, 2))

    expect(zoomed.x).toBeCloseTo(pointer.x, 6)
    expect(zoomed.y).toBeCloseTo(pointer.y, 6)
  })

  it('clamps at both ends without overshooting', () => {
    const pointer = { x: 640, y: 360 }

    // A big factor lands exactly on the limit, not past it.
    expect(zoomAtPoint({ scale: 3.9, x: 0, y: 0 }, pointer, 8).scale).toBe(ZOOM.max)
    expect(zoomAtPoint({ scale: 0.15, x: 0, y: 0 }, pointer, 0.01).scale).toBe(ZOOM.min)
  })

  it('is an exact no-op once a limit is reached', () => {
    const pointer = { x: 640, y: 360 }
    const atMin: Viewport = { scale: ZOOM.min, x: -100, y: 250 }
    const atMax: Viewport = { scale: ZOOM.max, x: -100, y: 250 }

    // Identity, not equality. Repeated blocked ticks must not accumulate float drift in
    // the offset, and must not churn React state either.
    expect(zoomAtPoint(atMin, pointer, 0.5)).toBe(atMin)
    expect(zoomAtPoint(atMax, pointer, 2)).toBe(atMax)

    // Still zoomable back off the limit.
    expect(zoomAtPoint(atMin, pointer, 2).scale).toBeCloseTo(ZOOM.min * 2, 10)
  })
})

describe('clampViewport', () => {
  it('will not let the world be dragged off the stage', () => {
    const scale = 1

    // Dragged far past the world's top-left: pinned so the world's edge meets the
    // stage's edge, never further.
    expect(clampViewport({ scale, x: 5000, y: 5000 }, STAGE)).toEqual({ scale, x: 0, y: 0 })

    // And past the bottom-right.
    expect(clampViewport({ scale, x: -99_000, y: -99_000 }, STAGE)).toEqual({
      scale,
      x: STAGE.width - WORLD.width * scale,
      y: STAGE.height - WORLD.height * scale,
    })
  })

  it('leaves a viewport already inside the world alone', () => {
    const inside: Viewport = { scale: 1, x: -4000, y: -2500 }
    expect(clampViewport(inside, STAGE)).toEqual(inside)
  })

  it('centres the world once it is small enough to fit, per axis', () => {
    // At 10% the world is 1000 px square, which fits a 1280 px stage across but not a
    // 720 px one down. The axes are independent, and a shared branch would get one of
    // them wrong: x has no valid pan and must centre, y still has 280 px of travel.
    const world = WORLD.width * ZOOM.min
    const fitted = clampViewport({ scale: ZOOM.min, x: 12_345, y: -678 }, STAGE)

    expect(fitted.x).toBe((STAGE.width - world) / 2)
    expect(fitted.y).toBe(STAGE.height - world)
  })

  it('centres on both axes when the whole world fits', () => {
    const square = { width: 2000, height: 2000 }
    const world = WORLD.width * ZOOM.min
    const fitted = clampViewport({ scale: ZOOM.min, x: 12_345, y: -678 }, square)

    expect(fitted.x).toBe((square.width - world) / 2)
    expect(fitted.y).toBe((square.height - world) / 2)
  })
})

describe('centreOn', () => {
  it('puts the requested world point in the middle of the stage', () => {
    const middle = { x: WORLD.width / 2, y: WORLD.height / 2 }
    const screen = worldToScreen(middle, centreOn(middle, STAGE, 1))

    expect(screen.x).toBeCloseTo(STAGE.width / 2, 10)
    expect(screen.y).toBeCloseTo(STAGE.height / 2, 10)
  })
})
