import { useRef } from 'react'

export function useStableValue<T>(value: T, isEquivalent: (a: T, b: T) => boolean): T {
  const held = useRef(value)

  if (held.current !== value && !isEquivalent(held.current, value)) held.current = value

  return held.current
}
