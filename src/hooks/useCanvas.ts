import { useContext } from 'react'
import { CanvasContext, type CanvasContextValue } from '../contexts/CanvasContext'

/**
 * The canvas surface: shapes, the active tool, the selection, and the four mutators.
 *
 * A reader only — the state and, from PR 8, the Firestore `onSnapshot` subscription both
 * live in `CanvasProvider`, exactly as `useAuth` reads an observer owned by
 * `AuthContext` [R7].
 */
export function useCanvas(): CanvasContextValue {
  const value = useContext(CanvasContext)

  if (!value) {
    throw new Error('useCanvas must be called inside <CanvasProvider> — see App.tsx')
  }

  return value
}
