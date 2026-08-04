import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// Explicit extension: this file compiles under tsconfig.node.json, which is nodenext.
import { CANVAS_ID } from '../../utils/constants.ts'
import { addShape, claimLock, commitPosition } from '../../utils/shapeOps.ts'
import type { CanvasDoc, Shape } from '../../utils/types.ts'

/**
 * Tier 3 · PR 8 — R23, and acceptance item 8.
 *
 * `shapeOps.test.ts` proves the transaction *bodies* are pure and idempotent, but purity
 * is only half of R23: the other half is whether wrapping them in `runTransaction`
 * actually serialises two clients writing the same document at the same moment. That
 * cannot be asserted without a real backend, which is what this file is for.
 *
 * The last test deliberately demonstrates the **bug** — the same scenario with a plain
 * `updateDoc` loses a write. It is here so the transaction is visibly earning its cost
 * rather than being taken on faith.
 */
let env: RulesTestEnvironment

/**
 * The Firestore instance handed out by `@firebase/rules-unit-testing`, which is not
 * structurally identical to the one `firebase/firestore` exports. Derived rather than
 * imported so the two can never drift apart on a version bump.
 */
type TestFirestore = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>

const shape = (id: string, over: Partial<Shape> = {}): Shape => ({
  id,
  x: 0,
  y: 0,
  w: 120,
  h: 80,
  fill: '#2563eb',
  createdBy: 'seed',
  updatedAt: 0,
  updatedBy: 'seed',
  draggedBy: null,
  ...over,
})

const canvas = (fs: TestFirestore) => doc(fs, 'canvas', CANVAS_ID)

/** The production write path, reproduced: read the array, apply a pure body, write it back. */
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
  env = await initializeTestEnvironment({
    projectId: 'demo-collabcanvas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
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

  it('two clients creating DIFFERENT shapes concurrently — both survive', async () => {
    await setDoc(canvas(alice), { shapes: [] } satisfies CanvasDoc)

    // Fired together, not awaited in sequence — sequential writes cannot contend and the
    // test would pass against a plainly broken implementation.
    await Promise.all([
      mutate(alice, (s) => addShape(s, shape('from-alice'))),
      mutate(bob, (s) => addShape(s, shape('from-bob'))),
    ])

    const ids = (await readShapes(alice)).map((s) => s.id).sort()
    expect(ids).toEqual(['from-alice', 'from-bob'])
  })

  it('two clients moving DIFFERENT rectangles concurrently — both changes stick', async () => {
    // Acceptance item 8, and the single most valuable assertion in this file.
    await setDoc(canvas(alice), {
      shapes: [shape('a'), shape('b')],
    } satisfies CanvasDoc)

    await Promise.all([
      mutate(alice, (s) => commitPosition(s, 'a', { x: 111, y: 111 }, 'alice')),
      mutate(bob, (s) => commitPosition(s, 'b', { x: 222, y: 222 }, 'bob')),
    ])

    const shapes = await readShapes(alice)
    expect(shapes.find((s) => s.id === 'a')?.x).toBe(111)
    expect(shapes.find((s) => s.id === 'b')?.x).toBe(222)
  })

  it('survives a burst of ten concurrent creates', async () => {
    await setDoc(canvas(alice), { shapes: [] } satisfies CanvasDoc)

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        mutate(i % 2 ? alice : bob, (s) => addShape(s, shape(`s${i}`))),
      ),
    )

    expect(await readShapes(alice)).toHaveLength(10)
  })

  it('two clients grabbing the SAME rectangle — exactly one wins the lock [R10]', async () => {
    await setDoc(canvas(alice), { shapes: [shape('contested')] } satisfies CanvasDoc)

    await Promise.all([
      mutate(alice, (s) => claimLock(s, 'contested', 'alice')),
      mutate(bob, (s) => claimLock(s, 'contested', 'bob')),
    ])

    const held = (await readShapes(alice))[0].draggedBy
    // One holder, deterministically — not both, and not null. Which one wins is a race and
    // does not matter; that the outcome is a single clean holder is the whole of F4.
    expect(['alice', 'bob']).toContain(held)
  })

  it("the loser's commit is refused rather than clobbering the holder [R10]", async () => {
    await setDoc(canvas(alice), {
      shapes: [shape('contested', { draggedBy: 'alice', x: 10 })],
    } satisfies CanvasDoc)

    await mutate(bob, (s) => commitPosition(s, 'contested', { x: 999 }, 'bob'))

    const after = (await readShapes(alice))[0]
    expect(after.x).toBe(10)
    expect(after.draggedBy).toBe('alice')
  })

  it('DEMONSTRATES THE BUG: the same scenario with a plain updateDoc loses a write', async () => {
    // Kept deliberately. This is the failure the transaction exists to prevent, and seeing
    // it fail here is the only direct evidence that Decision 8 is load-bearing rather than
    // defensive habit.
    await setDoc(canvas(alice), {
      shapes: [shape('a'), shape('b')],
    } satisfies CanvasDoc)

    // Both read the array first — the read-modify-write race, exactly as it happens when
    // two people drag different rectangles at the same moment.
    const [aliceView, bobView] = await Promise.all([readShapes(alice), readShapes(bob)])

    await updateDoc(canvas(alice), {
      shapes: commitPosition(aliceView, 'a', { x: 111 }, 'alice'),
    })
    await updateDoc(canvas(bob), {
      shapes: commitPosition(bobView, 'b', { x: 222 }, 'bob'),
    })

    const shapes = await readShapes(alice)
    // Bob wrote the array he read before Alice's change existed, so hers is gone.
    expect(shapes.find((s) => s.id === 'b')?.x).toBe(222)
    expect(shapes.find((s) => s.id === 'a')?.x).toBe(0)
  })
})
