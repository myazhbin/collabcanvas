import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import { WORLD, ZOOM } from '../../utils/constants'
import {
  centreOn,
  clampViewport,
  panBy,
  screenToWorld,
  zoomAtPoint,
  type Point,
  type Size,
  type Viewport,
} from '../../utils/coords'
import { useCursors } from '../../hooks/useCursors'
import { useCanvas } from '../../hooks/useCanvas'
import { useAuth } from '../../hooks/useAuth'
import { useWindowEvent } from '../../hooks/useWindowEvent'
import { shouldPlace } from '../../utils/placement'
import { collectRemoteDrags } from '../../utils/shapeDiff'
import { canDrag, lockHolder } from '../../utils/shapeLocks'
import { generateUserColor } from '../../utils/helpers'
import { sessionId } from '../../utils/session'
import { Cursor } from '../collaboration/Cursor'
import { Backdrop } from './Backdrop'
import { Controls } from './Controls'
import { Hud } from './Hud'
import { Rectangle } from './Rectangle'
import type { SessionNode } from '../../utils/types'

/**
 * The pannable, zoomable stage. The viewport lives in local component state and is
 * **never written to Firebase** — two users looking at different parts of a shared
 * canvas is the point of F1, and syncing the transform would yank the other person's
 * screen out from under them.
 *
 * Deliberately *not* `draggable` on the Stage. Konva fires a click at the end of a
 * drag, so a stage-wide drag-pan means every pan gesture also lands a click on the
 * background — which in PR 7 drops a phantom rectangle wherever you released [R13].
 * Panning is bound to gestures a placement click can never be confused with: hold
 * space, middle-drag, or two-finger scroll.
 */
