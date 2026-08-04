import { THROTTLE_MS } from './constants'

/**
 * Leading-edge timestamp throttle **with a trailing flush**.
 *
 * The trailing half is the entire reason this file exists [R16]. A leading-only
 * coalescer drops every call inside the window — including the last one — so the instant
 * a user stops moving, the position everyone else holds is whichever sample happened to
 * *open* the window, not where the pointer actually came to rest. It presents as a remote
 * cursor parking tens of pixels behind, while every latency number you can measure looks
 * healthy, which is what makes it expensive to diagnose.
 *
 * `requestAnimationFrame` is not an alternative here. It is a *rendering* scheduler: it
 * does not fire at all in a backgrounded tab, and it has no trailing edge either.
 */
export type Throttled<A extends unknown[]> = ((...args: A) => void) & {
  /** Drop the pending trailing call. Teardown must call this, or a write lands after the
   *  thing that owned it is gone — after unmount, or after the tab was hidden. */
  cancel: () => void
  /** Whether a trailing call is currently armed. */
  isPending: () => boolean
}

export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number = THROTTLE_MS,
): Throttled<A> {
  // Far enough in the past that the first call always leads, with no special case for it.
  let lastRun = Number.NEGATIVE_INFINITY
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const run = (args: A) => {
    lastRun = Date.now()
    pending = null
    fn(...args)
  }

  const clearTimer = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const throttled = (...args: A) => {
    const remaining = waitMs - (Date.now() - lastRun)

    if (remaining <= 0) {
      // Anything queued behind this is by definition older, so the leading call replaces
      // it rather than letting both go out.
      clearTimer()
      run(args)
      return
    }

    // Inside the window: keep only the newest args, so when the flush fires it delivers
    // where the pointer ended up rather than some stale intermediate sample.
    pending = args
    if (timer !== null) return

    // Armed only when a call was actually suppressed. An unconditional timer would
    // re-send an unchanged position at the end of every idle window, which is exactly
    // the traffic movement-gating exists to not pay for [R14].
    timer = setTimeout(() => {
      timer = null
      if (pending !== null) run(pending)
    }, remaining)
  }

  return Object.assign(throttled, {
    cancel: () => {
      clearTimer()
      pending = null
    },
    isPending: () => timer !== null,
  })
}
