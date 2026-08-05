import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { canvasRef } from '../services/transactionService'
import * as canvasService from '../services/canvasService'
import { startDragChannel, type DragChannel } from '../services/cursorService'
import { PALETTE, SHAPE, WORLD } from '../utils/constants'
import { clampShapeToWorld } from '../utils/placement'
import { shapeDiff } from '../utils/shapeDiff'
import type { Point } from '../utils/coords'
import type { CanvasDoc, Shape } from '../utils/types'

export type Tool = 'select' | 'rectangle'

export type CanvasContextValue = {
  shapes: Shape[]
  tool: Tool
  setTool: (tool: Tool) => void
  selectedId: string | null
  select: (id: string | null) => void
  /** Drop a rectangle centred on a world point. No-op outside the world bounds. */
  placeAt: (world: Point) => void
  deleteShape: (id: string) => void
  beginDrag: (id: string) => void
  moveDrag: (id: string, x: number, y: number) => void
  endDrag: (id: string, x: number, y: number) => void
}

// Ships beside its provider for the same reason `AuthContext` does — see the note there.
// oxlint-disable-next-line react/only-export-components
export const CanvasContext = createContext<CanvasContextValue | null>(null)

/**
 * Shape state, synced through Firestore.
 *
 * The listener lives here rather than in a hook of its own, mirroring `AuthContext`: the
 * provider owns the subscription, `useCanvas` is only a reader. It is keyed on `user?.uid`,
 * never `[]` — mounted at `[]` it attaches during the window before `onAuthStateChanged`
 * resolves, gets denied by the rules, and presents as an empty canvas with one console
 * error on the deployed build only [R4].
 *
 * Every mutation goes through `canvasService`, which means through a transaction. Nothing
 * in this file writes to Firestore directly [R23].
 */
