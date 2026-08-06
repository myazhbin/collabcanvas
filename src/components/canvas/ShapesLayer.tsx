import { memo } from 'react'
import { Layer } from 'react-konva'
import type Konva from 'konva'
import { Rectangle, type Outline } from './Rectangle'
import { clampShapeToWorld } from '../../utils/placement'
import { userColour } from '../../utils/helpers'
import { lockHolder } from '../../utils/shapeLocks'
import type { Shape } from '../../utils/types'

const SELECTED_OUTLINE: Outline = { colour: '#111827', width: 2 }
const LOCK_RING = { width: 3, dash: [6, 4] }

type ShapesLayerProps = {
  shapes: Shape[]
  selectedId: string | null
  myUid: string | null
  liveUids: ReadonlySet<string>
  remoteDrags: ReadonlyMap<string, { x: number; y: number }>
  dragEnabled: boolean
  listening: boolean
  onSelect: (id: string) => void
  onDragStart: (id: string) => void
  onDragMove: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => Promise<{ x: number; y: number } | null>
}

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
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const id = e.target.id()
    if (id) onSelect(id)
  }

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true

    const id = e.target.id()
    if (!id) return
    onSelect(id)
    onDragStart(id)
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const id = e.target.id()
    if (id) onDragMove(id, e.target.x(), e.target.y())
  }

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const id = e.target.id()
    if (!id) return

    const clamped = clampShapeToWorld({
      x: e.target.x(),
      y: e.target.y(),
      w: e.target.width(),
      h: e.target.height(),
    })

    const node = e.target
    node.position(clamped)

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
            draggable={dragEnabled && holder === null}
            remote={remoteDrags.get(shape.id) ?? null}
            outline={outlineFor(holder, shape.id === selectedId)}
          />
        )
      })}
    </Layer>
  )
}

function outlineFor(holder: string | null, selected: boolean): Outline | null {
  if (holder) return { colour: userColour(holder), ...LOCK_RING }
  if (selected) return SELECTED_OUTLINE
  return null
}

export const ShapesLayer = memo(ShapesLayerInner)
