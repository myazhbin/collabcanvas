import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { get, ref } from 'firebase/database'
import { afterAll, beforeAll, describe, it } from 'vitest'
// Explicit extension: this file compiles under tsconfig.node.json, which is nodenext.
import { CANVAS_ID } from '../../utils/constants.ts'

/**
 * Tier 3 [R5]. Loads the **committed** rule files, not whatever is in the console —
 * that divergence is the whole failure mode, and pointing the emulator at the console
 * would test nothing.
 */
let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // `demo-` prefix: the emulator serves it without credentials and can never reach
    // the real project, so a stray write here cannot touch production data.
    projectId: 'demo-collabcanvas',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    database: {
      rules: readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  })
}, 30_000)

afterAll(async () => env?.cleanup())

describe('firestore.rules', () => {
  it('denies an unauthenticated read of the canvas doc', async () => {
    const fs = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(fs, 'canvas', CANVAS_ID)))
  })

  it('allows an authenticated read and write', async () => {
    const fs = env.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(fs, 'canvas', CANVAS_ID)))
    await assertSucceeds(setDoc(doc(fs, 'canvas', CANVAS_ID), { shapes: [] }))
  })
})

describe('database.rules.json', () => {
  it('allows an authenticated read of the parent path the client listens on', async () => {
    // The listener subscribes to /sessions/{canvasId}, not a child. Granting read only
    // one level deeper compiles fine and then fails at runtime with PERMISSION_DENIED [R5].
    const rtdb = env.authenticatedContext('alice').database()
    await assertSucceeds(get(ref(rtdb, `sessions/${CANVAS_ID}`)))
  })

  it('denies an unlisted path, proving the top-level false actually defaults', async () => {
    const rtdb = env.authenticatedContext('alice').database()
    await assertFails(get(ref(rtdb, 'admin')))
  })
})
