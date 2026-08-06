import { describe, expect, it } from 'vitest'
import { canDrag, lockHolder } from './shapeLocks'

describe('canDrag', () => {
  it('allows dragging a shape nobody holds', () => {
    expect(canDrag({ draggedBy: null }, 'alice')).toBe(true)
  })

  it('allows dragging when the field is absent entirely', () => {
    expect(canDrag({ draggedBy: undefined as unknown as null }, 'alice')).toBe(true)
  })

  it('allows dragging a shape you already hold', () => {
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
    expect(canDrag({ draggedBy: 'ghost' }, 'alice', new Set(['alice', 'bob']))).toBe(true)
  })

  it('still respects a lock whose holder IS live', () => {
    expect(canDrag({ draggedBy: 'bob' }, 'alice', new Set(['alice', 'bob']))).toBe(false)
  })

  it('keeps honouring the lock when liveness is unknown', () => {
    expect(canDrag({ draggedBy: 'bob' }, 'alice')).toBe(false)
    expect(canDrag({ draggedBy: 'bob' }, 'alice', undefined)).toBe(false)
  })

  it('an empty live set frees every foreign lock', () => {
    expect(canDrag({ draggedBy: 'bob' }, 'alice', new Set())).toBe(true)
  })
})

describe('lockHolder — who the outline is coloured for', () => {
  it('names a holder exactly when canDrag refuses', () => {
    for (const draggedBy of [null, 'alice', 'bob']) {
      for (const uid of ['alice', null]) {
        expect(lockHolder({ draggedBy }, uid) !== null).toBe(!canDrag({ draggedBy }, uid))
      }
    }
  })

  it('never reports your own lock as someone else’s', () => {
    expect(lockHolder({ draggedBy: 'alice' }, 'alice')).toBe(null)
  })

  it('hands back the uid to colour the outline with', () => {
    expect(lockHolder({ draggedBy: 'bob' }, 'alice', new Set(['bob']))).toBe('bob')
  })
})
