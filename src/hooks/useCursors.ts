import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { startCursorChannel } from '../services/cursorService'
import { useAuth } from './useAuth'
import { useChannel } from './useChannel'
import { useConnection } from './useConnection'
import { userColour } from '../utils/helpers'
import { sessionId } from '../utils/session'
import type { Point } from '../utils/coords'
import type { SessionNode } from '../utils/types'

export type RemoteCursor = {
  sessionId: string
  uid: string
  name: string
  colour: string
  world: Point
}

export type CursorsView = {
  remote: RemoteCursor[]
  latencyMs: number | null
  publish: (world: Point | null) => void
}

const LATENCY_WINDOW_MS = 1000

const LATENCY_SANE_MAX_MS = 10_000

export function useCursors(sessions: Record<string, SessionNode>): CursorsView {
  const { user } = useAuth()
  const uid = user?.uid
  const { offset } = useConnection()
  const channel = useChannel(startCursorChannel, uid)

  const publish = useCallback((world: Point | null) => {
    channel.current?.publish(world)
  }, [channel])

  const remote = useMemo(
    () =>
      Object.entries(sessions).flatMap(([key, node]): RemoteCursor[] => {
        if (key === sessionId) return []

        if (!node || typeof node.uid !== 'string' || node.uid.length === 0) return []

        const cursor = node.cursor
        if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return []

        return [
          {
            sessionId: key,
            uid: node.uid,
            name: node.name || 'Anonymous',
            colour: userColour(node.uid, node.colour),
            world: { x: cursor.x, y: cursor.y },
          },
        ]
      }),
    [sessions],
  )

  const latencyMs = useLatency(sessions, offset)

  return { remote, latencyMs, publish }
}

function useLatency(sessions: Record<string, SessionNode>, offset: number): number | null {
  const samples = useRef<number[]>([])
  const seen = useRef<Record<string, number>>({})
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

  useEffect(() => {
    const now = Date.now() + offset
    const previous = seen.current
    const current: Record<string, number> = {}

    for (const [key, node] of Object.entries(sessions)) {
      if (key === sessionId) continue

      const t = node?.cursor?.t
      if (typeof t !== 'number' || !Number.isFinite(t)) continue
      current[key] = t

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
      if (batch.length === 0) return

      batch.sort((a, b) => a - b)
      setLatencyMs(Math.round(batch[Math.floor(batch.length / 2)]))
    }, LATENCY_WINDOW_MS)

    return () => clearInterval(id)
  }, [])

  return latencyMs
}
