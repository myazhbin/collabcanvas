import { THROTTLE_MS } from './constants'

export type Throttled<A extends unknown[]> = ((...args: A) => void) & {
  cancel: () => void
}

export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number = THROTTLE_MS,
): Throttled<A> {
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
      clearTimer()
      run(args)
      return
    }

    pending = args
    if (timer !== null) return

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
  })
}