export function CanvasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [shapes, setShapes] = useState<Shape[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /** ids this tab is dragging — echo-suppressed until the commit resolves [R6]. Internal:
   *  the suppression is between this provider and `shapeDiff`, and no view reads it. */
  const [dragging, setDragging] = useState<ReadonlySet<string>>(() => new Set())

  const uid = user?.uid
  const drag = useRef<DragChannel | null>(null)

  /** Read by the snapshot handler, which must not re-subscribe when a drag starts or ends
   *  — resubscribing mid-drag would refetch the document and stutter the shape. */
  const draggingRef = useRef<ReadonlySet<string>>(dragging)
  draggingRef.current = dragging

  /** The previous array the diff runs against. Held in a ref so the snapshot handler can
   *  compute the whole diff in its own callback rather than inside a `setShapes` updater:
   *  React invokes updaters during render — twice under StrictMode — so calling another
   *  setState in there updates one component while rendering another, and the update is
   *  dropped. Same failure class as the ref-flip PR 4 hit, and just as invisible. */
  const shapesRef = useRef<Shape[]>(shapes)
  shapesRef.current = shapes

  // ---- Firestore subscription ------------------------------------------------------
  useEffect(() => {
    if (!uid) return

    const unsubscribe = onSnapshot(
      canvasRef,
      (snap) => {
        const incoming = (snap.data() as CanvasDoc | undefined)?.shapes ?? []

        // The whole array arrives every time — there is no per-shape delta on a single
        // document. `shapeDiff` reuses previous references for anything unchanged so the
        // memoised Rectangles skip re-rendering [R7], and holds back ids being dragged so
        // your own echo cannot fight your pointer [R6].
        const result = shapeDiff(shapesRef.current, incoming, draggingRef.current)

        // Both setStates happen here, in the callback — never inside an updater.
        shapesRef.current = result.shapes
        setShapes(result.shapes)

        // A shape deleted underneath a drag has to leave the set, or its id stays
        // suppressed for the rest of the session.
        if (result.dragging !== draggingRef.current) setDragging(result.dragging)
      },
      (err) => {
        // A denied listen otherwise resolves to nothing at all: no throw, no log, just a
        // permanently empty canvas that looks exactly like "nobody has drawn anything".
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
  }, [uid])

  // ---- In-flight drag channel (RTDB) ------------------------------------------------
  useEffect(() => {
    if (!uid) return

    const channel = startDragChannel()
    drag.current = channel
    return () => {
      drag.current = null
      channel.stop()
    }
  }, [uid])

  /**
   * A tab hidden mid-drag stays connected, so `onDisconnect` never fires and the lock
   * would pin the shape at a frozen in-flight position for everyone else [R16]. The RTDB
   * half is cleared by the drag channel; this is the Firestore half.
   */
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
  }, [uid])

  const select = useCallback((id: string | null) => setSelectedId(id), [])

  const placeAt = useCallback(
    (world: Point) => {
      if (!uid) return
      // The world is bounded, and at low zoom it does not fill the stage — a click in the
      // dead grey beyond the edge would otherwise place a rectangle somewhere the viewport
      // can never travel to.
      if (world.x < 0 || world.y < 0 || world.x > WORLD.width || world.y > WORLD.height) return

      const id = crypto.randomUUID()
      const now = Date.now()

      // Centred on the click — the pointer marks where the rectangle goes, not its corner —
      // then pulled inside the world. A click just inside the edge is legal but centres a
      // 120×80 rectangle half over it, which is the same unreachable-shape bug the drag
      // path has, reached a different way.
      const origin = clampShapeToWorld({
        x: world.x - SHAPE.width / 2,
        y: world.y - SHAPE.height / 2,
        w: SHAPE.width,
        h: SHAPE.height,
      })

      const shape: Shape = {
        id,
        x: origin.x,
        y: origin.y,
        w: SHAPE.width,
        h: SHAPE.height,
        // Cycled off the current length — good enough to keep adjacent shapes distinct
        // without needing a counter synced between clients.
        fill: PALETTE[shapes.length % PALETTE.length],
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
        draggedBy: null,
      }

      void canvasService.createShape(shape)

      // Optimistic selection. The shape itself arrives via the snapshot — no local insert,
      // because two sources of truth for the array is exactly what `shapeDiff` exists to
      // avoid needing.
      setSelectedId(id)
      setTool('select')
    },
    [uid, shapes.length],
  )

  const deleteShape = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : current))
    void canvasService.deleteShape(id)
  }, [])

  // ---- Drag lifecycle ----------------------------------------------------------------
  const beginDrag = useCallback(
    (id: string) => {
      if (!uid) return

      // Suppress the echo from this instant, before the lock round-trips. Waiting for the
      // claim would leave a window where your own committed position can arrive and yank
      // the shape out from under the pointer [R6].
      setDragging((current) => new Set(current).add(id))

      void canvasService.claimShapeLock(id, uid).then((won) => {
        // Lost a contested grab. Stop suppressing at once so the holder's in-flight
        // position renders instead of this tab's dead-end local drag — the commit will
        // refuse too, so nothing this pointer does from here can land [R10].
        if (!won) setDragging((current) => without(current, id))
      })
    },
    [uid],
  )

  const moveDrag = useCallback((id: string, x: number, y: number) => {
    // RTDB only, throttled to 20 Hz. Never Firestore — that is the 17-minutes-to-quota
    // path [R14].
    drag.current?.publish({ id, x, y })
  }, [])

  const endDrag = useCallback(
    (id: string, x: number, y: number) => {
      if (!uid) {
        setDragging((current) => without(current, id))
        return
      }

      // Clamped again here, not only in `Rectangle`. That call site handles the *visual*
      // correction; this one is the invariant — nothing may commit a shape outside the
      // world, whatever called it.
      const shape = shapesRef.current.find((s) => s.id === id)
      if (shape) {
        const inside = clampShapeToWorld({ x, y, w: shape.w, h: shape.h })
        x = inside.x
        y = inside.y
      }

      void (async () => {
        // Commit first, clear the in-flight value second. The other order leaves a gap in
        // which remote clients have no `drag` to render and the old Firestore position is
        // still the newest thing they have seen — so the rectangle visibly snaps backward
        // for a frame before jumping forward again.
        await canvasService.commitShapePosition(id, x, y, uid)
        drag.current?.publish(null)

        // Released only after the transaction resolves, or the echo of your own commit
        // arrives while the id is already unsuppressed and fights the final position [R6].
        setDragging((current) => without(current, id))
      })()
    },
    [uid],
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
    }),
    [shapes, tool, selectedId, select, placeAt, deleteShape, beginDrag, moveDrag, endDrag],
  )

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) return set
  const next = new Set(set)
  next.delete(id)
  return next
}
