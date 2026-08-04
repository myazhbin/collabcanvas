import { describe, expect, it } from 'vitest'
import { collectRemoteDrags, shapeDiff } from './shapeDiff'
import type { Shape } from './types'

/**
 * Tier 1 · PR 8 — the most valuable test file in the plan. Every assertion here maps to a
 * bug whose only symptom is "sync is broken": a canvas that drops to single-digit frame
 * rates, or a rectangle that fights your pointer while you drag it.
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

/** A distinct object with identical values — what actually comes off the wire. */
const clone = (s: Shape): Shape => ({ ...s })

describe('referential identity — the R7 mitigation', () => {
  it('hands back the EXACT previous object for an unchanged shape', () => {
    const previous = [shape('a'), shape('b')]
    const incoming = previous.map(clone)

    const { shapes } = shapeDiff(previous, incoming)

    // Not toEqual. `memo` compares by reference, so equal-but-new objects re-render
    // everything and the whole exercise is pointless.
    expect(shapes[0]).toBe(previous[0])
    expect(shapes[1]).toBe(previous[1])
  })

  it('gives a changed shape a new reference and leaves every other entry untouched', () => {
    const previous = [shape('a'), shape('b'), shape('c')]
    const incoming = [clone(previous[0]), { ...previous[1], x: 999 }, clone(previous[2])]

    const { shapes } = shapeDiff(previous, incoming)

    expect(shapes[1]).not.toBe(previous[1])
    expect(shapes[1].x).toBe(999)
    expect(shapes[0]).toBe(previous[0])
    expect(shapes[2]).toBe(previous[2])
  })

  it('reuses 499 of 500 references when one shape moves', () => {
    // The actual performance claim, asserted rather than assumed.
    const previous = Array.from({ length: 500 }, (_, i) => shape(`s${i}`))
    const incoming = previous.map(clone)
    incoming[250] = { ...incoming[250], x: 4242 }

    const { shapes } = shapeDiff(previous, incoming)
    const reused = shapes.filter((s, i) => s === previous[i]).length

    expect(reused).toBe(499)
    expect(shapes[250]).not.toBe(previous[250])
  })

  it('returns the previous array itself when nothing at all changed', () => {
    const previous = [shape('a'), shape('b')]
    const { shapes, changed } = shapeDiff(previous, previous.map(clone))

    expect(changed).toBe(false)
    expect(shapes).toBe(previous)
  })
})

describe('additions and removals, detected from the array alone', () => {
  it('detects an addition', () => {
    const previous = [shape('a')]
    const { shapes, changed } = shapeDiff(previous, [clone(previous[0]), shape('b')])

    expect(changed).toBe(true)
    expect(shapes.map((s) => s.id)).toEqual(['a', 'b'])
    expect(shapes[0]).toBe(previous[0])
  })

  it('detects a removal', () => {
    const previous = [shape('a'), shape('b')]
    const { shapes, changed } = shapeDiff(previous, [clone(previous[1])])

    expect(changed).toBe(true)
    expect(shapes.map((s) => s.id)).toEqual(['b'])
  })

  it('notices a reorder even when every shape is otherwise identical', () => {
    // Same ids, same values, same length — only the positions swap. A diff keyed purely on
    // membership reports "nothing changed" and the canvas keeps the stale z-order.
    const previous = [shape('a'), shape('b')]
    const { shapes, changed } = shapeDiff(previous, [clone(previous[1]), clone(previous[0])])

    expect(changed).toBe(true)
    expect(shapes.map((s) => s.id)).toEqual(['b', 'a'])
    expect(shapes[0]).toBe(previous[1])
    expect(shapes[1]).toBe(previous[0])
  })
})

describe('echo suppression — the R6 mitigation', () => {
  it('IGNORES a changed shape whose id is being dragged', () => {
    // Your own commit coming back at you. Applying it would snap the rectangle to the last
    // committed position while your hand is still moving.
    const previous = [shape('a', { x: 500 }), shape('b')]
    const incoming = [{ ...previous[0], x: 10 }, clone(previous[1])]

    const { shapes } = shapeDiff(previous, incoming, new Set(['a']))

    expect(shapes[0]).toBe(previous[0])
    expect(shapes[0].x).toBe(500)
  })

  it('still applies changes to shapes NOT in the dragging set', () => {
    const previous = [shape('a', { x: 500 }), shape('b')]
    const incoming = [{ ...previous[0], x: 10 }, { ...previous[1], x: 77 }]

    const { shapes } = shapeDiff(previous, incoming, new Set(['a']))

    expect(shapes[0].x).toBe(500) // suppressed
    expect(shapes[1].x).toBe(77) // applied
  })

  it('clears a removed id from the dragging set', () => {
    // Deleted mid-drag. Left in the set, that id is suppressed forever — and since the set
    // is what gates echo handling, the shape silently stops syncing for the whole session.
    const previous = [shape('a'), shape('b')]
    const { dragging } = shapeDiff(previous, [clone(previous[1])], new Set(['a', 'b']))

    expect([...dragging]).toEqual(['b'])
  })

  it('does not mutate the dragging set it was handed', () => {
    const held = new Set(['a', 'b'])
    shapeDiff([shape('a'), shape('b')], [shape('b')], held)

    expect([...held]).toEqual(['a', 'b'])
  })

  it('returns the same set reference when no dragged id disappeared', () => {
    const held = new Set(['a'])
    const { dragging } = shapeDiff([shape('a')], [shape('a')], held)

    expect(dragging).toBe(held)
  })
})

describe('collectRemoteDrags — the in-flight half of the handoff', () => {
  const node = (drag: { id: string; x: number; y: number } | null) => ({ drag })

  it('maps a shape id to the position off the dragging session node', () => {
    const drags = collectRemoteDrags(
      { mine: node(null), theirs: node({ id: 'a', x: 300, y: 400 }) },
      'mine',
    )

    expect(drags.get('a')).toEqual({ x: 300, y: 400 })
  })

  it('EXCLUDES your own session', () => {
    // Konva is already moving that node under your pointer. Rendering your own drag from
    // the wire adds a network round trip to your own hand, which reads as lag.
    const drags = collectRemoteDrags({ mine: node({ id: 'a', x: 9, y: 9 }) }, 'mine')

    expect(drags.size).toBe(0)
  })

  it('ignores sessions with no drag in flight', () => {
    const drags = collectRemoteDrags(
      { a: node(null), b: {}, c: null as unknown as { drag: null } },
      'mine',
    )

    expect(drags.size).toBe(0)
  })

  it('drops malformed payloads rather than rendering a shape at NaN', () => {
    const drags = collectRemoteDrags(
      {
        bad1: node({ id: 'a', x: Number.NaN, y: 5 }),
        bad2: node({ id: 'b', x: 5, y: Number.POSITIVE_INFINITY }),
        bad3: { drag: { id: 42 as unknown as string, x: 1, y: 2 } },
        good: node({ id: 'd', x: 1, y: 2 }),
      },
      'mine',
    )

    expect([...drags.keys()]).toEqual(['d'])
  })
})
