import { memo } from 'react'
import { Rect } from 'react-konva'
import type { Shape } from '../../utils/types'

/**
 * The selection or lock ring.
 *
 * Widths are **screen pixels, not world units** — `strokeScaleEnabled={false}` below is
 * what makes that true, and it is the reason nothing on this layer depends on the stage
 * scale. The obvious alternative, dividing the width by the scale at render time, works
 * visually and costs a `scale` prop on all 500 rectangles: the memoised layer above then
 * re-renders every one of them on every tick of a pinch, to recompute a stroke width that
 * 499 of them never draw. Measured at 508 shapes, that was ~50 ms of React reconciliation
 * per zoom tick and it is now zero [R7].
 */
export type Outline = {
  colour: string
  /** Screen pixels. Constant at every zoom level — see `strokeScaleEnabled` below. */
  width: number
  dash?: number[]
}

type RectangleProps = {
  shape: Shape
  /** False when another live user holds the soft lock [R10]. */
  draggable: boolean
  /** Live position from a remote session's drag channel, if one is dragging this shape. */
  remote: { x: number; y: number } | null
  outline: Outline | null
}

/**
 * One rectangle on the shapes layer — a leaf node with no handlers and no callbacks.
 *
 * **Events are delegated to the layer**, so 500 rectangles cost zero closures per render
 * rather than 2,000. Konva bubbles `mousedown` and the three drag events from the shape up
 * through its layer, and `id` carries the identity back down — one listener per event does
 * the work of five hundred. See `ShapesLayer`.
 *
 * Memoised, and that is what cashes in `shapeDiff`'s referential-identity guarantee: an
 * unchanged shape comes back as the *same object*, so these props compare equal and React
 * skips it. Without the memo a snapshot carrying one moved rectangle re-renders all 500
 * [R7]. The props are kept deliberately few and deliberately stable for the same reason —
 * every one of them is either the shape itself or `null` in the common case.
 *
 * **Position has two sources.** Normally the committed Firestore value. While a remote user
 * is dragging it, the live position off their session node — PRD §4.3's handoff. The raw
 * in-flight value is used deliberately: no smoothing here, unlike the cursor overlay, so
 * the rectangle tracks the remote pointer exactly rather than lagging it [R21].
 */
function RectangleInner({ shape, draggable, remote, outline }: RectangleProps) {
  const position = remote ?? { x: shape.x, y: shape.y }

  return (
    <Rect
      // Konva's own id, and the only thing the layer's delegated handlers need to map an
      // event back to a shape.
      id={shape.id}
      // Keyed off the remote position so Konva re-reads it every frame of someone else's
      // drag. During your own drag Konva owns the node and these props are ignored, which
      // is exactly what echo suppression upstream is protecting.
      x={position.x}
      y={position.y}
      width={shape.w}
      height={shape.h}
      fill={shape.fill}
      cornerRadius={4}
      draggable={draggable}
      // The ring stays a property of the shape rather than a node on an overlay layer:
      // during your own drag Konva owns this node's position and React never hears about
      // it, so an outline drawn anywhere else would sit at the pre-drag position for the
      // whole gesture. Drawn here it follows for free.
      stroke={outline?.colour}
      strokeWidth={outline?.width ?? 0}
      dash={outline?.dash}
      // Konva multiplies stroke width by the stage transform, so a plain 2 is an 8 px slab
      // at 400% and a hairline at 10%. Turning that off is what keeps the ring a constant
      // 2 px on screen **without** the scale ever reaching this component — verified
      // against painted pixels at 100%, 200% and 400%, which all measured exactly 3 px on
      // a 3 px stroke.
      strokeScaleEnabled={false}
      // Both off for every Rect [R7]. `perfectDrawEnabled` forces an offscreen buffer per
      // shape and `shadowForStrokeEnabled` costs an extra pass on a stroke casting no
      // shadow — at 500 shapes they are the difference between a smooth drag and a
      // slideshow.
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
    />
  )
}

export const Rectangle = memo(RectangleInner)
