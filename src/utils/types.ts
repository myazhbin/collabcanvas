export type Shape = {
  id: string
  x: number
  y: number
  w: number
  h: number
  fill: string
  createdBy: string
  updatedAt: number
  updatedBy: string
  draggedBy: string | null
}

export type CanvasDoc = {
  shapes: Shape[]
  seeded?: boolean
}

export type CursorPayload = { x: number; y: number; t: number }

export type DragPayload = { id: string; x: number; y: number }

export type SessionNode = {
  uid: string
  name: string
  colour: string
  cursor: CursorPayload | null
  drag: DragPayload | null
  lastSeen: number
}
