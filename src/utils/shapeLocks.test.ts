import { describe, expect, it } from 'vitest'
import { canDrag, isLockedByOther } from './shapeLocks'

/** Tier 2 · PR 8 — R10. Three lines of logic, one of which is a real bug when written
 *  as a truthiness check. */
describe('canDrag', () => {
  it('allows dragging a shape nobody holds', () => {
    expect(canDrag({ draggedBy: null }, 'alice')).toBe(true)
  })

  it('allows dragging when the field is absent entirely', () => {
    // A shape written before the field existed, or caught mid-write. Failing closed here
    // would make it permanently immovable for everyone, with no way to release it.
    expect(canDrag({ draggedBy: undefined as unknown as null }, 'alice')).toBe(true)
  })

  it('allows dragging a shape you already hold', () => {
    // `if (shape.draggedBy) return false` passes the other tests and fails this one, which
    // presents as the drag mysteriously dying on the second grab of the same rectangle.
    expect(canDrag({ draggedBy: 'alice' }, 'alice')).toBe(true)
  })

  it('refuses a shape held by someone else [R10]', () => {
    expect(canDrag({ draggedBy: 'bob' }, 'alice')).toBe(false)
  })

  it('refuses a held shape when you are signed out', () => {
    expect(canDrag({ draggedBy: 'bob' }, null)).toBe(false)
    expect(canDrag({ draggedBy: null }, null)).toBe(true)
  })
})

describe('stale locks — why a crash cannot freeze a shape forever [R10]', () => {
  it('frees a lock whose holder has no live session', () => {
    // draggedBy lives in Firestore, which onDisconnect cannot touch — it only removes the
    // RTDB session node. Without this the rectangle is immovable for everyone, forever.
    expect(canDrag({ draggedBy: 'ghost' }, 'alice', new Set(['alice', 'bob']))).toBe(true)
  })

  it('still respects a lock whose holder IS live', () => {
    expect(canDrag({ draggedBy: 'bob' }, 'alice', new Set(['alice', 'bob']))).toBe(false)
  })

  it('keeps honouring the lock when liveness is unknown', () => {
    // Omitting the set must not silently unlock everything — presence not having loaded
    // yet is not evidence that nobody is holding anything.
    expect(canDrag({ draggedBy: 'bob' }, 'alice')).toBe(false)
    expect(canDrag({ draggedBy: 'bob' }, 'alice', undefined)).toBe(false)
  })

  it('an empty live set frees every foreign lock', () => {
    // The genuine cold-start case: the canvas has locks, nobody is online.
    expect(canDrag({ draggedBy: 'bob' }, 'alice', new Set())).toBe(true)
  })
})

describe('isLockedByOther — what the outline renders on', () => {
  it('is the exact inverse of canDrag', () => {
    for (const draggedBy of [null, 'alice', 'bob']) {
      for (const uid of ['alice', null]) {
        expect(isLockedByOther({ draggedBy }, uid)).toBe(!canDrag({ draggedBy }, uid))
      }
    }
  })

  it('never marks your own lock as someone else’s', () => {
    expect(isLockedByOther({ draggedBy: 'alice' }, 'alice')).toBe(false)
  })
})
