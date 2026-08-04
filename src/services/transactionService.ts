import { doc, runTransaction } from 'firebase/firestore'
import { db } from './firebase'
import { CANVAS_ID } from '../utils/constants'
import type { CanvasDoc, Shape } from '../utils/types'

/**
 * The single write path to the canvas document.
 *
 * **Every** mutation goes through here, per Decision 8. The shapes array lives in one
 * document, so a plain `updateDoc` means two people editing *different* rectangles both
 * write the whole array and one change silently vanishes — and the soft lock does not help,
 * because it only guards the *same* shape [R23].
 *
 * The `body` must be **pure**. Firestore re-runs the callback whenever the document changes
 * underneath it, so anything with a side effect in there happens an unpredictable number of
 * times. All the bodies live in `shapeOps.ts`, tested against that property directly.
 */
export const canvasRef = doc(db, 'canvas', CANVAS_ID)

export type TxResult = {
  /** The transaction committed (or was a legitimate no-op). False means it threw. */
  ok: boolean
  /** Whether the body actually changed anything — false for a contended lock claim. */
  applied: boolean
  /** The array as committed, for callers that need to inspect the outcome. */
  shapes: Shape[]
}

export async function mutateShapes(
  label: string,
  body: (shapes: Shape[]) => Shape[],
): Promise<TxResult> {
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(canvasRef)
      const current = (snap.data() as CanvasDoc | undefined)?.shapes ?? []
      const next = body(current)

      // `shapeOps` returns the same reference when nothing changed, which makes a no-op
      // free to detect — and skipping the write matters: Firestore's Spark tier meters
      // writes daily, and a refused lock claim would otherwise still cost one [R14].
      if (next === current) return { ok: true, applied: false, shapes: current }

      // `set` rather than `update` when the document does not exist yet — `update` on a
      // missing document throws, and the very first shape on a fresh project would fail.
      if (snap.exists()) tx.update(canvasRef, { shapes: next })
      else tx.set(canvasRef, { shapes: next } satisfies CanvasDoc)

      return { ok: true, applied: true, shapes: next }
    })
  } catch (err) {
    // Every transaction is caught, without exception. Firestore gives up after a fixed
    // number of retries under contention and throws — and an uncaught rejection here is
    // indistinguishable from the write having silently done nothing, which is the most
    // expensive way for this to fail [R23].
    console.error(`canvas transaction "${label}" failed — the change was NOT saved`, err)
    return { ok: false, applied: false, shapes: [] }
  }
}
