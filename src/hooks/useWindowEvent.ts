import { useEffect, useRef } from 'react'

/**
 * Listen for a window event for as long as the component is mounted.
 *
 * `window` rather than the Konva stage is the point of this: a pointer released outside
 * the canvas — or outside the browser entirely — otherwise never ends the gesture it
 * started, and the canvas keeps following the pointer after you let go. Keys are the same
 * story, since the stage is not focusable.
 *
 * The handler is held in a ref and read at dispatch time, so it can close over whatever it
 * likes without the subscription churning every render — and there is one
 * `addEventListener`/`removeEventListener` pair in the codebase to keep matched instead of
 * seven.
 *
 * `active` is for listeners that should only exist during a gesture: a pan tracks the
 * pointer globally while the button is down, and not one moment longer.
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  active = true,
): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    if (!active) return

    const listener = (event: WindowEventMap[K]) => latest.current(event)
    window.addEventListener(type, listener)
    return () => window.removeEventListener(type, listener)
  }, [type, active])
}
