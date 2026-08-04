import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { throttle } from './throttle'

/**
 * Tier 1 · PR 6 — R16.
 *
 * The bug this file exists to prevent is close to untestable by hand: it needs two
 * browsers, and when you find it, it looks like generic network lag rather than a
 * missing trailing edge. The symptom is a remote cursor parking a few pixels behind
 * wherever the pointer actually stopped, every single time it stops.
 *
 * `vi.useFakeTimers()` fakes `Date` alongside `setTimeout`, so the timestamp half of the
 * throttle advances in lockstep with the timer half — which is the only reason a
 * timestamp throttle can be tested deterministically at all.
 */
describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires the leading call immediately and suppresses the rest of the window', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith('a')

    vi.advanceTimersByTime(10)
    send('b')
    vi.advanceTimersByTime(10)
    send('c')

    // 20 ms into a 50 ms window: still just the leading call.
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('always delivers the final call once the window elapses', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send({ x: 0 })
    vi.advanceTimersByTime(20)
    send({ x: 700 }) // suppressed — and this is where the pointer stopped

    expect(fn).toHaveBeenCalledTimes(1)

    // Nothing else happens: no further pointer events, no rAF tick, nothing to
    // piggyback on. The flush has to be self-starting, or {x: 700} is simply lost and
    // every other browser leaves that cursor sitting at 0 [R16].
    vi.advanceTimersByTime(30)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith({ x: 700 })
  })

  it('flushes the newest value, not the first one it suppressed', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send('lead')
    vi.advanceTimersByTime(5)
    send('stale')
    vi.advanceTimersByTime(5)
    send('staler')
    vi.advanceTimersByTime(5)
    send('final')

    vi.advanceTimersByTime(50)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('final')
  })

  it('cancel drops the pending trailing call', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send('lead')
    send('pending')
    expect(send.isPending()).toBe(true)

    // Unmount, or the tab being hidden. Either way a write must not land afterwards —
    // on hide it would resurrect the cursor the visibilitychange handler just cleared.
    send.cancel()
    vi.advanceTimersByTime(500)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(send.isPending()).toBe(false)
  })

  it('arms nothing when no call was suppressed', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send('only')
    expect(send.isPending()).toBe(false)

    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('leads again immediately once a full window has elapsed', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send('first')
    vi.advanceTimersByTime(50)
    send('second')

    // Immediately, not on a timer. Delaying this one by a whole window would put every
    // sample of a steadily-moving pointer 50 ms late on the wire, on top of the wire.
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')
  })

  it('holds 20 Hz across a continuous stream, and still ends on the last sample', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    // 100 Hz of pointer samples for one second — roughly what a real mousemove stream
    // off a decent mouse looks like.
    for (let i = 0; i < 100; i++) {
      send(i)
      vi.advanceTimersByTime(10)
    }
    vi.advanceTimersByTime(50)

    // The upper bound is the one that matters: 20 Hz is the send rate PRD §4.5's
    // monthly RTDB bandwidth projection is priced against, and there is no billing
    // valve behind it [R14].
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect(fn.mock.calls.length).toBeLessThanOrEqual(21)
    expect(fn).toHaveBeenLastCalledWith(99)
  })
})
