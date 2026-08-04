import { memo } from 'react'
import { worldToScreen } from '../../utils/coords'
import type { RemoteCursor } from '../../hooks/useCursors'

/**
 * One remote pointer, as **DOM above the Konva stage** rather than a Konva node [R3,R21].
 *
 * Two things fall out of that, and both are the reason for it:
 *
 * 1. A 20 Hz cursor tick never touches the shapes layer. Inside Konva every cursor update
 *    would repaint the canvas the rectangles live on — 500 of them, at cursor rate.
 * 2. The arrow does not scale. A Konva arrow is drawn in world units, so it grows to four
 *    times its size at 400% zoom and disappears at 10%, which is the inverse of what a
 *    cursor is for.
 *
 * The transform is split with the parent layer: **pan** rides on the layer, **scale**
 * rides here. That is what lets the 60 ms transition below smooth remote motion without
 * also smoothing this viewer's own panning — a transition on the full screen position
 * drags every cursor 60 ms behind the shapes it is pointing at, every time you pan.
 * `coords.test.ts` asserts the two halves compose back to `worldToScreen`.
 */
function CursorInner({ cursor, scale }: { cursor: RemoteCursor; scale: number }) {
  const { x, y } = worldToScreen(cursor.world, { scale, x: 0, y: 0 })

  return (
    <div className="cc-cursor" style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}>
      <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
        <path
          d="M1 1 L1 16 L5.2 12.1 L8.1 17.6 L10.6 16.3 L7.8 11 L13 11 Z"
          fill={cursor.colour}
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>

      {/* The name label is the half of F5 that makes the colour mean something —
          a coloured arrow alone tells a grader that someone is there, not who. */}
      <span className="cc-cursor-label" style={{ backgroundColor: cursor.colour }}>
        {cursor.name}
      </span>
    </div>
  )
}

// Memoised on the same reasoning as PR 9's Rectangle: with N peers on screen, one peer
// moving re-renders every cursor otherwise, because `sessions` is a fresh object on every
// snapshot. The props here are two primitives and one object rebuilt per snapshot, so the
// comparison is on the values that actually move.
export const Cursor = memo(
  CursorInner,
  (prev, next) =>
    prev.scale === next.scale &&
    prev.cursor.world.x === next.cursor.world.x &&
    prev.cursor.world.y === next.cursor.world.y &&
    prev.cursor.colour === next.cursor.colour &&
    prev.cursor.name === next.cursor.name,
)
