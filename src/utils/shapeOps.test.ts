import { describe, expect, it } from 'vitest'
import {
  addShape,
  buildSeed,
  claimLock,
  commitPosition,
  estimateDocBytes,
  MAX_SHAPES,
  patchShape,
  releaseAllLocks,
  releaseLock,
  removeShape,
} from './shapeOps'
import { WORLD } from './constants'
import type { Shape } from './types'

/**
 * Tier 1 · PR 8 — R23, verified without Firestore, which is the only cheap way to cover it.
 *
 * Firestore re-runs a transaction callback under contention. Everything here is really one
 * question asked five ways: *what happens when this body runs twice?*
 */
const shape = (id: string, over: Partial<Shape> = {}): Shape => ({
  id,
  x: 10,
  y: 20,
  w: 120,
  h: 80,
  fill: '#2563eb',
  createdBy: 'alice',
  updatedAt: 1000,
  updatedBy: 'alice',
  draggedBy: null,
  ...over,
})

const base = (): Shape[] => [shape('a'), shape('b'), shape('c')]

describe('purity — the property Firestore retries depend on [R23]', () => {
  it('never mutates the input array or its shapes', () => {
    const input = base()
    const snapshot = JSON.parse(JSON.stringify(input))

    addShape(input, shape('d'))
    patchShape(input, 'a', { x: 999 })
    removeShape(input, 'b')
    claimLock(input, 'a', 'bob')
    releaseLock(input, 'a', 'alice')
    releaseAllLocks(input, 'alice')

    expect(input).toEqual(snapshot)
  })

  it('returns a new array when something changed', () => {
    const input = base()

    expect(addShape(input, shape('d'))).not.toBe(input)
    expect(patchShape(input, 'a', { x: 999 })).not.toBe(input)
    expect(removeShape(input, 'a')).not.toBe(input)
    expect(claimLock(input, 'a', 'bob')).not.toBe(input)
  })

  it('returns the SAME array reference when nothing changed', () => {
    // Lets a caller distinguish a real edit from a no-op without a deep compare — and
    // proves the no-op branches are genuinely doing nothing rather than rebuilding.
    const input = base()

    expect(addShape(input, shape('a'))).toBe(input)
    expect(patchShape(input, 'nope', { x: 1 })).toBe(input)
    expect(removeShape(input, 'nope')).toBe(input)
    expect(releaseLock(input, 'a', 'alice')).toBe(input)
    expect(releaseAllLocks(input, 'nobody')).toBe(input)
  })
})

describe('idempotence — applying twice equals applying once [R23]', () => {
  it('holds for every op', () => {
    const input = base()
    const held = [shape('a', { draggedBy: 'bob' }), shape('b')]

    const cases: [string, (s: Shape[]) => Shape[]][] = [
      ['addShape', (s) => addShape(s, shape('d'))],
      ['patchShape', (s) => patchShape(s, 'a', { x: 42 })],
      ['removeShape', (s) => removeShape(s, 'b')],
      ['claimLock', (s) => claimLock(s, 'a', 'alice')],
      ['releaseLock', (s) => releaseLock(s, 'a', 'bob')],
    ]

    for (const [name, op] of cases) {
      const start = name === 'releaseLock' ? held : input
      const once = op(start)
      const twice = op(once)

      expect(twice, `${name} is not idempotent`).toEqual(once)
    }
  })

  it('addShape twice with the same id does not duplicate — the retry case', () => {
    const once = addShape(base(), shape('d'))
    const twice = addShape(once, shape('d'))

    expect(once).toHaveLength(4)
    expect(twice).toHaveLength(4)
    expect(twice.filter((s) => s.id === 'd')).toHaveLength(1)
  })
})

describe('patchShape', () => {
  it('is a safe no-op on a missing id, not a crash', () => {
    // Delete-during-drag: the shape is gone by the time the commit lands. Throwing here
    // would report a failed transaction for something the user actually finished doing.
    expect(() => patchShape(base(), 'ghost', { x: 5 })).not.toThrow()
    expect(patchShape(base(), 'ghost', { x: 5 })).toEqual(base())
  })

  it('touches only the target and leaves every other reference intact', () => {
    const input = base()
    const next = patchShape(input, 'b', { x: 777 })

    expect(next[1].x).toBe(777)
    expect(next[0]).toBe(input[0])
    expect(next[2]).toBe(input[2])
  })
})

describe('claimLock / releaseLock [R10]', () => {
  it('claims a free shape', () => {
    expect(claimLock(base(), 'a', 'alice')[0].draggedBy).toBe('alice')
  })

  it('leaves a shape held by someone else completely unchanged', () => {
    const held = [shape('a', { draggedBy: 'bob' })]
    const after = claimLock(held, 'a', 'alice')

    // Identity, not just equality: a "steal" that rewrote the array to the same values
    // would still fight the holder's drag on every retry.
    expect(after).toBe(held)
    expect(after[0].draggedBy).toBe('bob')
  })

  it('re-claiming your own lock succeeds and stays a no-op', () => {
    // A retry mid-drag re-runs the claim. If that were treated as contention you would be
    // locked out of the shape you are currently holding.
    const mine = [shape('a', { draggedBy: 'alice' })]
    expect(claimLock(mine, 'a', 'alice')).toBe(mine)
  })

  it('releases only your own lock', () => {
    const held = [shape('a', { draggedBy: 'bob' })]

    expect(releaseLock(held, 'a', 'alice')).toBe(held)
    expect(releaseLock(held, 'a', 'bob')[0].draggedBy).toBeNull()
  })

  it('releaseAllLocks clears every shape a uid holds and nothing else', () => {
    const mixed = [
      shape('a', { draggedBy: 'bob' }),
      shape('b', { draggedBy: 'alice' }),
      shape('c', { draggedBy: 'bob' }),
    ]
    const after = releaseAllLocks(mixed, 'bob')

    expect(after.map((s) => s.draggedBy)).toEqual([null, 'alice', null])
  })
})

