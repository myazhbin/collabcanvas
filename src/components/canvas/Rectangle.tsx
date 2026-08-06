import { memo } from 'react'
import { Rect } from 'react-konva'
import type { Shape } from '../../utils/types'

export type Outline = {
  colour: string
  width: number
  dash?: number[]
}

type RectangleProps = {
  shape: Shape
  draggable: boolean
  remote: { x: number; y: number } | null
  outline: Outline | null
}

function RectangleInner({ shape, draggable, remote, outline }: RectangleProps) {
  const position = remote ?? { x: shape.x, y: shape.y }

  return (
    <Rect
      id={shape.id}
      x={position.x}
      y={position.y}
      width={shape.w}
      height={shape.h}
      fill={shape.fill}
      cornerRadius={4}
      draggable={draggable}
      stroke={outline?.colour}
      strokeWidth={outline?.width ?? 0}
      dash={outline?.dash}
      strokeScaleEnabled={false}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
    />
  )
}

export const Rectangle = memo(RectangleInner)
