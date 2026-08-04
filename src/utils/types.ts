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

/**
 * A cursor position on the wire.
 *
 * `t` is the moment the sample was *taken*, not the moment it was sent, and it is
 * corrected to server time with `.info/serverTimeOffset` before it goes out — the same
 * trick the staleness filter uses [R17], for the same reason: two machines' `Date.now()`
 * differ by an arbitrary amount, so a raw client clock subtracted on the receiving end
 * measures clock skew rather than latency.
 *
 * Stamping at sample time is deliberate. F5 warns against recording the <50 ms target as
 * met on the strength of the send interval: 20 Hz adds up to 50 ms of sampling delay
 * *before* the wire, and stamping at send time would hide exactly that.
 */
export type CursorPayload = { x: number; y: number; t: number }

/** `/sessions/{CANVAS_ID}/{sessionId}` — one node per tab. */
export type SessionNode = {
  uid: string
  name: string
  colour: string
  /** World coords, so viewports may differ [R3]. */
  cursor: CursorPayload | null
  /** In-flight drag only; cleared after the Firestore commit lands. */
  drag: { id: string; x: number; y: number } | null
  /** RTDB serverTimestamp(), resolved to epoch ms by the server [R17]. */
  lastSeen: number
}
