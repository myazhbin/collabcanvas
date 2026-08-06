import { WORLD, ZOOM } from './constants.ts'

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }

export type Viewport = { scale: number; x: number; y: number }

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

function clampScale(scale: number): number {
  return Math.min(Math.max(scale, ZOOM.min), ZOOM.max)
}

export function zoomAtPoint(vp: Viewport, pointer: Point, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor)

  if (scale === vp.scale) return vp

  const anchor = screenToWorld(pointer, vp)
  return { scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { scale: vp.scale, x: vp.x + dx, y: vp.y + dy }
}

export function centreOn(target: Point, stage: Size, scale: number): Viewport {
  return {
    scale,
    x: stage.width / 2 - target.x * scale,
    y: stage.height / 2 - target.y * scale,
  }
}

export function clampViewport(vp: Viewport, stage: Size, world: Size = WORLD): Viewport {
  return {
    scale: vp.scale,
    x: clampAxis(vp.x, stage.width, world.width * vp.scale),
    y: clampAxis(vp.y, stage.height, world.height * vp.scale),
  }
}

function clampAxis(offset: number, stageLength: number, worldLength: number): number {
  if (worldLength <= stageLength) return (stageLength - worldLength) / 2

  return Math.min(Math.max(offset, stageLength - worldLength), 0)
}
