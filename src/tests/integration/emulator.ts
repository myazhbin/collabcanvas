import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

export type { RulesTestEnvironment }

export type TestFirestore = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>

export type TestDatabase = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['database']>

export const firestoreEmulator = () => ({
  rules: readFileSync('firestore.rules', 'utf8'),
  host: '127.0.0.1',
  port: 8080,
})

export const databaseEmulator = () => ({
  rules: readFileSync('database.rules.json', 'utf8'),
  host: '127.0.0.1',
  port: 9000,
})

export const startTestEnvironment = (
  config: Omit<Parameters<typeof initializeTestEnvironment>[0], 'projectId'>,
) => initializeTestEnvironment({ projectId: 'demo-collabcanvas', ...config })
