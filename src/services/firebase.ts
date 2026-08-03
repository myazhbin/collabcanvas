import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase, onValue, ref } from 'firebase/database'

/** From `.env` at the project root — gitignored, so copy `.env.example` on a fresh
 *  clone. Vite inlines VITE_*-prefixed vars at build time, so these ship in the
 *  bundle regardless; the web API key is public by design. */
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

// Catches both ways this key goes missing: a build host with no `.env` blanks every
// field [R1], and registering the web app before provisioning RTDB blanks just this
// one [R15]. Without the check, getDatabase() throws far from either cause.
if (!firebaseConfig.databaseURL) {
  throw new Error(
    'VITE_FIREBASE_DATABASE_URL is missing — confirm `.env` reached this build (Vite reads only VITE_* vars, at build time) and that the Realtime Database is provisioned in us-central1 [R1,R15]',
  )
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const rtdb = getDatabase(app)

export type Connection = { connected: boolean; offset: number }

// `.info/*` are client-local and exempt from rules, so unlike every data listener
// these mount at module load rather than under a uid-keyed effect [R4] — the badge
// has to work on the login screen too.
let snapshot: Connection = { connected: false, offset: 0 }
const listeners = new Set<() => void>()

const patch = (next: Partial<Connection>) => {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((notify) => notify())
}

onValue(ref(rtdb, '.info/connected'), (s) => patch({ connected: s.val() === true }))
onValue(ref(rtdb, '.info/serverTimeOffset'), (s) => patch({ offset: s.val() ?? 0 }))

/** `useSyncExternalStore`-shaped: getSnapshot must stay referentially stable [R9,R17]. */
export const connectionStore = {
  subscribe: (notify: () => void) => {
    listeners.add(notify)
    return () => void listeners.delete(notify)
  },
  getSnapshot: () => snapshot,
}
