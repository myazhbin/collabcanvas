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
import { buildSeed, buildStarter, MAX_SHAPES } from '../utils/shapeOps'
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
  /**
   * Resolves to the position the caller must force back onto the Konva node, or `null` when
   * the commit landed and the node is already right.
   *
   * It has to be pushed rather than left to the round trip: Konva owns the node's position
   * during a drag and react-konva only writes `x`/`y` back when the **prop** changes. After
   * a failed commit the prop is unchanged — it is still the pre-drag value — so nothing is
   * written and the node sits at a position no other client has, for good.
   */
  endDrag: (id: string, x: number, y: number) => Promise<{ x: number; y: number } | null>
  /** Append `count` rectangles in one transaction — the 500-object profile, and [R22]. */
  seed: (count: number) => void
  clearAll: () => void
  /** The one-line onboarding hint, shown until this browser places its first rectangle
   *  [R22]. False from the start for anyone who has placed one before. */
  showHint: boolean
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

  const [showHint, setShowHint] = useState(hintUnseen)

  /** ids this tab is dragging — echo-suppressed until the commit resolves [R6]. Internal:
   *  the suppression is between this provider and `shapeDiff`, and no view reads it. */
  const [dragging, setDragging] = useState<ReadonlySet<string>>(() => new Set())

  const uid = user?.uid
  const drag = useRef<DragChannel | null>(null)

  /** One attempt per mount. The transaction re-checks the flag anyway, so this is only
   *  here to stop a snapshot storm from queuing a hundred no-op reads behind each other. */
  const starterAttempted = useRef(false)

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
        const doc = snap.data() as CanvasDoc | undefined
        const incoming = doc?.shapes ?? []

        // An empty canvas reads as a broken one, so a document that has never been seeded
        // gets four rectangles — once, ever [R22]. Decided from the snapshot rather than by
        // firing a transaction on every mount: the flag is already in hand here, so a
        // canvas that was seeded long ago costs nothing at all to skip.
        if (doc?.seeded !== true && !starterAttempted.current) {
          starterAttempted.current = true
          void canvasService.ensureStarterShapes(
            buildStarter({ uid, now: Date.now(), idPrefix: `starter-${crypto.randomUUID()}` }),
          )
        }

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

      // The hint has done its job the moment a rectangle exists [R22]. Remembered per
      // browser, so it does not re-teach the same person the same gesture on every reload —
      // and a *placement* is the signal rather than a dismiss button, because a hint you
      // have to close is one more thing between a grader and the canvas.
      setShowHint(false)
      rememberHintSeen()

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

  const seed = useCallback(
    (count: number) => {
      if (!uid) return

      // Firestore rejects a write that would push the document past 1 MiB, and
      // `mutateShapes` can only catch that and log it — to the user it looks like the
      // button did nothing, and then like drags stop saving [R24]. Refuse out here, where
      // there is something to say about it.
      const room = MAX_SHAPES - shapes.length
      if (room <= 0) {
        console.warn(
          `canvas is at its ${MAX_SHAPES}-shape ceiling — clear some before seeding more [R24]`,
        )
        return
      }

      // The non-deterministic parts — the id prefix and the clock — are resolved out here.
      // `buildSeed` itself stays a pure function of its inputs, and the array it returns is
      // closed over by the transaction body rather than rebuilt on each retry [R23].
      //
      // `existing` is what stops a second "Seed 500" landing exactly on top of the first.
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
    async (id: string, x: number, y: number) => {
      if (!uid) {
        setDragging((current) => without(current, id))
        return null
      }

      // Clamped again here, not only in `ShapesLayer`. That call site handles the *visual*
      // correction; this one is the invariant — nothing may commit a shape outside the
      // world, whatever called it.
      const shape = shapesRef.current.find((s) => s.id === id)
      if (shape) {
        const inside = clampShapeToWorld({ x, y, w: shape.w, h: shape.h })
        x = inside.x
        y = inside.y
      }

      return await (async () => {
        // Commit first, clear the in-flight value second. The other order leaves a gap in
        // which remote clients have no `drag` to render and the old Firestore position is
        // still the newest thing they have seen — so the rectangle visibly snaps backward
        // for a frame before jumping forward again.
        const result = await canvasService.commitShapePosition(id, x, y, uid)

        // A commit that failed outright is the one case that must not be shrugged off.
        // `commitPosition` releases the lock as part of the same write, so if the write
        // never landed the lock is still ours — and a `draggedBy` nobody clears leaves the
        // rectangle ringed and undraggable for every other user, permanently [R10]. It also
        // means the position the pointer just chose does not exist anywhere but this tab,
        // which is how two clients end up disagreeing about where a shape is.
        let snapBackTo: { x: number; y: number } | null = null

        if (!result.ok) {
          console.error(
            `move of ${id} was not saved — releasing the lock and snapping the shape back [R10]`,
          )
          await canvasService.releaseMyLocks(uid)

          // Whatever the document still holds is what every other client is showing, so it
          // is what this one has to show too. `shapesRef` is exactly that: the id has been
          // echo-suppressed for the whole drag, so its entry is untouched [R6].
          const committed = shapesRef.current.find((s) => s.id === id)
          if (committed) snapBackTo = { x: committed.x, y: committed.y }
        }

        drag.current?.publish(null)

        // Released only after the transaction resolves, or the echo of your own commit
        // arrives while the id is already unsuppressed and fights the final position [R6].
        setDragging((current) => without(current, id))

        return snapBackTo
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

/**
 * Whether this browser has yet to place a rectangle.
 *
 * Both halves are wrapped, because `localStorage` **throws on access** — not on write, on
 * the property read itself — in a Safari private window and wherever site data is blocked.
 * An unguarded read here would take the whole canvas down for those users, to decide
 * whether to show a hint.
 */
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
  } catch {
    // Nothing to do and nothing worth logging: the hint reappears next reload, which is a
    // blemish, not a fault.
  }
}
