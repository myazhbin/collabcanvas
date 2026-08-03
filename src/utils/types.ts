/** PRD §4.3. Firestore holds the durable shapes; RTDB holds the ephemeral session nodes. */

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
  /** uid holding the soft lock, or null when free [R10]. */
  draggedBy: string | null
}

/** `canvas/{CANVAS_ID}` — one document, whole array on every snapshot [R7]. */
export type CanvasDoc = { shapes: Shape[] }

/** `/sessions/{CANVAS_ID}/{sessionId}` — one node per tab. */
export type SessionNode = {
  uid: string
  name: string
  colour: string
  /** World coords, so viewports may differ [R3]. */
  cursor: { x: number; y: number } | null
  /** In-flight drag only; cleared after the Firestore commit lands. */
  drag: { id: string; x: number; y: number } | null
  /** RTDB serverTimestamp(), resolved to epoch ms by the server [R17]. */
  lastSeen: number
}
