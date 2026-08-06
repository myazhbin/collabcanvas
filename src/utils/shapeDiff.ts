import type { DragPayload, SessionNode, Shape } from './types.ts'

export type ShapeDiff = {
  shapes: Shape[]
  dragging: ReadonlySet<string>
}

export function shapeDiff(
  previous: Shape[],
  incoming: Shape[],
  dragging: ReadonlySet<string> = new Set(),
): ShapeDiff {
  const before = new Map(previous.map((s) => [s.id, s]))
  const next: Shape[] = []

  let changed = incoming.length !== previous.length

  for (let i = 0; i < incoming.length; i++) {
    const arriving = incoming[i]
    const held = before.get(arriving.id)

    if (!held) {
      next.push(arriving)
      changed = true
      continue
    }

    if (dragging.has(arriving.id) || isSameShape(held, arriving)) {
      next.push(held)
      if (previous[i] !== held) changed = true
      continue
    }

    next.push(arriving)
    changed = true
  }

  const survivors = new Set(incoming.map((s) => s.id))
  const kept = [...dragging].filter((id) => survivors.has(id))
  const nextDragging = kept.length === dragging.size ? dragging : new Set(kept)

  return { shapes: changed ? next : previous, dragging: nextDragging }
}

export function collectRemoteDrags(
  sessions: Record<string, Partial<Pick<SessionNode, 'drag'>> | null>,
  mySessionId: string,
): Map<string, Omit<DragPayload, 'id'>> {
  const drags = new Map<string, Omit<DragPayload, 'id'>>()

  for (const [key, node] of Object.entries(sessions)) {
    if (key === mySessionId) continue

    const drag = node?.drag
    if (!drag || typeof drag.id !== 'string') continue
    if (!Number.isFinite(drag.x) || !Number.isFinite(drag.y)) continue

    drags.set(drag.id, { x: drag.x, y: drag.y })
  }

  return drags
}

export function collectLiveUids(sessions: Record<string, SessionNode | null>): Set<string> {
  return new Set(
    Object.values(sessions)
      .map((node) => node?.uid)
      .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0),
  )
}

function isSameShape(a: Shape, b: Shape): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.fill === b.fill &&
    a.draggedBy === b.draggedBy &&
    a.updatedAt === b.updatedAt &&
    a.updatedBy === b.updatedBy &&
    a.createdBy === b.createdBy
  )
}
