import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { throttle } from './throttle'

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

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('always delivers the final call once the window elapses', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send({ x: 0 })
    vi.advanceTimersByTime(20)
    send({ x: 700 })

    expect(fn).toHaveBeenCalledTimes(1)

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

    send.cancel()
    vi.advanceTimersByTime(500)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith('lead')
  })

  it('arms nothing when no call was suppressed', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send('only')
    vi.advanceTimersByTime(500)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('leads again immediately once a full window has elapsed', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    send('first')
    vi.advanceTimersByTime(50)
    send('second')

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')
  })

  it('holds 20 Hz across a continuous stream, and still ends on the last sample', () => {
    const fn = vi.fn()
    const send = throttle(fn, 50)

    for (let i = 0; i < 100; i++) {
      send(i)
      vi.advanceTimersByTime(10)
    }
    vi.advanceTimersByTime(50)

    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect(fn.mock.calls.length).toBeLessThanOrEqual(21)
    expect(fn).toHaveBeenLastCalledWith(99)
  })
})
