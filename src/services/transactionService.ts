import { doc, runTransaction } from 'firebase/firestore'
import { db } from './firebase'
import { CANVAS_ID } from '../utils/constants'
import { errorCode } from '../utils/errorCode'
import { createSerialQueue } from '../utils/serialQueue'
import type { CanvasDoc, Shape } from '../utils/types'

export const canvasRef = doc(db, 'canvas', CANVAS_ID)

export type TxResult = {
  ok: boolean
  applied: boolean
  shapes: Shape[]
}

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

const enqueue = createSerialQueue()

export function mutateShapes(
  label: string,
  body: (shapes: Shape[]) => Shape[],
): Promise<TxResult> {
  return mutateDoc(label, (doc) => {
    const shapes = body(doc.shapes)
    return shapes === doc.shapes ? doc : { ...doc, shapes }
  })
}

export function mutateDoc(label: string, body: (doc: CanvasDoc) => CanvasDoc): Promise<TxResult> {
  return enqueue(() => runWithRetries(label, body))
}

async function runWithRetries(
  label: string,
  body: (doc: CanvasDoc) => CanvasDoc,
): Promise<TxResult> {
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(canvasRef)
        const current: CanvasDoc = (snap.data() as CanvasDoc | undefined) ?? { shapes: [] }
        const next = body(current)

        if (next === current) return { ok: true, applied: false, shapes: current.shapes }

        if (snap.exists()) tx.update(canvasRef, { ...next })
        else tx.set(canvasRef, next)

        return { ok: true, applied: true, shapes: next.shapes }
      })
    } catch (err) {
      lastError = err
      if (!RETRYABLE.has(errorCode(err))) break

      const backoff = BACKOFF_BASE_MS * 2 ** attempt * (0.5 + Math.random())
      await new Promise((resolve) => setTimeout(resolve, backoff))
    }
  }

  console.error(
    `canvas transaction "${label}" failed after ${MAX_ATTEMPTS} attempts — the change was NOT saved`,
    lastError,
  )
  return { ok: false, applied: false, shapes: [] }
}
