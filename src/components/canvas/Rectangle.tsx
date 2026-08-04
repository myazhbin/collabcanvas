import { memo } from 'react'
import { Rect } from 'react-konva'
import type Konva from 'konva'
import { clampShapeToWorld } from '../../utils/placement'
import type { Shape } from '../../utils/types'

type RectangleProps = {
  shape: Shape
  selected: boolean
  /** False when another live user holds the soft lock [R10]. */
  draggable: boolean
  /** Colour of the lock holder, or null when the shape is free. */
  lockColour: string | null
  /** Live position from a remote session's drag channel, if one is dragging this shape. */
  remote: { x: number; y: number } | null
  /** Stage scale, so outlines are drawn at a constant screen width. */
  scale: number
  onSelect: (id: string) => void
  onDragStart: (id: string) => void
  onDragMove: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
}

/**
 * One rectangle on the shapes layer.
 *
 * Memoised, and that is what cashes in `shapeDiff`'s referential-identity guarantee: an
 * unchanged shape comes back as the *same object*, so this component's props compare equal
 * and React skips it. Without the memo a snapshot carrying one moved rectangle re-renders
 * all 500 [R7].
 *
 * **Position has two sources.** Normally the committed Firestore value. While a remote user
 * is dragging it, the live position off their session node — PRD §4.3's handoff. The raw
 * in-flight value is used deliberately: no smoothing here, unlike the cursor overlay, so
 * the rectangle tracks the remote pointer exactly rather than lagging it [R21].
 */
function RectangleInner({
  shape,
  selected,
  draggable,
  lockColour,
  remote,
  scale,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: RectangleProps) {
  const position = remote ?? { x: shape.x, y: shape.y }

  return (
    <Rect
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
      onMouseDown={() => onSelect(shape.id)}
      onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
        // Without this the event carries on up to the Stage, which is listening for the
        // start of a pan — so dragging a rectangle drags the whole canvas underneath it at
        // the same time, and the shape appears welded to the viewport [R13].
        e.cancelBubble = true
        onSelect(shape.id)
        onDragStart(shape.id)
      }}
      onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
        // Streams to RTDB at 20 Hz, never to Firestore [R14].
        onDragMove(shape.id, e.target.x(), e.target.y())
      }}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        // Pull the shape back inside the world before it is committed. Beyond the edge it
        // sits at a coordinate `clampViewport` will not let the viewport reach, so it
        // renders nowhere and can never be selected, moved or deleted again.
        const clamped = clampShapeToWorld({
          x: e.target.x(),
          y: e.target.y(),
          w: shape.w,
          h: shape.h,
        })

        // Moved here explicitly rather than left to the round trip. Konva owns this node's
        // position during a drag, and react-konva only writes `x`/`y` back when the *prop*
        // changes — so a shape dragged out and clamped to where it already started keeps
        // an unchanged prop, no update is pushed, and the node stays sitting out of bounds
        // even though the committed value is correct.
        e.target.position(clamped)

        onDragEnd(shape.id, clamped.x, clamped.y)
      }}
      // The lock outline wins over the selection outline: being unable to move a shape is
      // more important to see than having it selected.
      stroke={lockColour ?? (selected ? '#111827' : undefined)}
      // Konva multiplies stroke width by the stage scale, so a fixed 2 becomes an 8 px slab
      // at 400% and hairlines away at 10%. Dividing keeps it constant on screen.
      strokeWidth={lockColour ? 3 / scale : selected ? 2 / scale : 0}
      dash={lockColour ? [6 / scale, 4 / scale] : undefined}
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
