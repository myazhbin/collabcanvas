import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { get, ref } from 'firebase/database'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { CANVAS_ID } from '../../utils/constants.ts'
import {
  databaseEmulator,
  firestoreEmulator,
  startTestEnvironment,
  type RulesTestEnvironment,
} from './emulator.ts'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await startTestEnvironment({ firestore: firestoreEmulator(), database: databaseEmulator() })
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
    const rtdb = env.authenticatedContext('alice').database()
    await assertSucceeds(get(ref(rtdb, `sessions/${CANVAS_ID}`)))
  })

  it('denies an unlisted path, proving the top-level false actually defaults', async () => {
    const rtdb = env.authenticatedContext('alice').database()
    await assertFails(get(ref(rtdb, 'admin')))
  })
})
