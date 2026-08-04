import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  initializeAuth,
} from 'firebase/auth'
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

/**
 * **Auth is scoped to the tab, not the origin.** This overrides PR 3's "never touch
 * persistence" rule deliberately, and the reason is worth stating precisely because the
 * symptom looks like a presence bug and is not one.
 *
 * The default (`indexedDBLocalPersistence`) stores one session per *origin*, and the SDK
 * actively syncs auth state between tabs. So signing into a second account in a second tab
 * replaces the single shared session and pushes that change into the first tab, whose
 * `onAuthStateChanged` fires with the new user. Both tabs become the same person. Presence
 * then reports exactly that — `dedupeByUid` collapses the two session nodes to one avatar,
 * which reads as "the other user vanished" when it is really "there is only one user now".
 *
 * `browserSessionPersistence` is sessionStorage, which is per-tab by definition, so two
 * tabs hold two independent accounts. The cost is real and accepted: a *new* tab starts
 * signed out, and closing the tab or quitting the browser ends that session. A reload in
 * the same tab still stays signed in, so R4's neutral-splash reasoning is untouched.
 *
 * Note what this is *not*: it is not the localStorage downgrade PR 3 warned against.
 * It also takes auth off IndexedDB entirely, which is where `firebase-js-sdk` #7888's
 * Safari `AbortError` lives — the bug the auth timeout exists to survive [R4].
 *
 * `initializeAuth` rather than `setPersistence`, because the latter is async and races
 * every sign-in that beats it. `browserPopupRedirectResolver` is **not optional** here:
 * `initializeAuth` installs no resolver by default, and without it `signInWithPopup`
 * throws `auth/argument-error` — Google sign-in, gate items 4/5/6, and R8 all with it.
 */
export const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
})

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
