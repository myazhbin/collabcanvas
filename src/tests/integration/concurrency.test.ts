import { doc, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CANVAS_ID } from '../../utils/constants.ts'
import { addShape, claimLock, commitPosition } from '../../utils/shapeOps.ts'
import { shape as makeShape } from '../../utils/testFixtures.ts'
import type { CanvasDoc, Shape } from '../../utils/types.ts'
import {
  firestoreEmulator,
  startTestEnvironment,
  type RulesTestEnvironment,
  type TestFirestore,
} from './emulator.ts'

let env: RulesTestEnvironment

const shape = (id: string, over: Partial<Shape> = {}) =>
  makeShape(id, { x: 0, y: 0, createdBy: 'seed', updatedAt: 0, updatedBy: 'seed', ...over })

const canvas = (fs: TestFirestore) => doc(fs, 'canvas', CANVAS_ID)

async function mutate(fs: TestFirestore, body: (shapes: Shape[]) => Shape[]): Promise<void> {
  await runTransaction(fs, async (tx) => {
    const snap = await tx.get(canvas(fs))
    const current = (snap.data() as CanvasDoc | undefined)?.shapes ?? []
    const next = body(current)
    if (next === current) return
    tx.set(canvas(fs), { shapes: next } satisfies CanvasDoc)
  })
}

async function readShapes(fs: TestFirestore): Promise<Shape[]> {
  const snap = await getDoc(canvas(fs))
  return (snap.data() as CanvasDoc | undefined)?.shapes ?? []
}

beforeAll(async () => {
  env = await startTestEnvironment({ firestore: firestoreEmulator() })
}, 30_000)

afterAll(async () => env?.cleanup())

describe('concurrent writes to the shapes array [R23]', () => {
  let alice: TestFirestore
  let bob: TestFirestore

  beforeEach(async () => {
    await env.clearFirestore()
    alice = env.authenticatedContext('alice').firestore()
    bob = env.authenticatedContext('bob').firestore()
  })

  const seedCanvas = (shapes: Shape[]) => setDoc(canvas(alice), { shapes } satisfies CanvasDoc)

  it('two clients creating DIFFERENT shapes concurrently — both survive', async () => {
    await seedCanvas([])

    await Promise.all([
      mutate(alice, (s) => addShape(s, shape('from-alice'))),
      mutate(bob, (s) => addShape(s, shape('from-bob'))),
    ])

    const ids = (await readShapes(alice)).map((s) => s.id).sort()
    expect(ids).toEqual(['from-alice', 'from-bob'])
  })

  it('two clients moving DIFFERENT rectangles concurrently — both changes stick', async () => {
    await seedCanvas([shape('a'), shape('b')])

    await Promise.all([
      mutate(alice, (s) => commitPosition(s, 'a', { x: 111, y: 111 }, 'alice')),
      mutate(bob, (s) => commitPosition(s, 'b', { x: 222, y: 222 }, 'bob')),
    ])

    const shapes = await readShapes(alice)
    expect(shapes.find((s) => s.id === 'a')?.x).toBe(111)
    expect(shapes.find((s) => s.id === 'b')?.x).toBe(222)
  })

  it('survives a burst of ten concurrent creates', async () => {
    await seedCanvas([])

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        mutate(i % 2 ? alice : bob, (s) => addShape(s, shape(`s${i}`))),
      ),
    )

    expect(await readShapes(alice)).toHaveLength(10)
  })

  it('two clients grabbing the SAME rectangle — exactly one wins the lock [R10]', async () => {
    await seedCanvas([shape('contested')])

    await Promise.all([
      mutate(alice, (s) => claimLock(s, 'contested', 'alice')),
      mutate(bob, (s) => claimLock(s, 'contested', 'bob')),
    ])

    const held = (await readShapes(alice))[0].draggedBy
    expect(['alice', 'bob']).toContain(held)
  })

  it("the loser's commit is refused rather than clobbering the holder [R10]", async () => {
    await seedCanvas([shape('contested', { draggedBy: 'alice', x: 10 })])

    await mutate(bob, (s) => commitPosition(s, 'contested', { x: 999 }, 'bob'))

    const after = (await readShapes(alice))[0]
    expect(after.x).toBe(10)
    expect(after.draggedBy).toBe('alice')
  })

  it('DEMONSTRATES THE BUG: the same scenario with a plain updateDoc loses a write', async () => {
    await seedCanvas([shape('a'), shape('b')])

    const [aliceView, bobView] = await Promise.all([readShapes(alice), readShapes(bob)])

    await updateDoc(canvas(alice), {
      shapes: commitPosition(aliceView, 'a', { x: 111 }, 'alice'),
    })
    await updateDoc(canvas(bob), {
      shapes: commitPosition(bobView, 'b', { x: 222 }, 'bob'),
    })

    const shapes = await readShapes(alice)
    expect(shapes.find((s) => s.id === 'b')?.x).toBe(222)
    expect(shapes.find((s) => s.id === 'a')?.x).toBe(0)
  })
})
