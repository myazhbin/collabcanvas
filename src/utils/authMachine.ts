import type { User } from 'firebase/auth'

/**
 * The three-state auth gate [R4], kept out of React and out of Firebase's runtime so
 * the one behaviour here you cannot reproduce by hand — the force-exit timer — is
 * assertable in `authMachine.test.ts`.
 *
 * `User` arrives as a type-only import, which erases at compile time. Nothing in this
 * module pulls the SDK in.
 */

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'

export type AuthState = {
  status: AuthStatus
  /** The live Firebase `User`, passed through by reference and never spread — a copy
   *  silently loses `getIdToken`, which is a class method, not an own property [R11]. */
  user: User | null
}

export type AuthEvent = { type: 'authStateChanged'; user: User | null } | { type: 'timeout' }

/**
 * Starts `loading`, never `signedOut`. `onAuthStateChanged` doesn't fire
 * synchronously — the SDK rehydrates from IndexedDB — so a returning user is briefly
 * indistinguishable from a signed-out one. Guessing `signedOut` here is what flashes
 * the login form on every reload [R4].
 */
export const initialAuthState: AuthState = { status: 'loading', user: null }

/**
 * 4s, mid-way through PRD F7's 3–5s band. The floor is the SDK's own rehydration; the
 * ceiling is how long a splash reads as "loading" rather than "broken". Only ever
 * reached when the observer never fires at all — firebase-js-sdk#7888, an IndexedDB
 * `AbortError` in *normal* Safari, which without this white-screens the app forever [R4].
 */
export const AUTH_TIMEOUT_MS = 4000

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'authStateChanged':
      return event.user
        ? { status: 'signedIn', user: event.user }
        : { status: 'signedOut', user: null }

    case 'timeout':
      // Force-exit `loading` and nothing else. A timer that lands after the observer
      // has already answered must not sign a signed-in user back out —
      // `startAuthMachine` clears it first, and this guard makes that ordering
      // irrelevant rather than load-bearing.
      return state.status === 'loading' ? { status: 'signedOut', user: null } : state
  }
}

/**
 * The whole body of `AuthContext`'s effect, with React and Firebase both passed in.
 * It lives here rather than in the context so the timer assertions exercise the code
 * that actually ships — a lookalike harness in the test file is exactly the thing that
 * rots away from the real wiring without failing [R4].
 *
 * Returns the teardown.
 */
export function startAuthMachine(
  observe: (onUser: (user: User | null) => void) => () => void,
  dispatch: (event: AuthEvent) => void,
  timeoutMs: number = AUTH_TIMEOUT_MS,
): () => void {
  const timer = setTimeout(() => dispatch({ type: 'timeout' }), timeoutMs)

  const unobserve = observe((user) => {
    clearTimeout(timer)
    dispatch({ type: 'authStateChanged', user })
  })

  return () => {
    clearTimeout(timer)
    unobserve()
  }
}
