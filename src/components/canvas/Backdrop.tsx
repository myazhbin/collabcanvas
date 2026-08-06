import { Rect, Shape } from 'react-konva'
import { GRID_MIN_SCREEN_PX, GRID_PITCHES, WORLD } from '../../utils/constants'
import { screenToWorld, type Size, type Viewport } from '../../utils/coords'

export function Backdrop({ viewport, size }: { viewport: Viewport; size: Size }) {
  const pitch = gridPitch(viewport.scale)
  const hairline = 1 / viewport.scale
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport)
  const bottomRight = screenToWorld({ x: size.width, y: size.height }, viewport)

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={WORLD.width}
        height={WORLD.height}
        fill="#ffffff"
        stroke="#a3a3a3"
        strokeWidth={hairline}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />

      <Shape
        stroke="#e5e5e5"
        strokeWidth={hairline}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        sceneFunc={(context, shape) => {
          const x0 = Math.max(Math.floor(topLeft.x / pitch) * pitch, 0)
          const y0 = Math.max(Math.floor(topLeft.y / pitch) * pitch, 0)
          const x1 = Math.min(bottomRight.x, WORLD.width)
          const y1 = Math.min(bottomRight.y, WORLD.height)

          context.beginPath()
          for (let x = x0; x <= x1; x += pitch) {
            context.moveTo(x, Math.max(topLeft.y, 0))
            context.lineTo(x, y1)
          }
          for (let y = y0; y <= y1; y += pitch) {
            context.moveTo(Math.max(topLeft.x, 0), y)
            context.lineTo(x1, y)
          }
          context.fillStrokeShape(shape)
        }}
      />
    </>
  )
}

function gridPitch(scale: number): number {
  return (
    GRID_PITCHES.find((pitch) => pitch * scale >= GRID_MIN_SCREEN_PX) ??
    GRID_PITCHES[GRID_PITCHES.length - 1]
  )
}
