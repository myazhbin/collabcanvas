import { describe, expect, it } from 'vitest'
import { PRESENCE } from './constants'
import { dedupeByUid, isStale, type PresenceNode } from './presenceUtils'

const node = (over: Partial<PresenceNode> = {}): PresenceNode => ({
  sessionId: 'sess-a',
  uid: 'u1',
  name: 'Ada',
  colour: '#2563eb',
  cursor: null,
  drag: null,
  lastSeen: 1_700_000_000_000,
  ...over,
})

describe('dedupeByUid', () => {
  it('collapses two tabs of one account into ONE presence entry', () => {
    const tabs = [
      node({ sessionId: 'tab-a', uid: 'u1', lastSeen: 1_700_000_000_000 }),
      node({ sessionId: 'tab-b', uid: 'u1', lastSeen: 1_700_000_005_000 }),
    ]

    const online = dedupeByUid(tabs)

    expect(online).toHaveLength(1)
    expect(online[0].uid).toBe('u1')
    expect(online[0].sessionId).toBe('tab-b')
    expect(tabs).toHaveLength(2)
  })

  it('preserves distinct uids and is order-independent', () => {
    const nodes = [
      node({ sessionId: 's1', uid: 'u3' }),
      node({ sessionId: 's2', uid: 'u1' }),
      node({ sessionId: 's3', uid: 'u2' }),
    ]

    const forward = dedupeByUid(nodes).map((n) => n.uid)
    const reversed = dedupeByUid([...nodes].reverse()).map((n) => n.uid)

    expect(forward).toEqual(['u1', 'u2', 'u3'])
    expect(reversed).toEqual(forward)
  })

  it('picks the same winner regardless of order when heartbeats tie', () => {
    const tie = [
      node({ sessionId: 'tab-a', uid: 'u1', lastSeen: 42 }),
      node({ sessionId: 'tab-b', uid: 'u1', lastSeen: 42 }),
    ]

    expect(dedupeByUid(tie)[0].sessionId).toBe('tab-b')
    expect(dedupeByUid([...tie].reverse())[0].sessionId).toBe('tab-b')
  })

  it('returns nothing for no nodes, rather than throwing', () => {
    expect(dedupeByUid([])).toEqual([])
  })
})

describe('isStale', () => {
  const now = 1_700_000_000_000

  it('fails OPEN on a lastSeen it cannot read', () => {
    const unreadable = [undefined, null, { '.sv': 'timestamp' }, NaN, '1700000000000', {}]

    for (const value of unreadable) {
      expect(isStale(value, now, 0)).toBe(false)
    }
  })

  it('does not mark a fresh peer stale when the viewer clock runs fast', () => {
    const skew = 2 * 60 * 1000
    const clientNow = now + skew
    const offset = -skew
    const freshFromServer = now - 1_000

    expect(isStale(freshFromServer, clientNow, offset)).toBe(false)

    expect(isStale(freshFromServer, clientNow, 0)).toBe(true)
  })

  it('marks a genuinely old heartbeat stale', () => {
    expect(isStale(now - (PRESENCE.staleAfterMs + 15_000), now, 0)).toBe(true)
  })

  it('tolerates a couple of missed heartbeats before giving up', () => {
    expect(isStale(now - PRESENCE.heartbeatMs * 2, now, 0)).toBe(false)
    expect(PRESENCE.staleAfterMs).toBeGreaterThan(PRESENCE.heartbeatMs * 2)
  })
})
