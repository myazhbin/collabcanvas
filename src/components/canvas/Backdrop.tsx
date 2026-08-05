import { Rect, Shape } from 'react-konva'
import { GRID_MIN_SCREEN_PX, GRID_PITCHES, WORLD } from '../../utils/constants'
import { screenToWorld, type Size, type Viewport } from '../../utils/coords'

/**
 * The world's extent and a grid to make motion legible — without a reference, panning an
 * empty field reads as nothing happening.
 *
 * One `Rect` and one `Shape`, both static, and the whole thing belongs on a
 * `listening={false}` layer: 10,000 px of grid in the hit graph would make the Stage stop
 * being the event target, which is what PR 7's placement guard tests [R13].
 */
export function Backdrop({ viewport, size }: { viewport: Viewport; size: Size }) {
  const pitch = gridPitch(viewport.scale)
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
        // Konva scales stroke width with the stage, so a plain 1 turns into a 4 px slab
        // at 400% and vanishes at 10%.
        strokeWidth={1 / viewport.scale}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />

      <Shape
        stroke="#e5e5e5"
        strokeWidth={1 / viewport.scale}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        sceneFunc={(context, shape) => {
          // Only the lines actually on screen, clipped to the world. At 10% zoom the
          // whole world is in view, and drawing every 10 px line would be 1000 of them.
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

/** Coarsest pitch that still leaves the lines at least `GRID_MIN_SCREEN_PX` apart. A fixed
 *  pitch either turns solid when zoomed out or vanishes when zoomed in. */
function gridPitch(scale: number): number {
  return (
    GRID_PITCHES.find((pitch) => pitch * scale >= GRID_MIN_SCREEN_PX) ??
    GRID_PITCHES[GRID_PITCHES.length - 1]
  )
}
