import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { useChannel } from '../hooks/useChannel'
import { useLatestRef } from '../hooks/useLatestRef'
import { canvasRef } from '../services/transactionService'
import * as canvasService from '../services/canvasService'
import { startDragChannel } from '../services/cursorService'
import { SHAPE, WORLD } from '../utils/constants'
import { clampShapeToWorld } from '../utils/placement'
import { shapeDiff } from '../utils/shapeDiff'
import { buildSeed, buildStarter, makeShape, MAX_SHAPES } from '../utils/shapeOps'
import type { Point } from '../utils/coords'
import type { CanvasDoc, Shape } from '../utils/types'

export type Tool = 'select' | 'rectangle'

export type CanvasContextValue = {
  shapes: Shape[]
  tool: Tool
  setTool: (tool: Tool) => void
  selectedId: string | null
  select: (id: string | null) => void
  placeAt: (world: Point) => void
  deleteShape: (id: string) => void
  beginDrag: (id: string) => void
  moveDrag: (id: string, x: number, y: number) => void
  endDrag: (id: string, x: number, y: number) => Promise<{ x: number; y: number } | null>
  seed: (count: number) => void
  clearAll: () => void
  showHint: boolean
}

// oxlint-disable-next-line react/only-export-components
export const CanvasContext = createContext<CanvasContextValue | null>(null)

export function CanvasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [shapes, setShapes] = useState<Shape[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [showHint, setShowHint] = useState(hintUnseen)

  const [dragging, setDragging] = useState<ReadonlySet<string>>(() => new Set())

  const uid = user?.uid

  const starterAttempted = useRef(false)

  const draggingRef = useLatestRef(dragging)

  const shapesRef = useLatestRef(shapes)

  useEffect(() => {
    if (!uid) return

    const unsubscribe = onSnapshot(
      canvasRef,
      (snap) => {
        const doc = snap.data() as CanvasDoc | undefined
        const incoming = doc?.shapes ?? []

        if (doc?.seeded !== true && !starterAttempted.current) {
          starterAttempted.current = true
          void canvasService.ensureStarterShapes(
            buildStarter({ uid, now: Date.now(), idPrefix: `starter-${crypto.randomUUID()}` }),
          )
        }

        const result = shapeDiff(shapesRef.current, incoming, draggingRef.current)

        shapesRef.current = result.shapes
        setShapes(result.shapes)

        if (result.dragging !== draggingRef.current) setDragging(result.dragging)
      },
      (err) => {
        console.error(
          'canvas listen failed — check the DEPLOYED firestore rules against firestore.rules [R5]',
          err,
        )
      },
    )

    return () => {
      unsubscribe()
      setShapes([])
    }
  }, [uid, shapesRef, draggingRef])

  const drag = useChannel(startDragChannel, uid)

  useEffect(() => {
    if (!uid) return

    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      if (draggingRef.current.size === 0) return

      setDragging(new Set())
      void canvasService.releaseMyLocks(uid)
    }

    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [uid, draggingRef])

  const select = useCallback((id: string | null) => setSelectedId(id), [])

  const placeAt = useCallback(
    (world: Point) => {
      if (!uid) return
      if (world.x < 0 || world.y < 0 || world.x > WORLD.width || world.y > WORLD.height) return

      const id = crypto.randomUUID()
      const now = Date.now()

      const origin = clampShapeToWorld({
        x: world.x - SHAPE.width / 2,
        y: world.y - SHAPE.height / 2,
        w: SHAPE.width,
        h: SHAPE.height,
      })

      const shape = makeShape({
        id,
        x: origin.x,
        y: origin.y,
        colourIndex: shapes.length,
        uid,
        now,
      })

      void canvasService.createShape(shape)

      setShowHint(false)
      rememberHintSeen()

      setSelectedId(id)
      setTool('select')
    },
    [uid, shapes.length],
  )

  const deleteShape = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : current))
    void canvasService.deleteShape(id)
  }, [])

  const seed = useCallback(
    (count: number) => {
      if (!uid) return

      const room = MAX_SHAPES - shapes.length
      if (room <= 0) {
        console.warn(
          `canvas is at its ${MAX_SHAPES}-shape ceiling — clear some before seeding more [R24]`,
        )
        return
      }

      void canvasService.seedShapes(
        buildSeed(Math.min(count, room), {
          uid,
          now: Date.now(),
          idPrefix: crypto.randomUUID(),
          existing: shapes.length,
        }),
      )
    },
    [uid, shapes.length],
  )

  const clearAll = useCallback(() => {
    setSelectedId(null)
    void canvasService.clearShapes()
  }, [])

  const beginDrag = useCallback(
    (id: string) => {
      if (!uid) return

      setDragging((current) => new Set(current).add(id))

      void canvasService.claimShapeLock(id, uid).then((won) => {
        if (!won) setDragging((current) => without(current, id))
      })
    },
    [uid],
  )

  const moveDrag = useCallback((id: string, x: number, y: number) => {
    drag.current?.publish({ id, x, y })
  }, [drag])

  const endDrag = useCallback(
    async (id: string, x: number, y: number) => {
      if (!uid) {
        setDragging((current) => without(current, id))
        return null
      }

      const shape = shapesRef.current.find((s) => s.id === id)
      if (shape) {
        const inside = clampShapeToWorld({ x, y, w: shape.w, h: shape.h })
        x = inside.x
        y = inside.y
      }

      const result = await canvasService.commitShapePosition(id, x, y, uid)

      let snapBackTo: { x: number; y: number } | null = null

      if (!result.ok) {
        console.error(
          `move of ${id} was not saved — releasing the lock and snapping the shape back [R10]`,
        )
        await canvasService.releaseMyLocks(uid)

        const committed = shapesRef.current.find((s) => s.id === id)
        if (committed) snapBackTo = { x: committed.x, y: committed.y }
      }

      drag.current?.publish(null)

      setDragging((current) => without(current, id))

      return snapBackTo
    },
    [uid, shapesRef, drag],
  )

  const value = useMemo(
    () => ({
      shapes,
      tool,
      setTool,
      selectedId,
      select,
      placeAt,
      deleteShape,
      beginDrag,
      moveDrag,
      endDrag,
      seed,
      clearAll,
      showHint,
    }),
    [
      shapes,
      tool,
      selectedId,
      select,
      placeAt,
      deleteShape,
      beginDrag,
      moveDrag,
      endDrag,
      seed,
      clearAll,
      showHint,
    ],
  )

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) return set
  const next = new Set(set)
  next.delete(id)
  return next
}

const HINT_SEEN_KEY = 'collabcanvas:placed'

function hintUnseen(): boolean {
  try {
    return localStorage.getItem(HINT_SEEN_KEY) === null
  } catch {
    return true
  }
}

function rememberHintSeen(): void {
  try {
    localStorage.setItem(HINT_SEEN_KEY, '1')
  } catch {}
}
