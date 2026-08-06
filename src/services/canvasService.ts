import { mutateDoc, mutateShapes, type TxResult } from './transactionService'
import {
  addShape,
  claimLock,
  commitPosition,
  releaseAllLocks,
  removeShape,
} from '../utils/shapeOps'
import type { Shape } from '../utils/types'

export function createShape(shape: Shape): Promise<TxResult> {
  return mutateShapes('create', (shapes) => addShape(shapes, shape))
}

export function commitShapePosition(
  id: string,
  x: number,
  y: number,
  uid: string,
): Promise<TxResult> {
  const updatedAt = Date.now()

  return mutateShapes('commit-position', (shapes) =>
    commitPosition(shapes, id, { x, y, updatedAt, updatedBy: uid }, uid),
  )
}

export function deleteShape(id: string): Promise<TxResult> {
  return mutateShapes('delete', (shapes) => removeShape(shapes, id))
}

export async function claimShapeLock(id: string, uid: string): Promise<boolean> {
  const result = await mutateShapes('claim-lock', (shapes) => claimLock(shapes, id, uid))
  if (!result.ok) return false

  return result.shapes.find((s) => s.id === id)?.draggedBy === uid
}

export function releaseMyLocks(uid: string): Promise<TxResult> {
  return mutateShapes('release-all-locks', (shapes) => releaseAllLocks(shapes, uid))
}

export function seedShapes(seed: Shape[]): Promise<TxResult> {
  return mutateShapes('seed', (shapes) => (seed.length === 0 ? shapes : [...shapes, ...seed]))
}

export function clearShapes(): Promise<TxResult> {
  return mutateShapes('clear-all', (shapes) => (shapes.length === 0 ? shapes : []))
}

export function ensureStarterShapes(starter: Shape[]): Promise<TxResult> {
  return mutateDoc('starter-seed', (doc) =>
    doc.seeded ? doc : { ...doc, shapes: [...doc.shapes, ...starter], seeded: true },
  )
}
