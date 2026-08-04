import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { connectionStore } from '../services/firebase'
import { startCursorChannel, type CursorChannel } from '../services/cursorService'
import { useAuth } from './useAuth'
import { generateUserColor } from '../utils/helpers'
import { sessionId } from '../utils/session'
import type { Point } from '../utils/coords'
import type { SessionNode } from '../utils/types'

export type RemoteCursor = {
  sessionId: string
  uid: string
  name: string
  colour: string
  /** World coords. The overlay converts to screen at render, per viewer [R3]. */
  world: Point
}

export type CursorsView = {
  remote: RemoteCursor[]
  /** Median end-to-end delay over the last sampling window, ms — null until a peer moves. */
  latencyMs: number | null
  publish: (world: Point | null) => void
}

/** How often the median is recomputed and published to React. Deliberately not per
 *  sample: at 20 Hz × N peers that would re-render the HUD faster than anyone can read it. */
const LATENCY_WINDOW_MS = 1000

/** Samples outside this are clock nonsense, not latency — a peer whose `.info/serverTimeOffset`
 *  has not resolved yet can briefly produce either sign. Dropped rather than shown. */
const LATENCY_SANE_MAX_MS = 10_000

/**
 * Reads everyone else's cursor out of the session nodes `usePresence` already listens on,
 * and publishes this tab's.
 *
 * `sessions` is passed in rather than re-listened for: one listener on
 * `/sessions/{canvas}` serves both features, which is the point of cursors and presence
 * sharing a node. The split is in how the two are keyed — presence collapses to one entry
 * per **uid**, cursors render one per **sessionId**, so two tabs of one account are one
 * avatar and two arrows [R2].
 */
export function useCursors(sessions: Record<string, SessionNode>): CursorsView {
  const { user } = useAuth()
  const uid = user?.uid
  const channel = useRef<CursorChannel | null>(null)
  const { offset } = useSyncExternalStore(
    connectionStore.subscribe,
    connectionStore.getSnapshot,
  )

  // Keyed on the uid, never `[]` [R4]. The channel writes to the session node, and a
  // publisher started before auth resolves writes into a path the rules deny.
  useEffect(() => {
    if (!uid) return

    const started = startCursorChannel()
    channel.current = started
    return () => {
      channel.current = null
      started.stop()
    }
  }, [uid])

  // Stable across renders, because Canvas depends on it from an effect keyed on the
  // viewport — an identity that changed every render would republish on every frame.
  const publish = useCallback((world: Point | null) => {
    channel.current?.publish(world)
  }, [])

  const remote = useMemo(
    () =>
      Object.entries(sessions).flatMap(([key, node]): RemoteCursor[] => {
        // One cursor per session, but never this one — the OS already draws that one, and
        // a second arrow trailing your own pointer by a network round trip reads as a bug.
        // Your *other* tabs do get one: that is acceptance item 15.
        if (key === sessionId) return []

        // Same trust boundary as the presence list: a node with no uid cannot be
        // coloured or attributed. Distinct from staleness, which must fail open [R17].
        if (!node || typeof node.uid !== 'string' || node.uid.length === 0) return []

        const cursor = node.cursor
        if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return []

        return [
          {
            sessionId: key,
            uid: node.uid,
            name: node.name || 'Anonymous',
            // Written colour first, local derivation as the fallback — the two agree by
            // construction, and a node caught mid-write can be missing the field.
            colour: node.colour || generateUserColor(node.uid),
            world: { x: cursor.x, y: cursor.y },
          },
        ]
      }),
    // No staleness filter here, on purpose. `onDisconnect().remove()` deletes the whole
    // node — cursor included — and that is the mechanism PR 5 measured working. A second
    // filter on top could only ever *hide* a cursor, and R17's lesson is that a filter
    // which blanks a gate item costs far more than the ghost it prevents.
    [sessions],
  )

  const latencyMs = useLatency(sessions, offset)

  return { remote, latencyMs, publish }
}

/**
 * Real end-to-end delay, measured from the payload timestamp.
 *
 * F5 sets a <50 ms target and warns in the same breath not to record it as met on the
 * strength of the send interval, since 20 Hz contributes up to 50 ms of sampling delay
 * before anything touches the wire. `t` is stamped when the sample was taken and in
 * server time, so this number includes that — it is the figure PR 9 records.
 */
function useLatency(sessions: Record<string, SessionNode>, offset: number): number | null {
  const samples = useRef<number[]>([])
  const seen = useRef<Record<string, number>>({})
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

  useEffect(() => {
    const now = Date.now() + offset
    const previous = seen.current
    // Rebuilt rather than mutated, so a session that has left stops being tracked at all.
    const current: Record<string, number> = {}

    for (const [key, node] of Object.entries(sessions)) {
      if (key === sessionId) continue

      const t = node?.cursor?.t
      if (typeof t !== 'number' || !Number.isFinite(t)) continue
      current[key] = t

      // Only once per distinct payload. A snapshot fires when *anyone* moves, so an
      // unchanged peer would otherwise be re-sampled against a later clock every time,
      // and the median would climb steadily towards fiction.
      if (previous[key] === t) continue

      const delay = now - t
      if (delay < 0 || delay > LATENCY_SANE_MAX_MS) continue
      samples.current.push(delay)
    }

    seen.current = current
  }, [sessions, offset])

  useEffect(() => {
    const id = setInterval(() => {
      const batch = samples.current
      samples.current = []
      // Nothing arrived: hold the last reading rather than blanking it, since "nobody
      // moved" is not a latency measurement.
      if (batch.length === 0) return

      // Median, not mean — one GC pause or one tab wake shouldn't set the number.
      batch.sort((a, b) => a - b)
      setLatencyMs(Math.round(batch[Math.floor(batch.length / 2)]))
    }, LATENCY_WINDOW_MS)

    return () => clearInterval(id)
  }, [])

  return latencyMs
}