describe('commitPosition — the lockout is authoritative, not advisory [R10]', () => {
  it('commits and releases your own lock in one step', () => {
    const held = [shape('a', { draggedBy: 'alice' })]
    const after = commitPosition(held, 'a', { x: 900, y: 800 }, 'alice')

    expect(after[0].x).toBe(900)
    expect(after[0].draggedBy).toBeNull()
  })

  it('commits an unlocked shape', () => {
    expect(commitPosition(base(), 'a', { x: 900 }, 'alice')[0].x).toBe(900)
  })

  it('REFUSES to write when someone else holds the lock', () => {
    // The loser of a contested grab releasing their pointer. Without this the write lands
    // anyway and F4's clean lockout becomes the oscillation the lock exists to prevent.
    const held = [shape('a', { draggedBy: 'bob', x: 10 })]
    const after = commitPosition(held, 'a', { x: 900 }, 'alice')

    expect(after).toBe(held)
    expect(after[0].x).toBe(10)
  })

  it('is a safe no-op for a shape deleted mid-drag', () => {
    // Someone else deleted it while this pointer was still holding it. The commit has to
    // land as nothing rather than throwing — the user completed the gesture either way.
    const input = base()

    expect(() => commitPosition(input, 'ghost', { x: 1 }, 'alice')).not.toThrow()
    expect(commitPosition(input, 'ghost', { x: 1 }, 'alice')).toBe(input)
  })

  it('is idempotent', () => {
    const held = [shape('a', { draggedBy: 'alice' })]
    const once = commitPosition(held, 'a', { x: 42 }, 'alice')
    const twice = commitPosition(once, 'a', { x: 42 }, 'alice')

    expect(twice).toEqual(once)
  })
})

describe('buildSeed — PR 10 seed case [R22,R24]', () => {
  const opts = (over: Partial<Parameters<typeof buildSeed>[1]> = {}) => ({
    uid: 'alice',
    now: 1000,
    idPrefix: 'seed1',
    ...over,
  })

  it('returns one array of `count` valid shapes with every field populated', () => {
    // A missing field here writes malformed data to five hundred entries at once, and the
    // only symptom is something far downstream — `generateUserColor(undefined)` throwing,
    // or a shape that can never be dragged because `draggedBy` is `undefined`.
    const seeded = buildSeed(500, opts())

    expect(seeded).toHaveLength(500)
    for (const s of seeded) {
      expect(typeof s.id).toBe('string')
      expect(s.id.length).toBeGreaterThan(0)
      expect(Number.isFinite(s.x)).toBe(true)
      expect(Number.isFinite(s.y)).toBe(true)
      expect(s.w).toBeGreaterThan(0)
      expect(s.h).toBeGreaterThan(0)
      expect(s.fill).toMatch(/^#[0-9a-f]{6}$/i)
      expect(s.createdBy).toBe('alice')
      expect(s.updatedBy).toBe('alice')
      expect(s.updatedAt).toBe(1000)
      expect(s.draggedBy).toBeNull()
    }
  })

  it('gives every shape a unique id', () => {
    const seeded = buildSeed(500, opts())
    expect(new Set(seeded.map((s) => s.id)).size).toBe(500)
  })

  it('never places two shapes at the same position', () => {
    // The bug this file exists to prevent a second time: two rectangles at one coordinate
    // are the same size and colour, so they are one rectangle to the eye. Drag the top one
    // and its twin is uncovered — which reads exactly like the shape you just moved
    // snapping back, and is indistinguishable from a sync failure.
    const seeded = buildSeed(500, opts())
    const positions = new Set(seeded.map((s) => `${s.x},${s.y}`))

    expect(positions.size).toBe(500)
  })

  it('keeps every shape inside the world', () => {
    const seeded = buildSeed(500, opts())

    for (const s of seeded) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.x + s.w).toBeLessThanOrEqual(WORLD.width)
      expect(s.y + s.h).toBeLessThanOrEqual(WORLD.height)
    }
  })

  it('tiles successive batches instead of stacking them', () => {
    // Seeding twice used to land the second block pixel-perfect on the first. Every batch
    // must occupy ground the previous ones did not.
    const seen = new Set<string>()

    for (let batch = 0; batch < 4; batch++) {
      const seeded = buildSeed(500, opts({ idPrefix: `seed${batch}`, existing: batch * 500 }))
      for (const s of seeded) {
        const key = `${s.x},${s.y}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }

    expect(seen.size).toBe(2000)
  })

  it('stays comfortably under the 1 MiB document ceiling at the cap [R24]', () => {
    // Two bounds, and the *lower* one is the one that bit. Every mutation rewrites the
    // whole array, so the array's size is the size of every write: at 1,456 shapes two
    // thirds of one user's drags were lost to transaction contention long before anything
    // approached 1 MiB. The cap has to clear F10's 500-object target and still leave the
    // document small enough that a write completes before the next one starts.
    const full = buildSeed(MAX_SHAPES, opts())

    expect(MAX_SHAPES).toBeGreaterThanOrEqual(500)
    expect(estimateDocBytes(full)).toBeLessThan(1024 * 1024 * 0.3)
  })
})
