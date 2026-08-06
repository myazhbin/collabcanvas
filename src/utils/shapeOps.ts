import { PALETTE, SHAPE, WORLD } from './constants.ts'
import { clampShapeToWorld } from './placement.ts'
import { canDrag } from './shapeLocks.ts'
import type { Shape } from './types.ts'

export function addShape(shapes: Shape[], shape: Shape): Shape[] {
  if (shapes.some((s) => s.id === shape.id)) return shapes
  return [...shapes, shape]
}

export function patchShape(
  shapes: Shape[],
  id: string,
  fields: Partial<Omit<Shape, 'id'>>,
): Shape[] {
  const index = shapes.findIndex((s) => s.id === id)
  if (index === -1) return shapes

  const next = [...shapes]
  next[index] = { ...next[index], ...fields }
  return next
}

export function removeShape(shapes: Shape[], id: string): Shape[] {
  if (!shapes.some((s) => s.id === id)) return shapes
  return shapes.filter((s) => s.id !== id)
}

export function claimLock(shapes: Shape[], id: string, uid: string): Shape[] {
  const shape = shapes.find((s) => s.id === id)
  if (!shape || shape.draggedBy !== null) return shapes

  return patchShape(shapes, id, { draggedBy: uid })
}

export function releaseLock(shapes: Shape[], id: string, uid: string): Shape[] {
  const shape = shapes.find((s) => s.id === id)
  if (!shape || shape.draggedBy !== uid) return shapes

  return patchShape(shapes, id, { draggedBy: null })
}

export function commitPosition(
  shapes: Shape[],
  id: string,
  fields: Partial<Omit<Shape, 'id'>>,
  uid: string,
): Shape[] {
  const shape = shapes.find((s) => s.id === id)
  if (!shape) return shapes
  if (!canDrag(shape, uid)) return shapes

  return releaseLock(patchShape(shapes, id, fields), id, uid)
}

export function releaseAllLocks(shapes: Shape[], uid: string): Shape[] {
  if (!shapes.some((s) => s.draggedBy === uid)) return shapes
  return shapes.map((s) => (s.draggedBy === uid ? { ...s, draggedBy: null } : s))
}

const SEED_GUTTER = 30

const STARTER_COUNT = 4

const STARTER_GUTTER = 60

const BLOCK_SLOTS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
]

export const SHAPE_DOC_BYTES = 240

export const MAX_SHAPES = 4000

export function makeShape({
  id,
  x,
  y,
  colourIndex,
  uid,
  now,
}: {
  id: string
  x: number
  y: number
  colourIndex: number
  uid: string
  now: number
}): Shape {
  return {
    id,
    x,
    y,
    w: SHAPE.width,
    h: SHAPE.height,
    fill: PALETTE[colourIndex % PALETTE.length],
    createdBy: uid,
    updatedAt: now,
    updatedBy: uid,
    draggedBy: null,
  }
}

export type SeedOptions = {
  uid: string
  now: number
  idPrefix: string
  existing?: number
}

export function buildSeed(count: number, { uid, now, idPrefix, existing = 0 }: SeedOptions): Shape[] {
  const pitchX = SHAPE.width + SEED_GUTTER
  const pitchY = SHAPE.height + SEED_GUTTER

  const columns = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.ceil(count / columns)

  const freeX = Math.max(0, WORLD.width - columns * pitchX)
  const freeY = Math.max(0, WORLD.height - rows * pitchY)

  const [slotX, slotY] = BLOCK_SLOTS[blockSlot(existing, count)]
  const originX = freeX / 2 + slotX * (freeX / 2)
  const originY = freeY / 2 + slotY * (freeY / 2)

  return Array.from({ length: count }, (_, i) => {
    const column = i % columns
    const row = Math.floor(i / columns)

    const { x, y } = clampShapeToWorld({
      x: originX + column * pitchX,
      y: originY + row * pitchY,
      w: SHAPE.width,
      h: SHAPE.height,
    })

    return makeShape({ id: `${idPrefix}-${i}`, x, y, colourIndex: i, uid, now })
  })
}

export function buildStarter({ uid, now, idPrefix }: Omit<SeedOptions, 'existing'>): Shape[] {
  const pitchX = SHAPE.width + STARTER_GUTTER
  const pitchY = SHAPE.height + STARTER_GUTTER

  const originX = WORLD.width / 2 - (2 * pitchX - STARTER_GUTTER) / 2
  const originY = WORLD.height / 2 - (2 * pitchY - STARTER_GUTTER) / 2

  return Array.from({ length: STARTER_COUNT }, (_, i) =>
    makeShape({
      id: `${idPrefix}-${i}`,
      x: originX + (i % 2) * pitchX,
      y: originY + Math.floor(i / 2) * pitchY,
      colourIndex: i,
      uid,
      now,
    }),
  )
}

function blockSlot(existing: number, count: number): number {
  if (count <= 0) return 0
  return Math.floor(existing / count) % BLOCK_SLOTS.length
}
