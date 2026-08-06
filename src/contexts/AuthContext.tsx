import { createContext, useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../services/firebase'
import * as authService from '../services/authService'
import { leavePresence } from '../services/presenceService'
import {
  authReducer,
  initialAuthState,
  startAuthMachine,
  type AuthStatus,
} from '../utils/authMachine'
import type { DemoAccount } from '../utils/demoAccounts'

export type AuthContextValue = {
  status: AuthStatus
  user: User | null
  displayName: string
  getIdToken: () => Promise<string | null>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  logIn: (email: string, password: string) => Promise<void>
  signInAsDemo: (account: DemoAccount) => Promise<void>
  signInWithGoogle: () => Promise<void>
  logOut: () => Promise<void>
}

// oxlint-disable-next-line react/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState)
  const [capturedName, setCapturedName] = useState<string | null>(null)

  useEffect(() => startAuthMachine((onUser) => onAuthStateChanged(auth, onUser), dispatch), [])

  const { user } = state

  const capture = useCallback(async (name: string | null, work: () => Promise<unknown>) => {
    setCapturedName(name)
    try {
      await work()
    } catch (err) {
      setCapturedName(null)
      throw err
    }
  }, [])

  const signUp = useCallback(
    (email: string, password: string, name: string) =>
      capture(name, () => authService.signUp(email, password, name)),
    [capture],
  )

  const logIn = useCallback(
    (email: string, password: string) => capture(null, () => authService.logIn(email, password)),
    [capture],
  )

  const signInAsDemo = useCallback(
    (account: DemoAccount) => capture(account.name, () => authService.signInAsDemo(account)),
    [capture],
  )

  const signInWithGoogle = useCallback(() => {
    const pending = authService.signInWithGoogle()
    setCapturedName(null)
    return pending.then(() => {})
  }, [])

  const logOut = useCallback(
    () => capture(null, () => authService.logOut(leavePresence)),
    [capture],
  )

  const getIdToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user,
      displayName: capturedName || user?.displayName || emailPrefix(user?.email) || 'Anonymous',
      getIdToken,
      signUp,
      logIn,
      signInAsDemo,
      signInWithGoogle,
      logOut,
    }),
    [
      state.status,
      user,
      capturedName,
      getIdToken,
      signUp,
      logIn,
      signInAsDemo,
      signInWithGoogle,
      logOut,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

function emailPrefix(email: string | null | undefined): string {
  return email ? email.split('@')[0] : ''
}
