import { useRef } from 'react'

/**
 * Hold a derived value's **identity** for as long as it stays equivalent to the last one.
 *
 * `sessions` is a brand-new object on every cursor tick — 20 Hz per peer — so everything
 * derived from it is a new object too, even when nothing in it changed. Handed to a
 * memoised child, a new reference every tick defeats the memo completely, and at the
 * 500-object target that is the whole-canvas re-render R7 is about, arriving at cursor
 * rate. Comparing here is O(peers); what it protects is O(shapes).
 *
 * The ref write is a cache, not state: it only ever swaps in a value the comparison has
 * already judged *different*, so a render React throws away can leave behind an equivalent
 * value at worst, and StrictMode's double render is idempotent. That is a different thing
 * from a ref mutated inside a `setState` updater, which this codebase has been bitten by
 * three times — see PR 8's note in TASKS.md.
 */
export function useStableValue<T>(value: T, isEquivalent: (a: T, b: T) => boolean): T {
  const held = useRef(value)

  if (held.current !== value && !isEquivalent(held.current, value)) held.current = value

  return held.current
}
