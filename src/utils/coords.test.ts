import { describe, expect, it } from 'vitest'
import { WORLD, ZOOM } from './constants'
import {
  centreOn,
  clampViewport,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  type Viewport,
} from './coords'

/**
 * Part 1 · Tier 2 · PR 4 — the zoom-to-cursor invariant and the scale clamps.
 * Part 2 · Tier 1 · PR 6 — the world↔screen round trip and the two-viewport agreement
 * that make up R3 proper, at the bottom of the file.
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

/**
 * Part 2 · Tier 1 · PR 6 — R3, which is rated critical and is completely invisible on
 * localhost, because two developers sitting at identical viewports never produce the
 * offset that exposes it. It reduces to a handful of assertions here.
 */
describe('world↔screen, the multiplayer invariant [R3]', () => {
  const VIEWPORTS: Viewport[] = [
    { scale: 1, x: 0, y: 0 },
    { scale: 0.25, x: -1234.5, y: 987.75 },
    { scale: 4, x: -38_000, y: -22_500 }, // deep zoom, far into a 10,000 px world
    { scale: 0.1, x: 640, y: -360 },
  ]

  const POINTS = [
    { x: 0, y: 0 },
    { x: 5000, y: 5000 },
    { x: 9999.5, y: 0.25 },
    { x: 123.456, y: 7890.123 },
  ]

  it('round-trips a world point through screen space at every scale and pan', () => {
    for (const vp of VIEWPORTS) {
      for (const p of POINTS) {
        const back = screenToWorld(worldToScreen(p, vp), vp)

        expect(back.x).toBeCloseTo(p.x, 9)
        expect(back.y).toBeCloseTo(p.y, 9)
      }
    }
  })

  it('round-trips the other way too — a screen pixel is stable through world space', () => {
    // The direction the publisher actually runs: pointer pixel → world → onto the wire.
    for (const vp of VIEWPORTS) {
      const pixel = { x: 947, y: 213 }
      const back = worldToScreen(screenToWorld(pixel, vp), vp)

      expect(back.x).toBeCloseTo(pixel.x, 9)
      expect(back.y).toBeCloseTo(pixel.y, 9)
    }
  })

  it('resolves one shared world point correctly under two different viewports', () => {
    // This is the whole of R3 in one assertion. A publishes what is under its pointer;
    // B renders it under B's own transform. What has to agree is the *world* point —
    // the pixel must not, and the second half of this test is what stops the first half
    // passing vacuously under a broken screen-coordinate implementation.
    const a: Viewport = { scale: 1, x: 0, y: 0 }
    const b: Viewport = { scale: 2.5, x: -3000, y: 1200 }
    const pointerA = { x: 640, y: 360 }

    const shared = screenToWorld(pointerA, a)
    const pixelB = worldToScreen(shared, b)

    expect(screenToWorld(pixelB, b).x).toBeCloseTo(shared.x, 9)
    expect(screenToWorld(pixelB, b).y).toBeCloseTo(shared.y, 9)

    // Broadcasting screen coordinates would have put B's arrow at pointerA. It doesn't
    // belong anywhere near there.
    expect(Math.abs(pixelB.x - pointerA.x)).toBeGreaterThan(100)
    expect(Math.abs(pixelB.y - pointerA.y)).toBeGreaterThan(100)
  })

  it('survives a 2000 px pan — acceptance item 6, without opening two browsers', () => {
    for (const scale of [0.25, 1, 4]) {
      const vp: Viewport = { scale, x: 0, y: 0 }
      const panned = panBy(vp, -2000, -2000)
      const world = { x: 5000, y: 5000 }

      // The pixel moves by exactly the pan…
      expect(worldToScreen(world, panned).x).toBeCloseTo(worldToScreen(world, vp).x - 2000, 9)
      expect(worldToScreen(world, panned).y).toBeCloseTo(worldToScreen(world, vp).y - 2000, 9)

      // …and the world point does not move at all, which is the half that matters: it
      // is what goes on the wire, so both browsers land on the same point regardless of
      // how far apart they have panned.
      const back = screenToWorld(worldToScreen(world, panned), panned)
      expect(back.x).toBeCloseTo(world.x, 9)
      expect(back.y).toBeCloseTo(world.y, 9)
    }
  })

  it('agrees with the split transform the cursor overlay renders through', () => {
    // Cursor.tsx applies the pan on the overlay layer and the scale on each cursor, so
    // that a local pan is instant while remote motion keeps its 60 ms CSS smoothing
    // [R21]. That is only legitimate if the two halves compose back to worldToScreen.
    for (const vp of VIEWPORTS) {
      for (const p of POINTS) {
        const scaled = worldToScreen(p, { scale: vp.scale, x: 0, y: 0 })
        const full = worldToScreen(p, vp)

        expect(scaled.x + vp.x).toBeCloseTo(full.x, 9)
        expect(scaled.y + vp.y).toBeCloseTo(full.y, 9)
      }
    }
  })
})
