import type { Shape } from './types.ts'

export function lockHolder(
  shape: Pick<Shape, 'draggedBy'>,
  myUid: string | null,
  liveUids?: ReadonlySet<string>,
): string | null {
  const holder = shape.draggedBy

  if (holder == null || holder === myUid) return null

  return liveUids && !liveUids.has(holder) ? null : holder
}

export function canDrag(
  shape: Pick<Shape, 'draggedBy'>,
  myUid: string | null,
  liveUids?: ReadonlySet<string>,
): boolean {
  return lockHolder(shape, myUid, liveUids) === null
}
