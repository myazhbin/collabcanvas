import { useContext } from 'react'
import { CanvasContext, type CanvasContextValue } from '../contexts/CanvasContext'

export function useCanvas(): CanvasContextValue {
  const value = useContext(CanvasContext)

  if (!value) {
    throw new Error('useCanvas must be called inside <CanvasProvider> — see App.tsx')
  }

  return value
}
