import { get, ref, remove, set, update } from 'firebase/database'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CANVAS_ID } from '../../utils/constants.ts'
import { collectRemoteDrags } from '../../utils/shapeDiff.ts'
import type { DragPayload, SessionNode } from '../../utils/types.ts'
import {
  databaseEmulator,
  startTestEnvironment,
  type RulesTestEnvironment,
  type TestDatabase,
} from './emulator.ts'

let env: RulesTestEnvironment

const SESSIONS = `sessions/${CANVAS_ID}`

const identity = (uid: string) => ({
  uid,
  name: uid,
  colour: '#2563eb',
  cursor: null,
  drag: null,
  lastSeen: Date.now(),
})

async function readDrags(db: TestDatabase, mySessionId: string) {
  const snap = await get(ref(db, SESSIONS))
  const sessions = (snap.val() as Record<string, SessionNode> | null) ?? {}
  return collectRemoteDrags(sessions, mySessionId)
}

const session = (db: TestDatabase, id: string) => ref(db, `${SESSIONS}/${id}`)

const setDrag = (db: TestDatabase, id: string, drag: DragPayload | null) =>
  update(session(db, id), { drag })

beforeAll(async () => {
  env = await startTestEnvironment({ database: databaseEmulator() })
}, 30_000)

afterAll(async () => env?.cleanup())

describe('in-flight drag over RTDB [Decision 9]', () => {
  let alice: TestDatabase
  let bob: TestDatabase

  beforeEach(async () => {
    await env.clearDatabase()
    alice = env.authenticatedContext('alice').database()
    bob = env.authenticatedContext('bob').database()

    await set(session(alice, 'sess-alice'), identity('alice'))
    await set(session(bob, 'sess-bob'), identity('bob'))
  })

  it("a drag written by one tab is readable by the other, at the right position", async () => {
    await setDrag(alice, 'sess-alice', { id: 'rect-1', x: 4321, y: 1234 })

    const drags = await readDrags(bob, 'sess-bob')
    expect(drags.get('rect-1')).toEqual({ x: 4321, y: 1234 })
  })

  it('the writer does NOT see its own drag', async () => {
    await setDrag(alice, 'sess-alice', { id: 'rect-1', x: 10, y: 20 })

    expect((await readDrags(alice, 'sess-alice')).size).toBe(0)
  })

  it('clearing on release removes it for everyone', async () => {
    await setDrag(alice, 'sess-alice', { id: 'rect-1', x: 10, y: 20 })
    expect((await readDrags(bob, 'sess-bob')).size).toBe(1)

    await setDrag(alice, 'sess-alice', null)

    expect((await readDrags(bob, 'sess-bob')).size).toBe(0)
  })

  it('the identity written at announce survives a drag update untouched', async () => {
    await setDrag(alice, 'sess-alice', { id: 'rect-1', x: 1, y: 2 })

    const snap = await get(session(bob, 'sess-alice'))
    const node = snap.val() as SessionNode

    expect(node.uid).toBe('alice')
    expect(node.name).toBe('alice')
    expect(node.colour).toBe('#2563eb')
  })

  it('two tabs dragging different shapes are both visible to a third reader', async () => {
    await setDrag(alice, 'sess-alice', { id: 'rect-a', x: 1, y: 1 })
    await setDrag(bob, 'sess-bob', { id: 'rect-b', x: 2, y: 2 })

    const drags = await readDrags(bob, 'sess-nobody')
    expect([...drags.keys()].sort()).toEqual(['rect-a', 'rect-b'])
  })

  it('a departed tab takes its in-flight drag with it', async () => {
    await setDrag(alice, 'sess-alice', { id: 'rect-1', x: 1, y: 2 })
    await remove(session(alice, 'sess-alice'))

    expect((await readDrags(bob, 'sess-bob')).size).toBe(0)
  })
})
