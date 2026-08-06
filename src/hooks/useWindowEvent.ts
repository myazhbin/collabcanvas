import { useEffect } from 'react'
import { useLatestRef } from './useLatestRef'

export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  active = true,
): void {
  const latest = useLatestRef(handler)

  useEffect(() => {
    if (!active) return

    const listener = (event: WindowEventMap[K]) => latest.current(event)
    window.addEventListener(type, listener)
    return () => window.removeEventListener(type, listener)
  }, [type, active, latest])
}
