import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  initializeAuth,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase, onValue, ref } from 'firebase/database'

const env = import.meta.env

const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
}

if (!firebaseConfig.databaseURL) {
  throw new Error(
    'VITE_FIREBASE_DATABASE_URL is missing — confirm `.env` reached this build (Vite reads only VITE_* vars, at build time) and that the Realtime Database is provisioned in us-central1 [R1,R15]',
  )
}

const app = initializeApp(firebaseConfig)

export const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
})

export const db = getFirestore(app)
export const rtdb = getDatabase(app)

export type Connection = { connected: boolean; offset: number }

let snapshot: Connection = { connected: false, offset: 0 }
const listeners = new Set<() => void>()

const patch = (next: Partial<Connection>) => {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((notify) => notify())
}

onValue(ref(rtdb, '.info/connected'), (s) => patch({ connected: s.val() === true }))
onValue(ref(rtdb, '.info/serverTimeOffset'), (s) => patch({ offset: s.val() ?? 0 }))

export const connectionStore = {
  subscribe: (notify: () => void) => {
    listeners.add(notify)
    return () => void listeners.delete(notify)
  },
  getSnapshot: () => snapshot,
}
