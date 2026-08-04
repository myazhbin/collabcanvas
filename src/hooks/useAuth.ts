import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '../contexts/AuthContext'

/**
 * The whole auth surface: `status` for the three-state gate [R4], `user` and
 * `displayName` for identity [R11], `getIdToken` for the Phase-2 agent, and the four
 * operations.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuth must be called inside <AuthProvider> — see App.tsx')
  }

  return value
}
