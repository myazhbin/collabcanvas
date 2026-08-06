import type { User } from 'firebase/auth'

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'

export type AuthState = {
  status: AuthStatus
  user: User | null
}

export type AuthEvent = { type: 'authStateChanged'; user: User | null } | { type: 'timeout' }

export const initialAuthState: AuthState = { status: 'loading', user: null }

export const AUTH_TIMEOUT_MS = 4000

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'authStateChanged':
      return event.user
        ? { status: 'signedIn', user: event.user }
        : { status: 'signedOut', user: null }

    case 'timeout':
      return state.status === 'loading' ? { status: 'signedOut', user: null } : state
  }
}

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
