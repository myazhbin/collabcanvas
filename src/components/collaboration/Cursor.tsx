import { memo } from 'react'
import { worldToScreen } from '../../utils/coords'
import type { RemoteCursor } from '../../hooks/useCursors'

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

      <span className="cc-cursor-label" style={{ backgroundColor: cursor.colour }}>
        {cursor.name}
      </span>
    </div>
  )
}

export const Cursor = memo(
  CursorInner,
  (prev, next) =>
    prev.scale === next.scale &&
    prev.cursor.world.x === next.cursor.world.x &&
    prev.cursor.world.y === next.cursor.world.y &&
    prev.cursor.colour === next.cursor.colour &&
    prev.cursor.name === next.cursor.name,
)
