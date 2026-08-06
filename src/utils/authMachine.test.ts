import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import {
  AUTH_TIMEOUT_MS,
  authReducer,
  initialAuthState,
  startAuthMachine,
  type AuthEvent,
  type AuthState,
} from './authMachine'

const alice = { uid: 'alice', getIdToken: async () => 'id-token' } as unknown as User

function harness(timeoutMs = AUTH_TIMEOUT_MS) {
  let emit: ((user: User | null) => void) | null = null
  let state: AuthState = initialAuthState

  const dispatch = (event: AuthEvent) => {
    state = authReducer(state, event)
  }

  const stop = startAuthMachine(
    (onUser) => {
      emit = onUser
      return () => {
        emit = null
      }
    },
    dispatch,
    timeoutMs,
  )

  return {
    stop,
    emit: (user: User | null) => emit?.(user),
    get state() {
      return state
    },
    get observing() {
      return emit !== null
    },
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('authReducer', () => {
  it('starts loading, never signedOut', () => {
    expect(initialAuthState.status).toBe('loading')
    expect(initialAuthState.user).toBeNull()
  })

  it('maps a user event to signedIn and a null event to signedOut', () => {
    const signedIn = authReducer(initialAuthState, { type: 'authStateChanged', user: alice })
    expect(signedIn.status).toBe('signedIn')
    expect(signedIn.user).toBe(alice)

    const signedOut = authReducer(signedIn, { type: 'authStateChanged', user: null })
    expect(signedOut.status).toBe('signedOut')
    expect(signedOut.user).toBeNull()
  })

  it('ignores a timeout once the observer has answered', () => {
    const signedIn = authReducer(initialAuthState, { type: 'authStateChanged', user: alice })

    expect(authReducer(signedIn, { type: 'timeout' })).toBe(signedIn)
  })
})

describe('startAuthMachine', () => {
  it('resolves to signedIn on a user event, passing the User through by reference', () => {
    const machine = harness()

    machine.emit(alice)

    expect(machine.state.status).toBe('signedIn')
    expect(machine.state.user).toBe(alice)
  })

  it('force-exits loading when no event ever arrives', () => {
    const machine = harness()

    vi.advanceTimersByTime(AUTH_TIMEOUT_MS - 1)
    expect(machine.state.status).toBe('loading')

    vi.advanceTimersByTime(1)

    expect(machine.state.status).toBe('signedOut')
  })

  it('still transitions on an event that arrives after the timeout', () => {
    const machine = harness()

    vi.advanceTimersByTime(AUTH_TIMEOUT_MS)
    expect(machine.state.status).toBe('signedOut')

    machine.emit(alice)
    expect(machine.state.status).toBe('signedIn')

    machine.emit(null)
    expect(machine.state.status).toBe('signedOut')
  })

  it('cancels the timeout once an event arrives', () => {
    const machine = harness()

    machine.emit(alice)
    vi.advanceTimersByTime(AUTH_TIMEOUT_MS * 10)

    expect(machine.state.status).toBe('signedIn')
    expect(machine.state.user).toBe(alice)
  })

  it('teardown unsubscribes and disarms the pending timeout', () => {
    const machine = harness()

    machine.stop()
    expect(machine.observing).toBe(false)

    vi.advanceTimersByTime(AUTH_TIMEOUT_MS * 10)
    expect(machine.state.status).toBe('loading')
  })
})
