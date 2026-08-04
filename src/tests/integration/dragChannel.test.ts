import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { get, ref, remove, set, update } from 'firebase/database'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// Explicit extensions: this file compiles under tsconfig.node.json, which is nodenext.
import { CANVAS_ID } from '../../utils/constants.ts'
import { collectRemoteDrags } from '../../utils/shapeDiff.ts'
import type { SessionNode } from '../../utils/types.ts'

/**
 * Tier 3 · PR 8 — the in-flight drag channel, end to end through a real database.
 *
 * `throttle.test.ts` covers the send rate and `shapeDiff.test.ts` covers the mapping, but
 * both work on values in memory. What neither can show is that the two halves agree across
 * the wire: that the shape written by `startDragChannel` at
 * `/sessions/{canvas}/{session}/drag` is the shape `collectRemoteDrags` reads back, under
 * the committed RTDB rules, on the parent path a client actually listens on.
 *
 * That seam — writer and reader agreeing on a path and a payload — is exactly where a
 * refactor breaks things silently, because each side keeps passing its own unit tests.
 */
let env: RulesTestEnvironment

type TestDatabase = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['database']>

const SESSIONS = `sessions/${CANVAS_ID}`

const identity = (uid: string) => ({
  uid,
  name: uid,
  colour: '#2563eb',
  cursor: null,
  drag: null,
  lastSeen: Date.now(),
})

/** Read the parent path exactly as `usePresence` does, then map it as `Canvas` does. */
async function readDrags(db: TestDatabase, mySessionId: string) {
  const snap = await get(ref(db, SESSIONS))
  const sessions = (snap.val() as Record<string, SessionNode> | null) ?? {}
  return collectRemoteDrags(sessions, mySessionId)
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-collabcanvas',
    database: {
      rules: readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  })
}, 30_000)

afterAll(async () => env?.cleanup())

describe('in-flight drag over RTDB [Decision 9]', () => {
  let alice: TestDatabase
  let bob: TestDatabase

  beforeEach(async () => {
    await env.clearDatabase()
    alice = env.authenticatedContext('alice').database()
    bob = env.authenticatedContext('bob').database()

    // Both tabs announce, exactly as presence does before any drag write is allowed.
    await set(ref(alice, `${SESSIONS}/sess-alice`), identity('alice'))
    await set(ref(bob, `${SESSIONS}/sess-bob`), identity('bob'))
  })

  it("a drag written by one tab is readable by the other, at the right position", async () => {
    await update(ref(alice, `${SESSIONS}/sess-alice`), {
      drag: { id: 'rect-1', x: 4321, y: 1234 },
    })

    const drags = await readDrags(bob, 'sess-bob')
    expect(drags.get('rect-1')).toEqual({ x: 4321, y: 1234 })
  })

  it('the writer does NOT see its own drag', async () => {
    // Konva already owns that node under the pointer; rendering it back off the wire would
    // add a network round trip to your own hand.
    await update(ref(alice, `${SESSIONS}/sess-alice`), {
      drag: { id: 'rect-1', x: 10, y: 20 },
    })

    expect((await readDrags(alice, 'sess-alice')).size).toBe(0)
  })

  it('clearing on release removes it for everyone', async () => {
    const node = ref(alice, `${SESSIONS}/sess-alice`)
    await update(node, { drag: { id: 'rect-1', x: 10, y: 20 } })
    expect((await readDrags(bob, 'sess-bob')).size).toBe(1)

    // `null` is what the channel writes on release — it must delete the key, not store a
    // literal null the reader then has to defend against.
    await update(node, { drag: null })

    expect((await readDrags(bob, 'sess-bob')).size).toBe(0)
  })

  it('the identity written at announce survives a drag update untouched', async () => {
    // The whole reason cursor and drag share the presence node: `update` must patch one
    // key, never replace the node. If it replaced it, every drag frame would also resend
    // name and colour — and worse, briefly blank them.
    await update(ref(alice, `${SESSIONS}/sess-alice`), {
      drag: { id: 'rect-1', x: 1, y: 2 },
    })

    const snap = await get(ref(bob, `${SESSIONS}/sess-alice`))
    const node = snap.val() as SessionNode

    expect(node.uid).toBe('alice')
    expect(node.name).toBe('alice')
    expect(node.colour).toBe('#2563eb')
  })

  it('two tabs dragging different shapes are both visible to a third reader', async () => {
    await update(ref(alice, `${SESSIONS}/sess-alice`), { drag: { id: 'rect-a', x: 1, y: 1 } })
    await update(ref(bob, `${SESSIONS}/sess-bob`), { drag: { id: 'rect-b', x: 2, y: 2 } })

    const drags = await readDrags(bob, 'sess-nobody')
    expect([...drags.keys()].sort()).toEqual(['rect-a', 'rect-b'])
  })

  it('a departed tab takes its in-flight drag with it', async () => {
    // What `onDisconnect().remove()` does on a crash. The drag must not outlive the node,
    // or the rectangle stays pinned at a frozen position for everyone else [R10].
    await update(ref(alice, `${SESSIONS}/sess-alice`), { drag: { id: 'rect-1', x: 1, y: 2 } })
    await remove(ref(alice, `${SESSIONS}/sess-alice`))

    expect((await readDrags(bob, 'sess-bob')).size).toBe(0)
  })
})