export function Canvas({ sessions }: { sessions: Record<string, SessionNode> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 })
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)

  const { remote, latencyMs, publish } = useCursors(sessions)
  const { user } = useAuth()
  const { shapes, tool, selectedId, select, placeAt, deleteShape, beginDrag, moveDrag, endDrag } =
    useCanvas()

  const myUid = user?.uid ?? null

  /** Shapes some other session is dragging right now, at their live in-flight position —
   *  PRD §4.3's handoff. Falls back to the committed Firestore value when absent. */
  const remoteDrags = useMemo(() => collectRemoteDrags(sessions, sessionId), [sessions])

  /**
   * uids with a live session. A `draggedBy` lock lives in Firestore, which `onDisconnect`
   * cannot reach — so without this a client that crashes mid-drag leaves a rectangle
   * nobody can ever move again. The session node vanishing is the liveness proof [R10].
   */
  const liveUids = useMemo(
    () =>
      new Set(
        Object.values(sessions)
          .map((node) => node?.uid)
          .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0),
      ),
    [sessions],
  )

  /** Colour of whoever holds each locked shape, for the outline. */
  const lockColours = useMemo(() => {
    const colours = new Map<string, string>()
    for (const shape of shapes) {
      const holder = lockHolder(shape, myUid, liveUids)
      if (holder) colours.set(shape.id, generateUserColor(holder))
    }
    return colours
  }, [shapes, myUid, liveUids])

  /** Where the pan started, in client coords, plus the viewport it started from.
   *  Deltas are taken against this rather than accumulated frame to frame — accumulating
   *  lets a clamped edge eat travel, so the canvas stops tracking the pointer. */
  const panOrigin = useRef<{ pointer: Point; viewport: Viewport } | null>(null)
  const centred = useRef(false)

  /** The pointer's last position in stage pixels, for republishing when the viewport
   *  moves under a stationary pointer. Null whenever the pointer is off the canvas. */
  const pointerScreen = useRef<Point | null>(null)

  /** A left-button press in progress, held until release so the gesture can be judged as
   *  a whole. Null while no primary press is down, and while panning. */
  const gesture = useRef<{ down: Point; downWorld: Point; targetIsStage: boolean } | null>(null)

  // Sized from a ResizeObserver rather than a one-shot `window.innerWidth`: first paint
  // can happen before layout, and a snapshot taken then pins the stage at 0×0 for the
  // life of the page.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Open on the middle of the world — the corner is a bad first impression of a
  // 10,000 px space. Afterwards this only re-clamps, so a window resize can't strand
  // the viewport outside the bounds it was legal in at the old size.
  useEffect(() => {
    if (!size.width || !size.height) return

    // The `centred` flag is flipped out here, never inside the updater below. React
    // invokes updaters more than once — StrictMode does it deliberately to surface
    // exactly this — so a ref mutation in there runs twice, and the second pass reads
    // its own first pass's write and takes the wrong branch. That opened the canvas on
    // the world's top-left corner instead of the middle.
    if (!centred.current) {
      centred.current = true
      setViewport(clampViewport(centreOn({ x: WORLD.width / 2, y: WORLD.height / 2 }, size, 1), size))
      return
    }

    setViewport((vp) => clampViewport(vp, size))
  }, [size])

  // ---- Space: the pan modifier -------------------------------------------------------
  // It must not also scroll the page or re-fire the focused button, so the keydown is
  // guarded on the focus target — otherwise Space stops activating the Sign out button
  // for a keyboard user.
  useWindowEvent('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || isInteractiveTarget(e.target)) return
    e.preventDefault()
    setSpaceHeld(true)
  })
  useWindowEvent('keyup', (e) => {
    if (e.code === 'Space') setSpaceHeld(false)
  })
  // A window that loses focus mid-hold never delivers the keyup, which would leave the
  // canvas stuck in pan mode until you pressed and released space again.
  useWindowEvent('blur', () => setSpaceHeld(false))

  // ---- Pan ---------------------------------------------------------------------------
  // Only while the button is down, and on `window` rather than the stage: releasing
  // outside the canvas — or outside the browser entirely — otherwise never ends the pan,
  // and the canvas keeps following the pointer after you let go.
  useWindowEvent(
    'mousemove',
    (e) => {
      const origin = panOrigin.current
      if (!origin) return

      const next = panBy(origin.viewport, e.clientX - origin.pointer.x, e.clientY - origin.pointer.y)
      setViewport(clampViewport(next, size))
    },
    panning,
  )
  useWindowEvent(
    'mouseup',
    () => {
      panOrigin.current = null
      setPanning(false)
    },
    panning,
  )

  const onMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const middleButton = e.evt.button === 1
      const spaceDrag = spaceHeld && e.evt.button === 0

      if (middleButton || spaceDrag) {
        // Middle-click otherwise pastes on Linux and opens autoscroll on Windows.
        e.evt.preventDefault()
        // Abandon any half-open press: this gesture is a pan and must not also resolve
        // as a click when the button comes up.
        gesture.current = null
        panOrigin.current = { pointer: { x: e.evt.clientX, y: e.evt.clientY }, viewport }
        setPanning(true)
        return
      }

      if (e.evt.button !== 0) return

      // Record, decide later. Whether this is a placement, a selection or a pan is not
      // knowable at press time — only the completed gesture says [R13].
      const stage = e.target.getStage()
      const world = stage?.getRelativePointerPosition()
      if (!stage || !world) return

      gesture.current = {
        down: { x: e.evt.clientX, y: e.evt.clientY },
        downWorld: world,
        // The press target, not the release target. Pressing on a shape is a selection or
        // the start of a drag however it ends.
        targetIsStage: e.target === stage,
      }
    },
    [spaceHeld, viewport],
  )

  // Resolved on `window`, so a release outside the canvas still ends the gesture — and
  // ends it as *nothing*, since the distance test will have failed by then.
  useWindowEvent('mouseup', (e) => {
    const g = gesture.current
    gesture.current = null
    if (!g || e.button !== 0) return

    // One predicate for both branches: it answers "was this a click on empty canvas?",
    // which is the precondition for placing *and* for clearing the selection.
    const wasBackgroundClick = shouldPlace({
      down: g.down,
      up: { x: e.clientX, y: e.clientY },
      targetIsStage: g.targetIsStage,
    })
    if (!wasBackgroundClick) return

    if (tool === 'rectangle') placeAt(g.downWorld)
    else select(null)
  })

  // Delete removes the selection. Guarded on the focus target, or Backspace stops working
  // as backspace the moment a shape is selected and the user clicks into a text field.
  useWindowEvent('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    if (!selectedId || isInteractiveTarget(e.target)) return

    // Backspace is browser-history-back on some setups if it reaches the document.
    e.preventDefault()
    deleteShape(selectedId)
  })

  // World coordinates, from Konva's own inverse of the stage transform [R3]. Screen
  // coordinates would be correct only while both viewports happen to match, and the
  // error grows with pan distance and scales with zoom — so it is exactly zero between
  // two developers on localhost and obvious the moment a grader scrolls.
  const onMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage()
      const screen = stage?.getPointerPosition()
      const world = stage?.getRelativePointerPosition()
      if (!screen || !world) return

      pointerScreen.current = screen
      publish(world)
    },
    [publish],
  )

  const onMouseLeave = useCallback(() => {
    pointerScreen.current = null
    publish(null)
  }, [publish])

  // A wheel-zoom or a scroll-pan moves the world *under* a stationary pointer without
  // producing a single mousemove, so without this the position everyone else holds stays
  // pinned to the pre-zoom world point until you jiggle the mouse — your arrow visibly
  // detaches from where you actually are. `screenToWorld` is the same transform Konva
  // inverts above: a stage whose only transform is the viewport reduces to exactly it,
  // and `coords.test.ts` pins the round trip.
  useEffect(() => {
    const screen = pointerScreen.current
    if (screen) publish(screenToWorld(screen, viewport))
  }, [viewport, publish])

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      // The page would otherwise scroll, and a pinch would zoom the whole browser.
      e.evt.preventDefault()

      if (wheelIntent(e.evt) === 'pan') {
        setViewport((vp) => clampViewport(panBy(vp, -e.evt.deltaX, -e.evt.deltaY), size))
        return
      }

      const pointer = e.target.getStage()?.getPointerPosition()
      if (!pointer) return

      // Pinch deltas are small and continuous, so the factor tracks the gesture; a wheel
      // notch is a discrete detent, so it gets a fixed step.
      const factor = e.evt.ctrlKey
        ? Math.exp(-e.evt.deltaY * ZOOM.pinchSensitivity)
        : e.evt.deltaY > 0
          ? 1 / ZOOM.step
          : ZOOM.step

      setViewport((vp) => clampViewport(zoomAtPoint(vp, pointer, factor), size))
    },
    [size],
  )

  return (
    <div
      ref={containerRef}
      // `mouseleave` on the container rather than on the Stage: it is plain DOM, it fires
      // whether or not the pointer was over a Konva node on the way out, and leaving the
      // canvas has to clear the cursor or you stay parked at the edge for everyone else.
      onMouseLeave={onMouseLeave}
      className="relative min-h-0 flex-1 overflow-hidden bg-neutral-200"
      style={{
        cursor: panning
          ? 'grabbing'
          : spaceHeld
            ? 'grab'
            : // A crosshair is the only feedback that Rectangle mode is armed once the
              // pointer is over the canvas and the toolbar is out of the corner of the eye.
              tool === 'rectangle'
              ? 'crosshair'
              : 'default',
      }}
    >
      <Stage
        width={size.width}
        height={size.height}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={viewport.x}
        y={viewport.y}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        {/* `listening={false}` keeps 10,000 px of grid out of the hit graph, so PR 7's
            placement guard still sees the Stage as the event target [R13]. */}
        <Layer listening={false}>
          <Backdrop viewport={viewport} size={size} />
        </Layer>

        {/* Shapes get their own Layer — their own canvas — so a cursor or backdrop tick
            can never repaint 500 rectangles [R7].

            `listening` goes off while space is held: otherwise a space-drag that happens
            to start over a rectangle both pans the stage and drags the shape, because
            Konva sees a press on a draggable node and the Stage sees the pan modifier.
            Switching the whole layer off is one prop and leaves nothing to disagree. */}
        <Layer listening={!spaceHeld}>
          {shapes.map((shape) => (
            <Rectangle
              key={shape.id}
              shape={shape}
              selected={shape.id === selectedId}
              // Three conditions. Select mode, because in Rectangle mode a press on a shape
              // must stay a press on a shape [R13]; and the soft lock, so a shape another
              // live user is holding cannot be grabbed out from under them [R10].
              draggable={tool === 'select' && canDrag(shape, myUid, liveUids)}
              lockColour={lockColours.get(shape.id) ?? null}
              remote={remoteDrags.get(shape.id) ?? null}
              scale={viewport.scale}
              onSelect={select}
              onDragStart={beginDrag}
              onDragMove={moveDrag}
              onDragEnd={endDrag}
            />
          ))}
        </Layer>
      </Stage>

      {/* The cursor overlay: absolutely-positioned DOM *above* the stage, never Konva
          nodes, so cursor ticks stay off the shape render path and the arrows don't grow
          with zoom [R3,R21]. The layer carries this viewer's pan; each cursor carries the
          scale. Clipped by the container's `overflow-hidden`, so a peer 10,000 px away
          costs one off-screen div and no layout. */}
      <div
        className="cc-cursor-layer"
        style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0)` }}
      >
        {remote.map((cursor) => (
          <Cursor key={cursor.sessionId} cursor={cursor} scale={viewport.scale} />
        ))}
      </div>

      <Controls />

      <Hud viewport={viewport} spaceHeld={spaceHeld} latencyMs={latencyMs} />
    </div>
  )
}

/**
 * A trackpad two-finger scroll and a mouse wheel arrive as the same event, and nothing
 * in the platform distinguishes them — but F1 wants the first to pan and the second to
 * zoom. The usable signals, in order of how much they can be trusted:
 *
 * - `ctrlKey` is set by the browser for a **pinch**, on every OS. Unambiguous.
 * - `deltaMode` other than pixel means line- or page-based scrolling, which only a real
 *   wheel produces (Firefox reports notches this way).
 * - A non-zero `deltaX` means two axes of travel, which a vertical wheel cannot make.
 * - Otherwise: wheels emit chunky quantised notches (100 or 120 px), trackpads emit
 *   small continuous deltas.
 *
 * The last clause is the guess, and a hard flick on a trackpad can beat it. Nothing is
 * unreachable when it guesses wrong: space-drag and middle-drag always pan, and
 * ctrl+wheel always zooms.
 */
function wheelIntent(e: WheelEvent): 'zoom' | 'pan' {
  if (e.ctrlKey || e.metaKey) return 'zoom'
  if (e.deltaMode !== 0) return 'zoom'
  if (e.deltaX !== 0) return 'pan'
  return Math.abs(e.deltaY) >= 100 && Number.isInteger(e.deltaY) ? 'zoom' : 'pan'
}

/** Whether a key event belongs to something that already means something else — a form
 *  field, a link, a button. Space and Backspace are both bound here and both are load
 *  bearing elsewhere on the page. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName)
  )
}
