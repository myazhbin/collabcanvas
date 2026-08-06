import { memo } from 'react'
import { Layer } from 'react-konva'
import type Konva from 'konva'
import { Rectangle, type Outline } from './Rectangle'
import { clampShapeToWorld } from '../../utils/placement'
import { generateUserColor } from '../../utils/helpers'
import { lockHolder } from '../../utils/shapeLocks'
import type { Shape } from '../../utils/types'

/**
 * The two rings, in **screen** pixels — `Rectangle` draws them with `strokeScaleEnabled`
 * off, so they stay this wide at every zoom level and no scale is needed here.
 *
 * The selection ring is a module constant, identity included: it is the same object on
 * every render, so a shape keeping its selection is not re-rendered for it. The lock ring
 * carries the holder's own colour, so the answer to "who has this?" is the same colour as
 * their cursor and their avatar.
 */
const SELECTED_OUTLINE: Outline = { colour: '#111827', width: 2 }
const LOCK_RING = { width: 3, dash: [6, 4] }

type ShapesLayerProps = {
  shapes: Shape[]
  selectedId: string | null
  myUid: string | null
  /** uids with a live session, for the stale-lock check [R10]. */
  liveUids: ReadonlySet<string>
  /** Shape id → live in-flight position, for shapes some *other* session is dragging. */
  remoteDrags: ReadonlyMap<string, { x: number; y: number }>
  /** False in Rectangle mode, where a press on a shape must stay a press on a shape [R13]. */
  dragEnabled: boolean
  /** Off while space is held: otherwise a space-drag starting over a rectangle both pans
   *  the stage and drags the shape, because Konva sees a press on a draggable node while
   *  the Stage sees the pan modifier. One prop, and nothing is left to disagree. */
  listening: boolean
  onSelect: (id: string) => void
  onDragStart: (id: string) => void
  onDragMove: (id: string, x: number, y: number) => void
  /** Resolves to a position to force back onto the node when the commit did not land. */
  onDragEnd: (id: string, x: number, y: number) => Promise<{ x: number; y: number } | null>
}

/**
 * The shapes, on a Layer of their own — its own canvas, so a cursor tick or a backdrop
 * redraw can never repaint 500 rectangles [R7].
 *
 * **Memoised as a whole**, which is the half of R7 that the per-shape memo cannot reach.
 * `sessions` is a fresh object at 20 Hz per peer, and re-rendering the parent for it rebuilt
 * five hundred React elements and ran five hundred prop comparisons every tick — all to
 * conclude that nothing had changed. The parent stabilises the two `sessions`-derived props
 * (see `useStableValue`), so a tick that moves only a cursor now stops at this boundary and
 * the subtree is never entered.
 *
 * **Nothing here depends on the viewport.** Not the pan, and — because the rings are drawn
 * with `strokeScaleEnabled` off — not the zoom either. That is deliberate and it is the
 * single largest win in this file: at 508 shapes a `scale` prop cost ~50 ms of React
 * reconciliation on every tick of a pinch, which is three frames' budget spent deciding
 * that nothing changed.
 *
 * **Events are delegated to this Layer.** Konva bubbles `mousedown` and the three drag
 * events from a shape up through its layer, so one listener per event does the work of five
 * hundred and each `Rectangle` carries no closures at all — 2,000 fewer allocations per
 * render of this component. `id` on the node is what maps an event back to a shape.
 */
function ShapesLayerInner({
  shapes,
  selectedId,
  myUid,
  liveUids,
  remoteDrags,
  dragEnabled,
  listening,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: ShapesLayerProps) {
  // Not wrapped in `useCallback`: these are bound to one Konva node, and this component
  // only re-renders when something about the shapes actually changed.
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const id = e.target.id()
    if (id) onSelect(id)
  }

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Without this the event carries on up to the Stage, which is listening for the start
    // of a pan — so dragging a rectangle drags the whole canvas underneath it at the same
    // time, and the shape appears welded to the viewport [R13].
    e.cancelBubble = true

    const id = e.target.id()
    if (!id) return
    onSelect(id)
    onDragStart(id)
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const id = e.target.id()
    // Streams to RTDB at 20 Hz, never to Firestore [R14].
    if (id) onDragMove(id, e.target.x(), e.target.y())
  }

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const id = e.target.id()
    if (!id) return

    // Pull the shape back inside the world before it is committed. Beyond the edge it sits
    // at a coordinate `clampViewport` will not let the viewport reach, so it renders
    // nowhere and can never be selected, moved or deleted again. Measurements come off the
    // node rather than a lookup — it is the thing that actually moved.
    const clamped = clampShapeToWorld({
      x: e.target.x(),
      y: e.target.y(),
      w: e.target.width(),
      h: e.target.height(),
    })

    // Moved here explicitly rather than left to the round trip. Konva owns this node's
    // position during a drag, and react-konva only writes `x`/`y` back when the *prop*
    // changes — so a shape dragged out and clamped to where it already started keeps an
    // unchanged prop, no update is pushed, and the node stays sitting out of bounds even
    // though the committed value is correct.
    const node = e.target
    node.position(clamped)

    // Same reasoning, one step further out: if the commit is refused or fails, the prop is
    // *still* the pre-drag value, so nothing is written and this node keeps showing a
    // position no other client has. The snap-back has to be pushed for the same reason the
    // clamp does. Losing the move visibly beats two clients silently disagreeing.
    void onDragEnd(id, clamped.x, clamped.y).then((snapBackTo) => {
      if (snapBackTo) node.position(snapBackTo)
    })
  }

  return (
    <Layer
      listening={listening}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      {shapes.map((shape) => {
        const holder = lockHolder(shape, myUid, liveUids)

        return (
          <Rectangle
            key={shape.id}
            shape={shape}
            // The soft lock, so a shape another live user is holding cannot be grabbed out
            // from under them [R10]. `holder === null` is exactly `canDrag`, reusing the
            // answer this loop already has.
            draggable={dragEnabled && holder === null}
            remote={remoteDrags.get(shape.id) ?? null}
            // The lock ring wins over the selection ring: being unable to move a shape is
            // more important to see than having it selected. `null` — a constant — for the
            // 499 that are neither.
            outline={outlineFor(holder, shape.id === selectedId)}
          />
        )
      })}
    </Layer>
  )
}

function outlineFor(holder: string | null, selected: boolean): Outline | null {
  if (holder) return { colour: generateUserColor(holder), ...LOCK_RING }
  if (selected) return SELECTED_OUTLINE
  return null
}

export const ShapesLayer = memo(ShapesLayerInner)
