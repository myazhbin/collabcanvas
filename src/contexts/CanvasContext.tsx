import { createContext, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { PALETTE, SHAPE, WORLD } from '../utils/constants'
import type { Point } from '../utils/coords'
import type { Shape } from '../utils/types'

export type Tool = 'select' | 'rectangle'

export type CanvasContextValue = {
  shapes: Shape[]
  tool: Tool
  setTool: (tool: Tool) => void
  selectedId: string | null
  select: (id: string | null) => void
  /** Drop a rectangle centred on a world point. No-op outside the world bounds. */
  placeAt: (world: Point) => void
  /** Commit a shape's new top-left, in world coords. */
  moveShape: (id: string, x: number, y: number) => void
  deleteShape: (id: string) => void
}

// Ships beside its provider for the same reason `AuthContext` does — see the note there.
// oxlint-disable-next-line react/only-export-components
export const CanvasContext = createContext<CanvasContextValue | null>(null)

/**
 * Shape state for the canvas.
 *
 * **PR 7 is local only.** `shapes` lives in React state and goes nowhere; every mutator
 * below is the shape of the call PR 8 replaces with a Firestore transaction, which is why
 * each one already writes `updatedAt` / `updatedBy` and carries a `draggedBy: null` it has
 * no use for yet. Getting the record complete now means PR 8 changes *where* a write goes,
 * not *what* is written.
 *
 * The onSnapshot listener and the dragging Set for echo suppression [R6] land in this
 * provider in PR 8, the same way `AuthContext` owns the auth observer while `useAuth` is
 * only a reader.
 */
export function CanvasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [shapes, setShapes] = useState<Shape[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const uid = user?.uid ?? ''

  const select = useCallback((id: string | null) => setSelectedId(id), [])

  const placeAt = useCallback(
    (world: Point) => {
      // The world is bounded, and at low zoom it does not fill the stage — `clampViewport`
      // centres it and leaves dead grey on two sides. A click out there is a click on
      // nothing, and placing a rectangle beyond the edge would put it somewhere the
      // viewport can never travel to.
      if (world.x < 0 || world.y < 0 || world.x > WORLD.width || world.y > WORLD.height) return

      const id = crypto.randomUUID()

      setShapes((current) => {
        const shape: Shape = {
          id,
          // Centred on the click: the pointer marks where the rectangle goes, not where
          // its corner goes.
          x: world.x - SHAPE.width / 2,
          y: world.y - SHAPE.height / 2,
          w: SHAPE.width,
          h: SHAPE.height,
          fill: PALETTE[current.length % PALETTE.length],
          createdBy: uid,
          updatedAt: Date.now(),
          updatedBy: uid,
          draggedBy: null,
        }
        return [...current, shape]
      })

      // Straight back to Select with the new shape active, so the common sequence —
      // place, nudge it, place another — does not need a trip to the toolbar between
      // every step.
      setSelectedId(id)
      setTool('select')
    },
    [uid],
  )

  const moveShape = useCallback(
    (id: string, x: number, y: number) => {
      setShapes((current) => {
        const index = current.findIndex((shape) => shape.id === id)
        // A shape can vanish mid-drag once PR 8 makes deletes remote. Returning the same
        // array rather than mapping over it keeps that a no-op instead of a crash, and
        // keeps every other shape's reference identity intact [R7].
        if (index === -1) return current

        const next = [...current]
        next[index] = { ...next[index], x, y, updatedAt: Date.now(), updatedBy: uid }
        return next
      })
    },
    [uid],
  )

  const deleteShape = useCallback((id: string) => {
    setShapes((current) => current.filter((shape) => shape.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }, [])

  const value = useMemo(
    () => ({ shapes, tool, setTool, selectedId, select, placeAt, moveShape, deleteShape }),
    [shapes, tool, selectedId, select, placeAt, moveShape, deleteShape],
  )

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
}
