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
 *
 * ### Contention is the thing this file has to survive
 *
 * One document means **every** write is a read-modify-write of the whole array, and two of
 * them per drag: `claim-lock` on grab, `commit-position` on release. Firestore's optimistic
 * concurrency then rejects any commit whose base version moved underneath it —
 * `failed-precondition: the stored version … does not match the required base version`.
 *
 * Measured on a 1,456-shape canvas with **one** user dragging: 48 drags produced **32 failed
 * commits and 32 failed lock claims**. Two thirds of the moves were silently lost, and each
 * loss stranded the dragging client showing a position nobody else had — plus a `draggedBy`
 * that was never released, so the rectangle stayed ringed and immovable for everyone.
 *
 * Two things fix that, and both are here rather than at the call sites:
 *
 * 1. **Writes from this client are serialised.** The contention above was almost entirely
 *    *self*-contention — the lock claim for one drag racing the commit of the previous one.
 *    A client cannot beat itself if only one of its transactions is ever in flight.
 * 2. **Retry with backoff.** The SDK retries a handful of times immediately, which is no use
 *    when the contention lasts longer than that. Backing off with jitter is what turns a
 *    genuinely contended write into a slow one instead of a lost one.
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

/**
 * Errors worth trying again. All of them mean "someone else got there first" or "the
 * backend is busy" — never "this write is invalid", which retrying could not help.
 */
const RETRYABLE = new Set([
  'aborted',
  'failed-precondition',
  'unavailable',
  'deadline-exceeded',
  'resource-exhausted',
  'cancelled',
  'internal',
])

const MAX_ATTEMPTS = 5
const BACKOFF_BASE_MS = 120

/**
 * The tail of this client's in-flight writes. Every mutation queues behind it, so exactly
 * one transaction from this tab is ever open against the canvas document.
 *
 * This is not a lock and it is not a substitute for the transaction — two *clients* still
 * contend, and Decision 8's transaction is what settles that [R23]. It only removes the
 * contention a client creates against itself, which is the kind that is both free to avoid
 * and, measured, most of it.
 */
let queue: Promise<unknown> = Promise.resolve()

/**
 * The common case: a body that only ever touches the shapes array. Everything except the
 * starter seed goes through here.
 */
export function mutateShapes(
  label: string,
  body: (shapes: Shape[]) => Shape[],
): Promise<TxResult> {
  return mutateDoc(label, (doc) => {
    const shapes = body(doc.shapes)
    // Preserving the same-reference-means-no-op contract one level up: `shapeOps` hands
    // back the identical array when nothing changed, and that has to keep meaning "do not
    // write" once it is wrapped in a document.
    return shapes === doc.shapes ? doc : { ...doc, shapes }
  })
}

/**
 * The general form, for the one write that has to change a field *beside* the array —
 * the starter seed, which sets `seeded` in the same transaction that adds the shapes. Two
 * separate writes would leave a window where a second client seeds again.
 */
export function mutateDoc(label: string, body: (doc: CanvasDoc) => CanvasDoc): Promise<TxResult> {
  const run = queue.then(
    () => attempt(label, body),
    () => attempt(label, body),
  )

  // The queue itself must never reject, or one failure would poison every later write.
  queue = run.catch(() => undefined)

  return run
}

async function attempt(label: string, body: (doc: CanvasDoc) => CanvasDoc): Promise<TxResult> {
  let lastError: unknown

  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(canvasRef)
        const current: CanvasDoc = (snap.data() as CanvasDoc | undefined) ?? { shapes: [] }
        const next = body(current)

        // The body returns the same reference when nothing changed, which makes a no-op
        // free to detect — and skipping the write matters: Firestore's Spark tier meters
        // writes daily, and a refused lock claim would otherwise still cost one [R14].
        if (next === current) return { ok: true, applied: false, shapes: current.shapes }

        // `set` rather than `update` when the document does not exist yet — `update` on a
        // missing document throws, and the very first shape on a fresh project would fail.
        if (snap.exists()) tx.update(canvasRef, { ...next })
        else tx.set(canvasRef, next)

        return { ok: true, applied: true, shapes: next.shapes }
      })
    } catch (err) {
      lastError = err
      if (!RETRYABLE.has(codeOf(err))) break

      // Exponential, with jitter. Without the jitter two clients that collide once tend to
      // collide again on the same schedule, which is how a burst of contention becomes a
      // standoff rather than a queue.
      const backoff = BACKOFF_BASE_MS * 2 ** n * (0.5 + Math.random())
      await new Promise((resolve) => setTimeout(resolve, backoff))
    }
  }

  // Every transaction is caught, without exception. An uncaught rejection here is
  // indistinguishable from the write having silently done nothing, which is the most
  // expensive way for this to fail [R23].
  console.error(
    `canvas transaction "${label}" failed after ${MAX_ATTEMPTS} attempts — the change was NOT saved`,
    lastError,
  )
  return { ok: false, applied: false, shapes: [] }
}

function codeOf(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : ''
}
