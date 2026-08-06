import { describe, expect, it } from 'vitest'
import {
  addShape,
  buildSeed,
  buildStarter,
  claimLock,
  commitPosition,
  MAX_SHAPES,
  patchShape,
  releaseAllLocks,
  releaseLock,
  removeShape,
  SHAPE_DOC_BYTES,
  type SeedOptions,
} from './shapeOps'
import { WORLD } from './constants'
import { shape } from './testFixtures'
import type { Shape } from './types'

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
    const input = base()

    expect(addShape(input, shape('a'))).toBe(input)
    expect(patchShape(input, 'nope', { x: 1 })).toBe(input)
    expect(removeShape(input, 'nope')).toBe(input)
    expect(releaseLock(input, 'a', 'alice')).toBe(input)
    expect(releaseAllLocks(input, 'nobody')).toBe(input)
  })
})

describe('idempotence — applying twice equals applying once [R23]', () => {
  const input = base()
  const held = [shape('a', { draggedBy: 'bob' }), shape('b')]

  const cases: [string, Shape[], (s: Shape[]) => Shape[]][] = [
    ['addShape', input, (s) => addShape(s, shape('d'))],
    ['patchShape', input, (s) => patchShape(s, 'a', { x: 42 })],
    ['removeShape', input, (s) => removeShape(s, 'b')],
    ['claimLock', input, (s) => claimLock(s, 'a', 'alice')],
    ['releaseLock', held, (s) => releaseLock(s, 'a', 'bob')],
  ]

  it.each(cases)('%s applied twice equals applied once', (_name, start, op) => {
    const once = op(start)

    expect(op(once)).toEqual(once)
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

    expect(after).toBe(held)
    expect(after[0].draggedBy).toBe('bob')
  })

  it('re-claiming your own lock succeeds and stays a no-op', () => {
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
    const held = [shape('a', { draggedBy: 'bob', x: 10 })]
    const after = commitPosition(held, 'a', { x: 900 }, 'alice')

    expect(after).toBe(held)
    expect(after[0].x).toBe(10)
  })

  it('is a safe no-op for a shape deleted mid-drag', () => {
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

const expectPopulated = (s: Shape) => {
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

describe('buildSeed — PR 10 seed case [R22,R24]', () => {
  const SEED_OPTS: SeedOptions = { uid: 'alice', now: 1000, idPrefix: 'seed1' }

  const seeded = buildSeed(500, SEED_OPTS)

  it('returns one array of `count` valid shapes with every field populated', () => {
    expect(seeded).toHaveLength(500)
    for (const s of seeded) expectPopulated(s)
  })

  it('gives every shape a unique id', () => {
    expect(new Set(seeded.map((s) => s.id)).size).toBe(500)
  })

  it('never places two shapes at the same position', () => {
    const positions = new Set(seeded.map((s) => `${s.x},${s.y}`))

    expect(positions.size).toBe(500)
  })

  it('keeps every shape inside the world', () => {
    for (const s of seeded) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.x + s.w).toBeLessThanOrEqual(WORLD.width)
      expect(s.y + s.h).toBeLessThanOrEqual(WORLD.height)
    }
  })

  it('tiles successive batches instead of stacking them', () => {
    const seen = new Set<string>()

    for (let batch = 0; batch < 4; batch++) {
      const batched = buildSeed(500, {
        ...SEED_OPTS,
        idPrefix: `seed${batch}`,
        existing: batch * 500,
      })
      for (const s of batched) {
        const key = `${s.x},${s.y}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }

    expect(seen.size).toBe(2000)
  })

  it('stays under the 1 MiB document ceiling at the cap [R24]', () => {
    const full = buildSeed(MAX_SHAPES, SEED_OPTS)

    expect(MAX_SHAPES).toBeGreaterThanOrEqual(500)
    expect(full.length * SHAPE_DOC_BYTES).toBeLessThan(1024 * 1024)
  })
})

describe('buildStarter — PR 10, the canvas is never empty [R22]', () => {
  const STARTER_OPTS = { uid: 'alice', now: 1000, idPrefix: 'starter' }

  const starter = buildStarter(STARTER_OPTS)

  it('returns 3–5 shapes with every field populated', () => {
    expect(starter.length).toBeGreaterThanOrEqual(3)
    expect(starter.length).toBeLessThanOrEqual(5)

    for (const s of starter) expectPopulated(s)
  })

  it('gives every shape a unique id and a unique position', () => {
    expect(new Set(starter.map((s) => s.id)).size).toBe(starter.length)
    expect(new Set(starter.map((s) => `${s.x},${s.y}`)).size).toBe(starter.length)
  })

  it('lands on screen at the viewport the canvas opens on', () => {
    for (const s of starter) {
      expect(Math.abs(s.x + s.w / 2 - WORLD.width / 2)).toBeLessThan(640)
      expect(Math.abs(s.y + s.h / 2 - WORLD.height / 2)).toBeLessThan(360)
    }
  })

  it('centres the block on the world centre', () => {
    const left = Math.min(...starter.map((s) => s.x))
    const right = Math.max(...starter.map((s) => s.x + s.w))
    const top = Math.min(...starter.map((s) => s.y))
    const bottom = Math.max(...starter.map((s) => s.y + s.h))

    expect((left + right) / 2).toBeCloseTo(WORLD.width / 2)
    expect((top + bottom) / 2).toBeCloseTo(WORLD.height / 2)
  })

  it('does not overlap itself', () => {
    for (let i = 0; i < starter.length; i++) {
      for (let j = i + 1; j < starter.length; j++) {
        const a = starter[i]
        const b = starter[j]
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
        expect(apart).toBe(true)
      }
    }
  })
})
