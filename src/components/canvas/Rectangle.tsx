import { memo } from 'react'
import { Rect } from 'react-konva'
import type Konva from 'konva'
import type { Shape } from '../../utils/types'

type RectangleProps = {
  shape: Shape
  selected: boolean
  draggable: boolean
  /** Stage scale, so the selection outline can be drawn at a constant screen width. */
  scale: number
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}

/**
 * One rectangle on the shapes layer.
 *
 * Memoised, and that is not premature: `shapeDiff` in PR 8 exists specifically to hand
 * unchanged shapes back with their previous object reference, and this `memo` is what
 * converts that guarantee into skipped renders. Without it a snapshot carrying one moved
 * rectangle re-renders all 500 [R7].
 */
function RectangleInner({ shape, selected, draggable, scale, onSelect, onMove }: RectangleProps) {
  return (
    <Rect
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      fill={shape.fill}
      cornerRadius={4}
      draggable={draggable}
      onMouseDown={() => onSelect(shape.id)}
      onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
        // Without this the event carries on up to the Stage, which is listening for the
        // start of a pan — so dragging a rectangle drags the whole canvas underneath it
        // at the same time, and the shape appears welded to the viewport [R13].
        e.cancelBubble = true
        onSelect(shape.id)
      }}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        // Konva has already moved the node; this reads the result back into state rather
        // than driving the position during the drag. PR 8 turns this single commit into
        // the transactional write, which is why the in-flight frames stay local.
        onMove(shape.id, e.target.x(), e.target.y())
      }}
      stroke={selected ? '#111827' : undefined}
      // Konva multiplies stroke width by the stage scale, so a fixed 2 becomes an 8 px
      // slab at 400% and hairlines away to nothing at 10%. Dividing keeps the selection
      // outline the same weight at every zoom, like the backdrop's grid.
      strokeWidth={selected ? 2 / scale : 0}
      // Both off for every Rect [R7]. `perfectDrawEnabled` forces an offscreen buffer per
      // shape, and `shadowForStrokeEnabled` costs an extra pass on a stroke that casts no
      // shadow — neither buys anything here, and at 500 shapes they are the difference
      // between a smooth drag and a slideshow.
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
    />
  )
}

export const Rectangle = memo(RectangleInner)
