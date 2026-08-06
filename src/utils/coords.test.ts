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

const STAGE = { width: 1280, height: 720 }

describe('zoomAtPoint', () => {
  it('holds the world point under the pointer fixed, at every scale', () => {
    const pointer = { x: 940, y: 210 }

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

    expect(zoomAtPoint({ scale: 3.9, x: 0, y: 0 }, pointer, 8).scale).toBe(ZOOM.max)
    expect(zoomAtPoint({ scale: 0.15, x: 0, y: 0 }, pointer, 0.01).scale).toBe(ZOOM.min)
  })

  it('is an exact no-op once a limit is reached', () => {
    const pointer = { x: 640, y: 360 }
    const atMin: Viewport = { scale: ZOOM.min, x: -100, y: 250 }
    const atMax: Viewport = { scale: ZOOM.max, x: -100, y: 250 }

    expect(zoomAtPoint(atMin, pointer, 0.5)).toBe(atMin)
    expect(zoomAtPoint(atMax, pointer, 2)).toBe(atMax)

    expect(zoomAtPoint(atMin, pointer, 2).scale).toBeCloseTo(ZOOM.min * 2, 10)
  })
})

describe('clampViewport', () => {
  it('will not let the world be dragged off the stage', () => {
    const scale = 1

    expect(clampViewport({ scale, x: 5000, y: 5000 }, STAGE)).toEqual({ scale, x: 0, y: 0 })

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

describe('world↔screen, the multiplayer invariant [R3]', () => {
  const VIEWPORTS: Viewport[] = [
    { scale: 1, x: 0, y: 0 },
    { scale: 0.25, x: -1234.5, y: 987.75 },
    { scale: 4, x: -38_000, y: -22_500 },
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
    for (const vp of VIEWPORTS) {
      const pixel = { x: 947, y: 213 }
      const back = worldToScreen(screenToWorld(pixel, vp), vp)

      expect(back.x).toBeCloseTo(pixel.x, 9)
      expect(back.y).toBeCloseTo(pixel.y, 9)
    }
  })

  it('resolves one shared world point correctly under two different viewports', () => {
    const a: Viewport = { scale: 1, x: 0, y: 0 }
    const b: Viewport = { scale: 2.5, x: -3000, y: 1200 }
    const pointerA = { x: 640, y: 360 }

    const shared = screenToWorld(pointerA, a)
    const pixelB = worldToScreen(shared, b)

    expect(screenToWorld(pixelB, b).x).toBeCloseTo(shared.x, 9)
    expect(screenToWorld(pixelB, b).y).toBeCloseTo(shared.y, 9)

    expect(Math.abs(pixelB.x - pointerA.x)).toBeGreaterThan(100)
    expect(Math.abs(pixelB.y - pointerA.y)).toBeGreaterThan(100)
  })

  it('survives a 2000 px pan — acceptance item 6, without opening two browsers', () => {
    for (const scale of [0.25, 1, 4]) {
      const vp: Viewport = { scale, x: 0, y: 0 }
      const panned = panBy(vp, -2000, -2000)
      const world = { x: 5000, y: 5000 }

      expect(worldToScreen(world, panned).x).toBeCloseTo(worldToScreen(world, vp).x - 2000, 9)
      expect(worldToScreen(world, panned).y).toBeCloseTo(worldToScreen(world, vp).y - 2000, 9)

      const back = screenToWorld(worldToScreen(world, panned), panned)
      expect(back.x).toBeCloseTo(world.x, 9)
      expect(back.y).toBeCloseTo(world.y, 9)
    }
  })

  it('agrees with the split transform the cursor overlay renders through', () => {
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
