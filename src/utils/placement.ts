import { PLACEMENT, WORLD } from './constants.ts'
import type { Point, Size } from './coords.ts'

export type PlacementGesture = {
  down: Point
  up: Point
  targetIsStage: boolean
}

export function shouldPlace({ down, up, targetIsStage }: PlacementGesture): boolean {
  if (!targetIsStage) return false

  const dx = up.x - down.x
  const dy = up.y - down.y

  return Math.hypot(dx, dy) < PLACEMENT.tolerancePx
}

export function clampShapeToWorld(
  shape: { x: number; y: number; w: number; h: number },
  world: Size = WORLD,
): Point {
  return {
    x: clampAxis(shape.x, shape.w, world.width),
    y: clampAxis(shape.y, shape.h, world.height),
  }
}

function clampAxis(position: number, extent: number, worldLength: number): number {
  const furthest = Math.max(0, worldLength - extent)
  return Math.min(Math.max(position, 0), furthest)
}
